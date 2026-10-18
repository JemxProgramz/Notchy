const registerTasks = require('./task/main');

module.exports = function registerToday(context) {
  registerTasks(context);
};
