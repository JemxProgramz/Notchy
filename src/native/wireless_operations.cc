#include "wireless_api.h"
#include "wireless_common.h"
#include "wireless_work.h"

#include <exception>
#include <winrt/Windows.Foundation.h>

using namespace winrt;

namespace notch::wireless {

namespace {

// Notchy runs wireless operations on Node's libuv worker pool, which reuses its
// threads. WinRT requires an apartment, but a thread can never change apartment
// mode once it has entered one, and uninitializing between calls can tear down
// shared WinRT state that a later call still depends on. So each worker thread
// is initialized once as a multi-threaded apartment and left that way. The
// Bluetooth scan uses its own single-threaded thread (see wireless_bluetooth.cc)
// because its device watcher needs a pumped apartment.
void EnsureApartment() {
  static thread_local const bool ready = [] {
    init_apartment(apartment_type::multi_threaded);
    return true;
  }();
  (void)ready;
}

}

void Execute(napi_env, void* data) {
  auto* task = static_cast<Work*>(data);
  try {
    EnsureApartment();
    switch (task->operation) {
      case Operation::GetState:
        task->output = SerializeWirelessState(GetWifiState(), GetRadioState(WirelessRadio::Bluetooth));
        break;
      case Operation::ScanWifi:
        task->output = SerializeNetworks(ScanWifiNetworks());
        break;
      case Operation::SetRadio:
        SetRadio(task->first, task->enabled);
        task->output = task->enabled ? "true" : "false";
        break;
      case Operation::ConnectWifi:
        ConnectWifi(task->first, task->second);
        task->output = "{\"connected\":true,\"ssid\":" + Json(task->first) + "}";
        break;
      case Operation::DisconnectWifi:
        DisconnectWifi();
        task->output = "true";
        break;
      case Operation::ScanBluetooth:
        task->output = ScanBluetoothDevices(task->enabled);
        break;
      case Operation::PairBluetooth:
        task->output = PairBluetoothDevice(task->first);
        break;
    }
  } catch (const hresult_error& error) {
    task->error = ToUtf8(error.message().c_str());
    if (task->error.empty()) task->error = "A Windows wireless operation failed";
  } catch (const std::exception& error) {
    task->error = error.what();
  } catch (...) {
    task->error = "An unknown Windows wireless operation failed";
  }
}

void Complete(napi_env env, napi_status status, void* data) {
  auto* task = static_cast<Work*>(data);
  if (status != napi_ok && task->error.empty()) task->error = "The native wireless operation was cancelled";
  if (!task->error.empty()) {
    napi_value message, error;
    napi_create_string_utf8(env, task->error.c_str(), NAPI_AUTO_LENGTH, &message);
    napi_create_error(env, nullptr, message, &error);
    napi_reject_deferred(env, task->deferred, error);
  } else {
    napi_value global, jsonObject, parse, json, value;
    const napi_status stringStatus = napi_create_string_utf8(env, task->output.c_str(), NAPI_AUTO_LENGTH, &json);
    napi_status jsonStatus = stringStatus;
    if (jsonStatus == napi_ok) jsonStatus = napi_get_global(env, &global);
    if (jsonStatus == napi_ok) jsonStatus = napi_get_named_property(env, global, "JSON", &jsonObject);
    if (jsonStatus == napi_ok) jsonStatus = napi_get_named_property(env, jsonObject, "parse", &parse);
    if (jsonStatus == napi_ok) jsonStatus = napi_call_function(env, jsonObject, parse, 1, &json, &value);
    if (jsonStatus != napi_ok) {
      napi_value error;
      if (napi_get_and_clear_last_exception(env, &error) != napi_ok) {
        napi_value message;
        napi_create_string_utf8(env, "Could not decode the native wireless result", NAPI_AUTO_LENGTH, &message);
        napi_create_error(env, nullptr, message, &error);
      }
      napi_reject_deferred(env, task->deferred, error);
    } else {
      napi_resolve_deferred(env, task->deferred, value);
    }
  }
  napi_delete_async_work(env, task->work);
  delete task;
}

}
