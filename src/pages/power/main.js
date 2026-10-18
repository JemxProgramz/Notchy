module.exports = function registerPower({ handleIpc, powerAction }) {
  handleIpc('notch:power', (_event, action) => powerAction(action));
};
