#include "wireless_common.h"
#include "wireless_work.h"

#include <node_api.h>

#include <string>

namespace notch::wireless {

void ReadString(napi_env env, napi_value value, const char* property, std::wstring* destination) {
  napi_value input = value;
  if (property) napi_get_named_property(env, value, property, &input);
  size_t size = 0;
  napi_get_value_string_utf8(env, input, nullptr, 0, &size);
  std::string text(size + 1, '\0');
  napi_get_value_string_utf8(env, input, text.data(), text.size(), &size);
  text.resize(size);
  *destination = FromUtf8(text);
}

napi_value Queue(napi_env env, Operation operation, napi_value first = nullptr,
                 napi_value second = nullptr) {
  auto* task = new Work{};
  task->operation = operation;
  if (first && (operation == Operation::SetRadio || operation == Operation::ConnectWifi ||
                operation == Operation::PairBluetooth)) {
    ReadString(env, first, operation == Operation::ConnectWifi ? "ssid" : nullptr, &task->first);
  }
  if (first && operation == Operation::ScanBluetooth) {
    napi_valuetype type;
    if (napi_typeof(env, first, &type) == napi_ok && type == napi_boolean) {
      napi_get_value_bool(env, first, &task->enabled);
    }
  }
  if (second) {
    if (operation == Operation::ConnectWifi) {
      ReadString(env, first, "password", &task->second);
    } else {
      napi_get_value_bool(env, second, &task->enabled);
    }
  }
  napi_value promise, resourceName;
  if (napi_create_promise(env, &task->deferred, &promise) != napi_ok ||
      napi_create_string_utf8(env, "native wireless operation", NAPI_AUTO_LENGTH, &resourceName) != napi_ok) {
    delete task;
    napi_throw_error(env, nullptr, "Could not queue the native wireless operation");
    return nullptr;
  }
  if (napi_create_async_work(env, nullptr, resourceName, Execute, Complete, task, &task->work) != napi_ok) {
    delete task;
    napi_throw_error(env, nullptr, "Could not create native wireless work");
    return nullptr;
  }
  if (napi_queue_async_work(env, task->work) != napi_ok) {
    napi_delete_async_work(env, task->work);
    delete task;
    napi_throw_error(env, nullptr, "Could not start the native wireless operation");
    return nullptr;
  }
  return promise;
}

napi_value GetState(napi_env env, napi_callback_info) {
  return Queue(env, Operation::GetState);
}

napi_value ScanWifi(napi_env env, napi_callback_info) {
  return Queue(env, Operation::ScanWifi);
}

napi_value SetRadioCallback(napi_env env, napi_callback_info info) {
  size_t count = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 2) {
    napi_throw_type_error(env, nullptr, "setRadio requires a radio name and enabled boolean");
    return nullptr;
  }
  napi_valuetype radioType, enabledType;
  if (napi_typeof(env, args[0], &radioType) != napi_ok || radioType != napi_string ||
      napi_typeof(env, args[1], &enabledType) != napi_ok || enabledType != napi_boolean) {
    napi_throw_type_error(env, nullptr, "setRadio requires a radio name and enabled boolean");
    return nullptr;
  }
  return Queue(env, Operation::SetRadio, args[0], args[1]);
}

napi_value ConnectWifiCallback(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 1) {
    napi_throw_type_error(env, nullptr, "connectWifi requires network details");
    return nullptr;
  }
  napi_valuetype detailsType;
  if (napi_typeof(env, args[0], &detailsType) != napi_ok || detailsType != napi_object) {
    napi_throw_type_error(env, nullptr, "connectWifi requires network details");
    return nullptr;
  }
  return Queue(env, Operation::ConnectWifi, args[0], args[0]);
}

napi_value DisconnectWifiCallback(napi_env env, napi_callback_info) {
  return Queue(env, Operation::DisconnectWifi);
}

napi_value ScanBluetoothCallback(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  napi_value includeNearby = nullptr;
  if (count >= 1) {
    napi_valuetype type;
    if (napi_typeof(env, args[0], &type) == napi_ok && type == napi_boolean) includeNearby = args[0];
  }
  return Queue(env, Operation::ScanBluetooth, includeNearby);
}

napi_value PairBluetoothCallback(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 1) {
    napi_throw_type_error(env, nullptr, "pairBluetooth requires a device id");
    return nullptr;
  }
  napi_valuetype idType;
  if (napi_typeof(env, args[0], &idType) != napi_ok || idType != napi_string) {
    napi_throw_type_error(env, nullptr, "pairBluetooth requires a device id");
    return nullptr;
  }
  return Queue(env, Operation::PairBluetooth, args[0]);
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"getState", nullptr, GetState, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"scanWifi", nullptr, ScanWifi, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"setRadio", nullptr, SetRadioCallback, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"connectWifi", nullptr, ConnectWifiCallback, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"disconnectWifi", nullptr, DisconnectWifiCallback, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"scanBluetooth", nullptr, ScanBluetoothCallback, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"pairBluetooth", nullptr, PairBluetoothCallback, nullptr, nullptr, nullptr, napi_default, nullptr}};
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

}

using notch::wireless::Init;
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
