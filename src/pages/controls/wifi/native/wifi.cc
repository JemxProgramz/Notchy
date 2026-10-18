#include "../../wireless/native/wireless_api.h"
#include "../../wireless/native/wireless_common.h"

#include <algorithm>
#include <atomic>
#include <cwctype>
#include <map>
#include <stdexcept>
#include <utility>
#include <vector>

namespace notch::wireless {
namespace {

struct ScanNotification {
  HANDLE event{};
  std::atomic<DWORD> failure{};
};

void WINAPI OnWlanNotification(PWLAN_NOTIFICATION_DATA notification, PVOID context) {
  if (!notification || !context) return;
  if (notification->NotificationCode == wlan_notification_acm_scan_fail) {
    auto* scan = static_cast<ScanNotification*>(context);
    scan->failure = notification->pData && notification->dwDataSize >= sizeof(DWORD)
        ? *static_cast<const DWORD*>(notification->pData) : ERROR_GEN_FAILURE;
    SetEvent(scan->event);
  } else if (notification->NotificationCode == wlan_notification_acm_scan_complete) {
    auto* scan = static_cast<ScanNotification*>(context);
    SetEvent(scan->event);
  }
}

class WlanSession {
 public:
  WlanSession() {
    DWORD version = 0;
    CheckWlan(WlanOpenHandle(2, nullptr, &version, &handle_), "Opening the Windows Wi-Fi service");
    PWLAN_INTERFACE_INFO_LIST list = nullptr;
    const DWORD result = WlanEnumInterfaces(handle_, nullptr, &list);
    if (result != ERROR_SUCCESS) {
      WlanCloseHandle(handle_, nullptr);
      handle_ = nullptr;
      CheckWlan(result, "Enumerating Wi-Fi adapters");
    }
    if (list && list->dwNumberOfItems) {
      interface_ = list->InterfaceInfo[0];
      available_ = true;
    }
    if (list) WlanFreeMemory(list);
  }

  ~WlanSession() {
    if (handle_) WlanCloseHandle(handle_, nullptr);
  }

  bool Available() const { return available_; }
  HANDLE Handle() const { return handle_; }
  const WLAN_INTERFACE_INFO& Interface() const { return interface_; }

  bool Connected(std::wstring* ssid = nullptr) const {
    if (!available_) return false;
    DWORD size = 0;
    PVOID data = nullptr;
    WLAN_OPCODE_VALUE_TYPE type{};
    const DWORD result = WlanQueryInterface(handle_, &interface_.InterfaceGuid,
        wlan_intf_opcode_current_connection, nullptr, &size, &data, &type);
    if (result != ERROR_SUCCESS) {
      if (data) WlanFreeMemory(data);
      if (result == ERROR_INVALID_STATE) return false;
      CheckWlan(result, "Reading the active Wi-Fi connection");
    }
    if (!data) throw std::runtime_error("Windows returned no active Wi-Fi connection details");
    const auto* connection = static_cast<const WLAN_CONNECTION_ATTRIBUTES*>(data);
    const bool connected = connection->isState == wlan_interface_state_connected;
    if (connected && ssid) *ssid = SsidToWide(connection->wlanAssociationAttributes.dot11Ssid);
    WlanFreeMemory(data);
    return connected;
  }

  std::wstring ProfileNameForSsid(const std::wstring& ssid) const {
    PWLAN_AVAILABLE_NETWORK_LIST list = nullptr;
    CheckWlan(WlanGetAvailableNetworkList(handle_, &interface_.InterfaceGuid,
        WLAN_AVAILABLE_NETWORK_INCLUDE_ALL_MANUAL_HIDDEN_PROFILES, nullptr, &list),
        "Finding the saved Wi-Fi profile");
    std::wstring profile = ssid;
    for (DWORD i = 0; list && i < list->dwNumberOfItems; ++i) {
      const auto& network = list->Network[i];
      if (SsidToWide(network.dot11Ssid) == ssid &&
          (network.dwFlags & WLAN_AVAILABLE_NETWORK_HAS_PROFILE) != 0) {
        profile = network.strProfileName;
        break;
      }
    }
    if (list) WlanFreeMemory(list);
    return profile;
  }

