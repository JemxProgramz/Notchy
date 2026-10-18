#pragma once

#include <array>
#include <cstddef>

namespace notch::audio {

constexpr std::size_t kVisualizerBarCount = 26;
using VisualizerLevels = std::array<double, kVisualizerBarCount>;

bool StartLoopbackCapture();
void StopLoopbackCapture();
VisualizerLevels GetLoopbackLevels();

}
