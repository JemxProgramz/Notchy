module.exports = function registerStats({ handleIpc, systemStats }) {
  handleIpc('notch:system:stats', (_event, order) => systemStats(order));
};