  std::vector<std::string> Networks(bool requestScan) const {
    if (!available_) return {};
    if (requestScan) {
      ScanNotification scan;
      scan.event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
      if (!scan.event) throw std::runtime_error("Could not create a Wi-Fi scan notification event");
      DWORD previousSource = 0;
      const DWORD registerStatus = WlanRegisterNotification(handle_, WLAN_NOTIFICATION_SOURCE_ACM,
          TRUE, OnWlanNotification, &scan, nullptr, &previousSource);
      if (registerStatus != ERROR_SUCCESS) {
        CloseHandle(scan.event);
        CheckWlan(registerStatus, "Registering for Wi-Fi scan results");
      }
      const DWORD scanStatus = WlanScan(handle_, &interface_.InterfaceGuid, nullptr, nullptr, nullptr);
      if (scanStatus != ERROR_SUCCESS && scanStatus != ERROR_BUSY) {
        WlanRegisterNotification(handle_, WLAN_NOTIFICATION_SOURCE_NONE, TRUE, nullptr, nullptr, nullptr, nullptr);
        CloseHandle(scan.event);
        CheckWlan(scanStatus, "Starting a Wi-Fi scan");
      }
      const DWORD waitStatus = WaitForSingleObject(scan.event, 7000);
      const DWORD waitError = waitStatus == WAIT_FAILED ? GetLastError() : ERROR_SUCCESS;
      const DWORD failure = scan.failure.load();
      const DWORD unregisterStatus = WlanRegisterNotification(handle_, WLAN_NOTIFICATION_SOURCE_NONE,
          TRUE, nullptr, nullptr, nullptr, nullptr);
      CloseHandle(scan.event);
      if (waitStatus == WAIT_TIMEOUT) throw std::runtime_error("Timed out waiting for nearby Wi-Fi networks");
      if (waitStatus != WAIT_OBJECT_0) CheckWlan(waitError, "Waiting for Wi-Fi scan results");
      if (failure) CheckWlan(failure, "Scanning for nearby Wi-Fi networks");
      CheckWlan(unregisterStatus, "Closing the Wi-Fi scan notification");
    }
    PWLAN_PROFILE_INFO_LIST profiles = nullptr;
    std::vector<std::wstring> saved;
    const DWORD profileStatus = WlanGetProfileList(handle_, &interface_.InterfaceGuid, nullptr, &profiles);
    if (profileStatus == ERROR_SUCCESS && profiles) {
      for (DWORD i = 0; i < profiles->dwNumberOfItems; ++i) {
        saved.emplace_back(profiles->ProfileInfo[i].strProfileName);
      }
      WlanFreeMemory(profiles);
    } else CheckWlan(profileStatus, "Reading saved Wi-Fi profiles");
    PWLAN_AVAILABLE_NETWORK_LIST list = nullptr;
    CheckWlan(WlanGetAvailableNetworkList(handle_, &interface_.InterfaceGuid,
        WLAN_AVAILABLE_NETWORK_INCLUDE_ALL_MANUAL_HIDDEN_PROFILES, nullptr, &list),
        "Reading nearby Wi-Fi networks");
    std::map<std::wstring, std::string> networks;
    for (DWORD i = 0; list && i < list->dwNumberOfItems; ++i) {
      const auto& network = list->Network[i];
      const std::wstring name = SsidToWide(network.dot11Ssid);
      if (name.empty()) continue;
      const int auth = static_cast<int>(network.dot11DefaultAuthAlgorithm);
      std::wstring authentication = L"Unknown";
      if (auth == 1) authentication = L"Open";
      else if (auth == 2) authentication = L"WEP";
      else if (auth == 3) authentication = L"WPA-Enterprise";
      else if (auth == 4) authentication = L"WPA-Personal";
      else if (auth == 6) authentication = L"WPA2-Enterprise";
      else if (auth == 7) authentication = L"WPA2-Personal";
      else if (auth == 8) authentication = L"WPA3";
      else if (auth == 9 || auth == 12) authentication = L"WPA3-Enterprise";
      else if (auth == 10) authentication = L"WPA3-Personal";
      const bool isSaved = (network.dwFlags & WLAN_AVAILABLE_NETWORK_HAS_PROFILE) != 0 ||
          std::find(saved.begin(), saved.end(), name) != saved.end();
      const bool secure = network.bSecurityEnabled != FALSE;
      const std::string item = "{\"name\":" + Json(name) +
          ",\"authentication\":" + Json(authentication) +
          ",\"signal\":" + std::to_string(network.wlanSignalQuality) +
          ",\"saved\":" + (isSaved ? "true" : "false") +
          ",\"secure\":" + (secure ? "true" : "false") + "}";
      auto found = networks.find(name);
      if (found == networks.end()) {
        networks.emplace(name, item);
      } else {
        const auto oldSignal = found->second.find("\"signal\":");
        const auto newSignal = item.find("\"signal\":");
        if (oldSignal != std::string::npos && newSignal != std::string::npos &&
            std::stoi(item.substr(newSignal + 9)) > std::stoi(found->second.substr(oldSignal + 9))) {
          found->second = item;
        }
      }
    }
    if (list) WlanFreeMemory(list);
    std::vector<std::string> result;
    result.reserve(networks.size());
    for (auto& entry : networks) result.push_back(std::move(entry.second));
    std::sort(result.begin(), result.end(), [](const std::string& a, const std::string& b) {
      const auto left = a.find("\"signal\":");
      const auto right = b.find("\"signal\":");
      return std::stoi(a.substr(left + 9)) > std::stoi(b.substr(right + 9));
    });
    return result;
  }

