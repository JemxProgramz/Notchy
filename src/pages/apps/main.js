module.exports = function registerApps({ handleIpc, installedApps, startApps, findStartMenuLink, fs, path, shell, spawn, dialog, getWindow }) {
  handleIpc('notch:apps:list', installedApps);
  handleIpc('notch:apps:launch', async (_event, id) => {
    const apps = await startApps();
    const selected = apps.find(app => app.id === id);
    if (typeof id !== 'string' || !selected) throw new Error('That application is no longer in the Start menu. Refresh and try again.');
    const link = findStartMenuLink(selected.name);
    if (link && fs.existsSync(link.file)) {
      const error = await shell.openPath(link.file);
      if (!error) return true;
    }
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(id)) { await shell.openExternal(id); return true; }
    if (path.win32.isAbsolute(id) && fs.existsSync(id)) {
      const error = await shell.openPath(id);
      if (!error) return true;
    }
    return new Promise((resolve, reject) => {
      const appFolderItem = `shell:AppsFolder\\${id}`;
      const child = spawn('explorer.exe', [appFolderItem], {
        detached: true, stdio: 'ignore', windowsHide: false
      });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(true); });
    });
  });
  handleIpc('notch:apps:pick', async () => {
    const choice = await dialog.showOpenDialog(getWindow(), {
      title: 'Add an application',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['exe', 'lnk', 'bat', 'cmd'] }]
    });
    if (choice.canceled || !choice.filePaths[0]) return null;
    const file = choice.filePaths[0];
    return { name: path.basename(file, path.extname(file)), path: file };
  });
  handleIpc('notch:apps:openPath', async (_event, file) => {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !fs.existsSync(file)) throw new Error('Application path is unavailable');
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
  });
};
