#include <windows.h>
#include <audioclient.h>
#include <ksmedia.h>
#include <mmdeviceapi.h>

#include "loopback.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <mutex>
#include <thread>

namespace notch::audio {
namespace {

constexpr std::size_t kSampleBufferSize = 2048;
constexpr double kDisplayGain = 4.0;

template <typename T>
struct ComReleaser {
  void operator()(T* value) const noexcept {
    if (value) value->Release();
  }
};

template <typename T>
using ComPtr = std::unique_ptr<T, ComReleaser<T>>;

float DecodeSample(const BYTE* data, WORD bits, bool isFloat) {
  if (isFloat && bits == 32) {
    float value = 0;
    std::memcpy(&value, data, sizeof(value));
    return std::isfinite(value) ? std::clamp(value, -1.0f, 1.0f) : 0.0f;
  }
  if (bits == 8) return (static_cast<float>(*data) - 128.0f) / 128.0f;
  if (bits == 16) {
    std::int16_t value = 0;
    std::memcpy(&value, data, sizeof(value));
    return static_cast<float>(value) / 32768.0f;
  }
  if (bits == 24) {
    std::int32_t value = static_cast<std::int32_t>(data[0]) |
                         (static_cast<std::int32_t>(data[1]) << 8) |
                         (static_cast<std::int32_t>(data[2]) << 16);
    if (value & 0x800000) value |= static_cast<std::int32_t>(0xff000000);
    return static_cast<float>(value) / 8388608.0f;
  }
  if (bits == 32) {
    std::int32_t value = 0;
    std::memcpy(&value, data, sizeof(value));
    return static_cast<float>(static_cast<double>(value) / 2147483648.0);
  }
  return 0.0f;
}

class LoopbackCapture {
 public:
  ~LoopbackCapture() { Stop(); }

  bool Start() {
    std::lock_guard<std::mutex> lock(lifecycleMutex_);
    if (running_.load()) return true;
    running_.store(true);
    try {
      worker_ = std::thread(&LoopbackCapture::Run, this);
      return true;
    } catch (...) {
      running_.store(false);
      return false;
    }
  }

  void Stop() {
    std::lock_guard<std::mutex> lock(lifecycleMutex_);
    running_.store(false);
    if (worker_.joinable()) worker_.join();
    std::lock_guard<std::mutex> samplesLock(samplesMutex_);
    samples_.fill(0.0f);
    sampleCount_ = 0;
    writePosition_ = 0;
  }

  VisualizerLevels Levels() {
    VisualizerLevels levels{};
    std::lock_guard<std::mutex> lock(samplesMutex_);
    if (sampleCount_ == 0) return levels;

    const std::size_t start = (writePosition_ + samples_.size() - sampleCount_) % samples_.size();
    for (std::size_t bar = 0; bar < levels.size(); ++bar) {
      const std::size_t from = bar * sampleCount_ / levels.size();
      const std::size_t to = std::max(from + 1, (bar + 1) * sampleCount_ / levels.size());
      float peak = 0.0f;
      for (std::size_t i = from; i < to; ++i) {
        peak = std::max(peak, samples_[(start + i) % samples_.size()]);
      }
      levels[bar] = std::clamp(static_cast<double>(peak) * kDisplayGain, 0.0, 1.0);
    }
    return levels;
  }

 private:
  void Append(float sample) {
    std::lock_guard<std::mutex> lock(samplesMutex_);
    samples_[writePosition_] = std::abs(sample);
    writePosition_ = (writePosition_ + 1) % samples_.size();
    sampleCount_ = std::min(sampleCount_ + 1, samples_.size());
  }

  void Run() {
    while (running_.load()) {
      const HRESULT comStatus = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
      if (FAILED(comStatus)) {
        Sleep(500);
        continue;
      }
      while (running_.load() && !CaptureSession()) Sleep(250);
      CoUninitialize();
    }
  }

  bool CaptureSession() {
    IMMDeviceEnumerator* rawEnumerator = nullptr;
    HRESULT result = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                      __uuidof(IMMDeviceEnumerator),
                                      reinterpret_cast<void**>(&rawEnumerator));
    if (FAILED(result)) return false;
    ComPtr<IMMDeviceEnumerator> enumerator(rawEnumerator);

    IMMDevice* rawDevice = nullptr;
    result = enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, &rawDevice);
    if (FAILED(result)) return false;
    ComPtr<IMMDevice> device(rawDevice);

    IAudioClient* rawClient = nullptr;
    result = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
                              reinterpret_cast<void**>(&rawClient));
    if (FAILED(result)) return false;
    ComPtr<IAudioClient> client(rawClient);

    WAVEFORMATEX* rawFormat = nullptr;
    result = client->GetMixFormat(&rawFormat);
    if (FAILED(result) || !rawFormat) return false;
    std::unique_ptr<WAVEFORMATEX, decltype(&CoTaskMemFree)> format(rawFormat, &CoTaskMemFree);

    const WORD channels = format->nChannels;
    const WORD bits = format->wBitsPerSample;
    bool isFloat = format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT;
    if (format->wFormatTag == WAVE_FORMAT_EXTENSIBLE &&
        format->cbSize >= sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX)) {
      const auto* extended = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format.get());
      isFloat = IsEqualGUID(extended->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
    }
    const std::size_t bytesPerSample = bits / 8;
    if (!channels || !bytesPerSample) return false;

    result = client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
                                1000000, 0, format.get(), nullptr);
    if (FAILED(result)) return false;

    IAudioCaptureClient* rawCapture = nullptr;
    result = client->GetService(__uuidof(IAudioCaptureClient),
                                reinterpret_cast<void**>(&rawCapture));
    if (FAILED(result)) return false;
    ComPtr<IAudioCaptureClient> capture(rawCapture);

    result = client->Start();
    if (FAILED(result)) return false;

    while (running_.load()) {
      UINT32 packetFrames = 0;
      result = capture->GetNextPacketSize(&packetFrames);
      if (FAILED(result)) break;
      if (!packetFrames) {
        Sleep(4);
        continue;
      }

      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      result = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(result)) break;
      for (UINT32 frame = 0; frame < frames; ++frame) {
        float peak = 0.0f;
        if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && data) {
          for (WORD channel = 0; channel < channels; ++channel) {
            const BYTE* sample = data + (static_cast<std::size_t>(frame) * channels + channel) * bytesPerSample;
            peak = std::max(peak, std::abs(DecodeSample(sample, bits, isFloat)));
          }
        }
        Append(peak);
      }
      capture->ReleaseBuffer(frames);
    }

    client->Stop();
    return SUCCEEDED(result);
  }

  std::atomic<bool> running_{false};
  std::thread worker_;
  std::mutex lifecycleMutex_;
  std::mutex samplesMutex_;
  std::array<float, kSampleBufferSize> samples_{};
  std::size_t sampleCount_ = 0;
  std::size_t writePosition_ = 0;
};

LoopbackCapture& Capture() {
  static LoopbackCapture capture;
  return capture;
}

}

bool StartLoopbackCapture() { return Capture().Start(); }
void StopLoopbackCapture() { Capture().Stop(); }
VisualizerLevels GetLoopbackLevels() { return Capture().Levels(); }

}
