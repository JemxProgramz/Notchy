module.exports = function registerSettings({
  handleIpc,
  defaults,
  getConfig,
  setConfig,
  getWindow,
  screen,
  registerShortcut,
  setStartup,
  setClickThrough,
  repositionWindow,
  pruneClipboard,
  saveData,
  updateTray,
  app
}) {
  handleIpc('notch:settings:get', () => ({ ...getConfig() }));
  handleIpc('notch:settings:save', async (_event, patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
    const next = { ...getConfig() };
    for (const key of ['startup', 'alwaysOnTop', 'clickThrough', 'animations', 'clipboardEnabled', 'notifications']) {
      if (key in patch) next[key] = !!patch[key];
    }
    if ('clipboardLimit' in patch) next.clipboardLimit = Math.max(10, Math.min(500, Number(patch.clipboardLimit) || 100));
    if ('clipboardRetentionDays' in patch) next.clipboardRetentionDays = Math.max(1, Math.min(365, Number(patch.clipboardRetentionDays) || 30));
    if ('monitorRefreshMs' in patch) next.monitorRefreshMs = Math.max(1000, Math.min(10000, Number(patch.monitorRefreshMs) || 3000));
    if ('timeFormat' in patch && ['12h', '24h'].includes(patch.timeFormat)) next.timeFormat = patch.timeFormat;
    if ('theme' in patch && ['dark', 'light', 'system'].includes(patch.theme)) next.theme = patch.theme;
    if ('displayId' in patch && (patch.displayId === null || screen.getAllDisplays().some(display => display.id === patch.displayId))) {
      next.displayId = patch.displayId;
    }
    if ('globalShortcut' in patch && typeof patch.globalShortcut === 'string') {
      if (!registerShortcut(patch.globalShortcut)) throw new Error('That shortcut is unavailable. Choose a different key combination.');
      next.globalShortcut = patch.globalShortcut;
    }

    setConfig(next);
    if ('startup' in patch) setStartup(next.startup);
    getWindow()?.setAlwaysOnTop(next.alwaysOnTop);
    setClickThrough(next.clickThrough);
    if ('displayId' in patch) repositionWindow();
    pruneClipboard();
    saveData();
    updateTray();
    return { ...next };
  });
  handleIpc('notch:version', () => app.getVersion());
  handleIpc('notch:display:list', () => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map(display => ({
      id: display.id,
      label: display.label || `Display ${display.id}`,
      bounds: display.bounds,
      primary: display.id === primaryId
    }));
  });
};
