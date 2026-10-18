#include "../../wireless/native/wireless_api.h"
#include "../../wireless/native/wireless_common.h"

#include <atomic>
#include <map>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>

#include <windows.h>
#include <combaseapi.h>

#include <winrt/Windows.Devices.Bluetooth.h>
#include <winrt/Windows.Devices.Enumeration.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>

// Present in modern SDKs, but keep a numeric fallback so the build does not
// depend on the exact SDK header that declares this COM wait flag.
#ifndef COWAIT_DISPATCH_CALLBACKS
#define COWAIT_DISPATCH_CALLBACKS 0x8
#endif

using namespace winrt;
using namespace Windows::Devices::Bluetooth;
using namespace Windows::Devices::Enumeration;

namespace notch::wireless {
namespace {

// Serialize one device. Paired devices get an extra round-trip so the panel can
// report whether Windows currently considers them connected; nearby devices are
// reported as available-to-pair instead.
std::string DeviceJson(const DeviceInformation& info, bool paired, bool lowEnergy) {
  const bool canPair = !paired && info.Pairing().CanPair();
  bool connected = false;
  bool connectionStatusKnown = !paired;
  if (paired) {
    try {
      if (lowEnergy) {
        const auto device = BluetoothLEDevice::FromIdAsync(info.Id()).get();
        connected = device && device.ConnectionStatus() == BluetoothConnectionStatus::Connected;
      } else {
        const auto device = BluetoothDevice::FromIdAsync(info.Id()).get();
        connected = device && device.ConnectionStatus() == BluetoothConnectionStatus::Connected;
      }
      connectionStatusKnown = true;
    } catch (const hresult_error&) {
      connectionStatusKnown = false;
    }
  }
  return "{\"id\":" + Json(info.Id().c_str()) +
      ",\"name\":" + Json(info.Name().c_str()) +
      ",\"paired\":" + (paired ? "true" : "false") +
      ",\"canPair\":" + (canPair ? "true" : "false") +
      ",\"connected\":" + (connectionStatusKnown ? (connected ? "true" : "false") : "null") + "}";
}

struct BluetoothScan {
  std::mutex mutex;
  std::map<std::wstring, std::string> devices;

  void Add(const DeviceInformation& info, bool paired, bool lowEnergy) {
    if (info.Name().empty()) return;
    const std::string item = DeviceJson(info, paired, lowEnergy);
    std::scoped_lock lock(mutex);
    devices[info.Id().c_str()] = item;
  }
};

void DiscoverOnDedicatedThread(BluetoothScan* scan, bool includeNearby) {
  // The device watcher delivers its discovery callbacks through the thread's
  // apartment, so this worker needs a single-threaded apartment that we pump
  // below. Running it on a dedicated thread keeps the reusable libuv worker
  // threads free to stay multi-threaded.
  const bool apartmentReady = [] {
    try { init_apartment(apartment_type::single_threaded); return true; }
    catch (const hresult_error&) { return false; }
  }();

  // Paired devices resolve quickly and are always shown, even if nearby
  // discovery below is slow or returns nothing.
  try {
    for (bool lowEnergy : {false, true}) {
      const auto selector = lowEnergy
          ? BluetoothLEDevice::GetDeviceSelectorFromPairingState(true)
          : BluetoothDevice::GetDeviceSelectorFromPairingState(true);
      for (const auto& info : DeviceInformation::FindAllAsync(selector).get()) {
        scan->Add(info, true, lowEnergy);
      }
    }
  } catch (const hresult_error&) {}

  // FindAllAsync on the unpaired selectors waits for a complete Windows
  // discovery cycle, which can take ~30s per transport. A bounded watcher lets
  // us stop after a short, predictable window instead. Only run it when the
  // caller explicitly asked for nearby devices, so opening the panel is instant.
  if (includeNearby) try {
    DeviceWatcher classic = DeviceInformation::CreateWatcher(BluetoothDevice::GetDeviceSelectorFromPairingState(false));
    DeviceWatcher lowEnergy = DeviceInformation::CreateWatcher(BluetoothLEDevice::GetDeviceSelectorFromPairingState(false));
    classic.Added([scan](const DeviceWatcher&, const DeviceInformation& info) { scan->Add(info, false, false); });
    lowEnergy.Added([scan](const DeviceWatcher&, const DeviceInformation& info) { scan->Add(info, false, true); });

    classic.Start();
    lowEnergy.Start();

    const ULONGLONG deadline = GetTickCount64() + 6000;
    while (apartmentReady && GetTickCount64() < deadline) {
      DWORD index = 0;
      CoWaitForMultipleObjects(COWAIT_DISPATCH_CALLBACKS, 120, 0, nullptr, &index);
    }

    classic.Stop();
    lowEnergy.Stop();
    // Drain callbacks that were already queued when we stopped observing.
    for (int i = 0; i < 3; ++i) {
      DWORD index = 0;
      CoWaitForMultipleObjects(COWAIT_DISPATCH_CALLBACKS, 60, 0, nullptr, &index);
    }
  } catch (const hresult_error&) {}

  if (apartmentReady) {
    try { uninit_apartment(); } catch (...) {}
  }
}

}

std::string ScanBluetoothDevices(bool includeNearby) {
  BluetoothScan scan;
  std::thread worker(DiscoverOnDedicatedThread, &scan, includeNearby);
  worker.join();

  std::scoped_lock lock(scan.mutex);
  std::string result = "[";
  bool first = true;
  for (const auto& item : scan.devices) {
    if (!first) result += ',';
    result += item.second;
    first = false;
  }
  return result + "]";
}

std::string PairBluetoothDevice(const std::wstring& id) {
  const auto device = DeviceInformation::CreateFromIdAsync(id).get();
  if (!device.Pairing().CanPair()) throw std::runtime_error("This Bluetooth device cannot be paired");
  const auto result = device.Pairing().PairAsync().get();
  if (result.Status() != DevicePairingResultStatus::Paired &&
      result.Status() != DevicePairingResultStatus::AlreadyPaired) {
    throw std::runtime_error("Windows could not pair this Bluetooth device (status " +
        std::to_string(static_cast<int>(result.Status())) + ")");
  }
  return "{\"name\":" + Json(device.Name().c_str()) + ",\"status\":\"Paired\"}";
}

}
