module.exports = function registerWireless({ handleIpc, getWirelessState, setWirelessRadio }) {
  handleIpc('notch:wireless:get', getWirelessState);
  handleIpc('notch:wireless:radio', async (_event, kind, enabled) => setWirelessRadio(kind, enabled));
};
