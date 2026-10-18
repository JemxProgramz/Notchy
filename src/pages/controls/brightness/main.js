module.exports = function registerBrightness({ handleIpc, setDisplayBrightness }) {
  handleIpc('notch:controls:brightness', async (_event, value) => setDisplayBrightness(value));
};
