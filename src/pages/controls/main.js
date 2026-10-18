const registerWifi = require('./wifi/main');
const registerBluetooth = require('./bluetooth/main');
const registerWireless = require('./wireless/main');
const registerBrightness = require('./brightness/main');
const registerVolume = require('./volume/main');
const registerWindowsSettings = require('./windows-settings/main');

module.exports = function registerControls(context) {
  context.handleIpc('notch:controls:get', context.getControls);
  registerWireless(context);
  registerWifi(context);
  registerBluetooth(context);
  registerBrightness(context);
  registerVolume(context);
  registerWindowsSettings(context);
};
