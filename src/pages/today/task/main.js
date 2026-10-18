module.exports = function registerTasks({ handleIpc, Notification, getConfig }) {
  handleIpc('notch:notify', (_event, title, body) => {
    const config = getConfig();
    if (config.notifications && Notification.isSupported() && typeof title === 'string' && typeof body === 'string') {
      new Notification({ title: title.slice(0, 80), body: body.slice(0, 200) }).show();
    }
  });
};