 private:
  HANDLE handle_{};
  WLAN_INTERFACE_INFO interface_{};
  bool available_{};
};

void AddWifiProfile(const std::wstring& ssid, const std::wstring& password,
                    const std::wstring& authentication) {
  const bool secure = !authentication.empty();
  if (secure && (password.size() < 8 || password.size() > 64)) {
    throw std::runtime_error("Enter a Wi-Fi password from 8 to 63 characters or a 64-character hexadecimal key");
  }
  if (secure && password.size() == 64 &&
      !std::all_of(password.begin(), password.end(), [](wchar_t c) { return iswxdigit(c) != 0; })) {
    throw std::runtime_error("A 64-character Wi-Fi key must contain only hexadecimal digits");
  }
  WlanSession wlan;
  if (!wlan.Available()) throw std::runtime_error("A Windows Wi-Fi adapter is unavailable");
  const std::wstring auth = secure ? authentication : L"open";
  const std::wstring encryption = secure ? L"AES" : L"none";
  const bool rawKey = secure && password.size() == 64 &&
      std::all_of(password.begin(), password.end(), [](wchar_t c) { return iswxdigit(c) != 0; });
  const std::wstring key = secure
      ? L"<sharedKey><keyType>" + std::wstring(rawKey ? L"networkKey" : L"passPhrase") +
        L"</keyType><protected>false</protected><keyMaterial>" + Xml(password) +
        L"</keyMaterial></sharedKey>"
      : L"";
  const std::wstring profile = L"<?xml version=\"1.0\"?><WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\"><name>" +
      Xml(ssid) + L"</name><SSIDConfig><SSID><name>" + Xml(ssid) +
      L"</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>" +
      auth + L"</authentication><encryption>" + encryption +
      L"</encryption><useOneX>false</useOneX></authEncryption>" + key +
      L"</security></MSM></WLANProfile>";
  DWORD reason = 0;
  CheckWlan(WlanSetProfile(wlan.Handle(), &wlan.Interface().InterfaceGuid, 0, profile.c_str(),
      nullptr, TRUE, nullptr, &reason), "Creating a Wi-Fi profile");
}

}

void ConnectWifi(const std::wstring& ssid, const std::wstring& password) {
  WlanSession wlan;
  if (!wlan.Available()) throw std::runtime_error("A Windows Wi-Fi adapter is unavailable");
  const RadioStatus radio = GetRadioState(WirelessRadio::WiFi);
  if (!radio.enabled) {
    throw std::runtime_error(radio.error.empty() ? "Turn Wi-Fi on before connecting" : radio.error);
  }
  const auto networks = wlan.Networks(false);
  bool found = false;
  bool saved = false;
  bool secure = false;
  std::wstring authentication;
  for (const auto& network : networks) {
    const std::string expected = "\"name\":" + Json(ssid);
    if (network.find(expected) == std::string::npos) continue;
    found = true;
    saved = network.find("\"saved\":true") != std::string::npos;
    secure = network.find("\"secure\":true") != std::string::npos;
    if (network.find("\"authentication\":\"WPA-Personal\"") != std::string::npos) authentication = L"WPAPSK";
    else if (network.find("\"authentication\":\"WPA2-Personal\"") != std::string::npos) authentication = L"WPA2PSK";
    else if (network.find("\"authentication\":\"WPA3-Personal\"") != std::string::npos) authentication = L"WPA3SAE";
    break;
  }
  if (!found) throw std::runtime_error("That network is no longer in range. Refresh and try again.");
  if (secure && authentication.empty() && !saved) {
    throw std::runtime_error("This secure network uses an authentication mode that Notch cannot configure");
  }
  if (!saved) AddWifiProfile(ssid, password, authentication);
  WLAN_CONNECTION_PARAMETERS parameters{};
  parameters.wlanConnectionMode = wlan_connection_mode_profile;
  const std::wstring profileName = wlan.ProfileNameForSsid(ssid);
  parameters.strProfile = profileName.c_str();
  parameters.pDot11Ssid = nullptr;
  parameters.pDesiredBssidList = nullptr;
  parameters.dot11BssType = dot11_BSS_type_any;
  parameters.dwFlags = 0;
  CheckWlan(WlanConnect(wlan.Handle(), &wlan.Interface().InterfaceGuid, &parameters, nullptr),
      "Starting the Wi-Fi connection");
  const ULONGLONG deadline = GetTickCount64() + 20000;
  while (GetTickCount64() < deadline) {
    std::wstring activeName;
    if (wlan.Connected(&activeName) && activeName == ssid) return;
    Sleep(400);
  }
  throw std::runtime_error("Windows did not confirm the Wi-Fi connection. Check the password and signal.");
}

void DisconnectWifi() {
  WlanSession wlan;
  if (!wlan.Available()) throw std::runtime_error("A Windows Wi-Fi adapter is unavailable");
  CheckWlan(WlanDisconnect(wlan.Handle(), &wlan.Interface().InterfaceGuid, nullptr),
      "Disconnecting Wi-Fi");
  const ULONGLONG deadline = GetTickCount64() + 5000;
  while (GetTickCount64() < deadline) {
    if (!wlan.Connected()) return;
    Sleep(250);
  }
  throw std::runtime_error("Windows has not confirmed the Wi-Fi disconnection");
}

WifiState GetWifiState() {
  WlanSession wlan;
  WifiState state;
  state.available = wlan.Available();
  if (state.available) {
    state.interfaceName = ToUtf8(wlan.Interface().strInterfaceDescription);
    std::wstring ssid;
    state.connected = wlan.Connected(&ssid);
    if (state.connected) state.name = ToUtf8(ssid);
  }
  const RadioStatus radio = GetRadioState(WirelessRadio::WiFi);
  state.radioAvailable = radio.available;
  state.enabled = radio.enabled;
  state.radioError = radio.error;
  return state;
}

std::vector<std::string> ScanWifiNetworks() {
  WlanSession wlan;
  return wlan.Networks(true);
}

}
