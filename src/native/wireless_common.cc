#include "wireless_common.h"

#include <stdexcept>

namespace notch::wireless {

std::wstring FromUtf8(const std::string& value) {
  if (value.empty()) return {};
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                                       static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) throw std::runtime_error("Input is not valid UTF-8");
  std::wstring result(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), size);
  return result;
}

std::string ToUtf8(const std::wstring& value) {
  if (value.empty()) return {};
  const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                                       static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  if (size <= 0) return {};
  std::string result(static_cast<size_t>(size), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
  return result;
}

std::wstring SsidToWide(const DOT11_SSID& ssid) {
  if (!ssid.uSSIDLength) return {};
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                                       reinterpret_cast<const char*>(ssid.ucSSID),
                                       static_cast<int>(ssid.uSSIDLength), nullptr, 0);
  if (size <= 0) {
    const int fallback = MultiByteToWideChar(CP_ACP, 0,
        reinterpret_cast<const char*>(ssid.ucSSID), static_cast<int>(ssid.uSSIDLength), nullptr, 0);
    if (fallback <= 0) return {};
    std::wstring result(static_cast<size_t>(fallback), L'\0');
    MultiByteToWideChar(CP_ACP, 0, reinterpret_cast<const char*>(ssid.ucSSID),
                        static_cast<int>(ssid.uSSIDLength), result.data(), fallback);
    return result;
  }
  std::wstring result(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, reinterpret_cast<const char*>(ssid.ucSSID),
                      static_cast<int>(ssid.uSSIDLength), result.data(), size);
  return result;
}

std::string Json(const std::string& value) {
  std::string result = "\"";
  for (unsigned char c : value) {
    switch (c) {
      case '"': result += "\\\""; break;
      case '\\': result += "\\\\"; break;
      case '\b': result += "\\b"; break;
      case '\f': result += "\\f"; break;
      case '\n': result += "\\n"; break;
      case '\r': result += "\\r"; break;
      case '\t': result += "\\t"; break;
      default:
        if (c < 0x20) {
          constexpr char hex[] = "0123456789abcdef";
          result += "\\u00";
          result += hex[c >> 4];
          result += hex[c & 0x0f];
        } else {
          result += static_cast<char>(c);
        }
    }
  }
  result += '"';
  return result;
}

std::string Json(const std::wstring& value) {
  return Json(ToUtf8(value));
}

std::wstring Xml(const std::wstring& value) {
  std::wstring result;
  for (wchar_t c : value) {
    switch (c) {
      case L'&': result += L"&amp;"; break;
      case L'<': result += L"&lt;"; break;
      case L'>': result += L"&gt;"; break;
      case L'"': result += L"&quot;"; break;
      case L'\'': result += L"&apos;"; break;
      default: result += c;
    }
  }
  return result;
}

void CheckWlan(DWORD result, const char* action) {
  if (result != ERROR_SUCCESS) {
    throw std::runtime_error(std::string(action) + " failed (Windows error " + std::to_string(result) + ")");
  }
}

}
