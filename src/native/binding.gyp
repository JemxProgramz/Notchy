{
  "targets": [
    {
      "target_name": "wireless",
      "sources": [
        "../pages/controls/wireless/native/wireless_addon.cc",
        "../pages/controls/wireless/native/wireless_operations.cc",
        "../pages/controls/wireless/native/wireless_common.cc",
        "../pages/controls/wifi/native/wifi.cc",
        "../pages/controls/wireless/native/wireless_radio.cc",
        "../pages/controls/bluetooth/native/bluetooth.cc",
        "../pages/controls/wireless/native/wireless_state.cc"
      ],
      "defines": ["NAPI_VERSION=8"],
      "libraries": ["wlanapi.lib", "windowsapp.lib", "ole32.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    },
    {
      "target_name": "audio",
      "sources": [
        "../pages/controls/audio/native/audio_addon.cc",
        "../pages/controls/audio/native/loopback.cc"
      ],
      "defines": ["NAPI_VERSION=8"],
      "libraries": ["ole32.lib", "uuid.lib", "mmdevapi.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    }
  ]
}
