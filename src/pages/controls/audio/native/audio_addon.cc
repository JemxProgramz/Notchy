#include "loopback.h"

#include <node_api.h>

#include <cstdint>

namespace notch::audio {

napi_value Start(napi_env env, napi_callback_info) {
  napi_value result;
  napi_get_boolean(env, StartLoopbackCapture(), &result);
  return result;
}

napi_value Stop(napi_env env, napi_callback_info) {
  StopLoopbackCapture();
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

napi_value GetLevels(napi_env env, napi_callback_info) {
  const auto levels = GetLoopbackLevels();
  napi_value result;
  napi_create_array_with_length(env, levels.size(), &result);
  for (std::size_t i = 0; i < levels.size(); ++i) {
    napi_value level;
    napi_create_double(env, levels[i], &level);
    napi_set_element(env, result, static_cast<std::uint32_t>(i), level);
  }
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"start", nullptr, Start, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"stop", nullptr, Stop, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"getLevels", nullptr, GetLevels, nullptr, nullptr, nullptr, napi_default, nullptr}};
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

}

using notch::audio::Init;
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
