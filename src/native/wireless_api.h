#pragma once

#include <string>
#include <vector>

namespace notch::wireless {

enum class WirelessRadio {
  WiFi,
  Bluetooth
};

struct RadioStatus {
  bool available{};
  bool enabled{};
  std::string error;
};

struct WifiState {
  bool available{};
  bool radioAvailable{};
  bool enabled{};
  bool connected{};
  std::string name;
  std::string interfaceName;
  std::string radioError;
};

RadioStatus GetRadioState(WirelessRadio kind);
void SetRadio(const std::wstring& name, bool enabled);

WifiState GetWifiState();
std::vector<std::string> ScanWifiNetworks();
void ConnectWifi(const std::wstring& ssid, const std::wstring& password);
void DisconnectWifi();

std::string ScanBluetoothDevices(bool includeNearby);
std::string PairBluetoothDevice(const std::wstring& id);

std::string SerializeWirelessState(const WifiState& wifi, const RadioStatus& bluetooth);
std::string SerializeNetworks(const std::vector<std::string>& networks);

}
