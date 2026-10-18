#pragma once

#include <node_api.h>

#include <string>

namespace notch::wireless {

enum class Operation {
  GetState,
  ScanWifi,
  SetRadio,
  ConnectWifi,
  DisconnectWifi,
  ScanBluetooth,
  PairBluetooth
};

struct Work {
  napi_async_work work{};
  napi_deferred deferred{};
  Operation operation{};
  std::wstring first;
  std::wstring second;
  bool enabled{};
  std::string output;
  std::string error;
};

void Execute(napi_env env, void* data);
void Complete(napi_env env, napi_status status, void* data);

}
