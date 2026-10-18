#include "wireless_api.h"
#include "wireless_common.h"

#include <stdexcept>

#include <winrt/Windows.Devices.Radios.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>

using namespace winrt;
using namespace Windows::Devices::Radios;

namespace notch::wireless {
namespace {

Radio FindRadio(WirelessRadio kind, bool* available) {
  const auto radios = Radio::GetRadiosAsync().get();
  for (const auto& radio : radios) {
    if ((kind == WirelessRadio::WiFi && radio.Kind() == Windows::Devices::Radios::RadioKind::WiFi) ||
        (kind == WirelessRadio::Bluetooth && radio.Kind() == Windows::Devices::Radios::RadioKind::Bluetooth)) {
      *available = true;
      return radio;
    }
  }
  *available = false;
  return nullptr;
}

bool RadioEnabled(WirelessRadio kind, bool* available) {
  const auto radio = FindRadio(kind, available);
  return *available && radio.State() == RadioState::On;
}



}

RadioStatus GetRadioState(WirelessRadio kind) {
  try {
    RadioStatus state;
    state.enabled = RadioEnabled(kind, &state.available);
    return state;
  } catch (const hresult_error& error) {
    return {false, false, ToUtf8(error.message().c_str())};
  }
}

void SetRadio(const std::wstring& name, bool enabled) {
  WirelessRadio kind;
  if (name == L"WiFi") kind = WirelessRadio::WiFi;
  else if (name == L"Bluetooth") kind = WirelessRadio::Bluetooth;
  else throw std::runtime_error("Unsupported radio");
  const auto access = Radio::RequestAccessAsync().get();
  if (access != RadioAccessStatus::Allowed) throw std::runtime_error("Windows denied access to the radio");
  bool available = false;
  const auto radio = FindRadio(kind, &available);
  if (!available) throw std::runtime_error("The requested wireless radio is unavailable");
  const auto status = radio.SetStateAsync(enabled ? RadioState::On : RadioState::Off).get();
  if (status != RadioAccessStatus::Allowed) throw std::runtime_error("Windows could not change the radio state");
}

}
