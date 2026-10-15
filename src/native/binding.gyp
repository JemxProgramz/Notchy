{
  "targets": [
    {
      "target_name": "wireless",
      "sources": [
        "wireless_addon.cc",
        "wireless_operations.cc",
        "wireless_common.cc",
        "wireless_wifi.cc",
        "wireless_radio.cc",
        "wireless_bluetooth.cc",
        "wireless_state.cc"
      ],
      "defines": ["NAPI_VERSION=8"],
      "libraries": ["wlanapi.lib", "windowsapp.lib", "ole32.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 }
      }
    }
  ]
}
