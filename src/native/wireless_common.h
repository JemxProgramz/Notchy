#pragma once

#include <windows.h>
#include <wlanapi.h>

#include <string>

namespace notch::wireless {

std::wstring FromUtf8(const std::string& value);
std::string ToUtf8(const std::wstring& value);
std::wstring SsidToWide(const DOT11_SSID& ssid);
std::string Json(const std::string& value);
std::string Json(const std::wstring& value);
std::wstring Xml(const std::wstring& value);
void CheckWlan(DWORD result, const char* action);

}
