const registerControls = require('./controls/main');
const registerStats = require('./stats/main');
const registerApps = require('./apps/main');
const registerWallpaper = require('./wallpaper/main');
const registerPower = require('./power/main');
const registerSettings = require('./settings/main');
const registerClipboard = require('./clipboard/main');
const registerToday = require('./today/main');

module.exports = function registerPageIpc(context) {
  registerControls(context);
  registerStats(context);
  registerApps(context);
  registerWallpaper(context);
  registerPower(context);
  registerSettings(context);
  registerClipboard(context);
  registerToday(context);
};
