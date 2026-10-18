module.exports = function registerWindowsSettings({ handleIpc, shell }) {
  handleIpc('notch:windows:settings', async (_event, area) => {
    const uris = {
      wifi: 'ms-settings:network-wifi',
      bluetooth: 'ms-settings:bluetooth',
      audio: 'ms-settings:sound',
      nightlight: 'ms-settings:nightlight',
      display: 'ms-settings:display',
      power: 'ms-settings:powersleep',
      startup: 'ms-settings:startupapps'
    };
    if (!uris[area]) throw new Error('Unsupported Windows settings page');
    await shell.openExternal(uris[area]);
  });
};
