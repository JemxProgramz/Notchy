#include "wireless_api.h"
#include "wireless_common.h"

namespace notch::wireless {

std::string SerializeWirelessState(const WifiState& wifi, const RadioStatus& bluetooth) {
  const std::string wifiJson = std::string("{\"available\":") + (wifi.available ? "true" : "false") +
      ",\"radioAvailable\":" + (wifi.radioAvailable ? "true" : "false") +
      ",\"enabled\":" + (wifi.enabled ? "true" : "false") +
      ",\"radioError\":" + (wifi.radioError.empty() ? "null" : Json(wifi.radioError)) +
      ",\"connected\":" + (wifi.connected ? "true" : "false") +
      ",\"name\":" + (wifi.connected ? Json(wifi.name) : "null") +
      ",\"interfaceName\":" + (wifi.available ? Json(wifi.interfaceName) : "null") + ",\"networks\":[]}";
  const std::string bluetoothJson = std::string("{\"available\":") + (bluetooth.available ? "true" : "false") +
      ",\"enabled\":" + (bluetooth.enabled ? "true" : "false") +
      ",\"error\":" + (bluetooth.error.empty() ? "null" : Json(bluetooth.error)) + ",\"devices\":[]}";
  return "{\"wifi\":" + wifiJson + ",\"bluetooth\":" + bluetoothJson + "}";
}

std::string SerializeNetworks(const std::vector<std::string>& networks) {
  std::string result = "[";
  for (size_t i = 0; i < networks.size(); ++i) {
    if (i) result += ',';
    result += networks[i];
  }
  return result + ']';
}

}
