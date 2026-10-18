module.exports = function registerClipboard({
  handleIpc,
  getHistory,
  setHistory,
  getSuppressedText,
  setSuppressedText,
  cleanText,
  clipboard,
  saveData,
  broadcast,
  dialog,
  getWindow
}) {
  handleIpc('notch:clipboard:list', () => getHistory());
  handleIpc('notch:clipboard:copy', async (_event, id) => {
    const item = getHistory().find(entry => entry.id === id);
    if (!item) throw new Error('Clipboard item not found');
    setSuppressedText(item.text);
    await clipboard.writeText(item.text);
    setTimeout(() => { if (getSuppressedText() === item.text) setSuppressedText(''); }, 2500);
  });
  handleIpc('notch:clipboard:write', async (_event, value) => {
    const text = cleanText(value);
    if (!text) throw new Error('Clipboard text is empty or too long');
    setSuppressedText(text);
    await clipboard.writeText(text);
    setTimeout(() => { if (getSuppressedText() === text) setSuppressedText(''); }, 2500);
  });
  handleIpc('notch:clipboard:pin', (_event, id) => {
    const history = getHistory();
    const item = history.find(entry => entry.id === id);
    if (!item) return history;
    item.pinned = !item.pinned;
    saveData();
    broadcast('notch:clipboard:changed', history);
    return history;
  });
  handleIpc('notch:clipboard:delete', (_event, ids) => {
    const wanted = new Set((Array.isArray(ids) ? ids : [ids]).filter(value => typeof value === 'string'));
    const history = getHistory().filter(item => !wanted.has(item.id));
    setHistory(history);
    saveData();
    broadcast('notch:clipboard:changed', history);
    return history;
  });
  handleIpc('notch:clipboard:clear', async () => {
    const answer = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      title: 'Clear clipboard history',
      message: 'Delete all saved clipboard items?',
      buttons: ['Cancel', 'Clear history'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (answer.response === 1) {
      setHistory([]);
      saveData();
      broadcast('notch:clipboard:changed', getHistory());
    }
    return getHistory();
  });
};
