module.exports = function registerWifi({
  handleIpc,
  scanWifiNetworks,
  connectWifi,
  disconnectWifi
}) {
  handleIpc('notch:wireless:wifi:scan', scanWifiNetworks);
  handleIpc('notch:wireless:wifi:connect', async (_event, details) => connectWifi(details));
  handleIpc('notch:wireless:wifi:disconnect', disconnectWifi);
};
