const { contextBridge, ipcRenderer } = require('electron');

const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = (channel, callback) => {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('notch', Object.freeze({
  settings: Object.freeze({ get: invoke('notch:settings:get'), save: invoke('notch:settings:save') }),
  system: Object.freeze({ stats: invoke('notch:system:stats') }),
  media: Object.freeze({ get: invoke('notch:media:get'), control: invoke('notch:media:control'), onChanged: callback => subscribe('notch:media:changed', callback) }),
  controls: Object.freeze({ get: invoke('notch:controls:get'), volume: invoke('notch:controls:volume'), mute: invoke('notch:controls:mute'), brightness: invoke('notch:controls:brightness') }),
  wireless: Object.freeze({ get: invoke('notch:wireless:get'), radio: invoke('notch:wireless:radio'), scanWifi: invoke('notch:wireless:wifi:scan'), connectWifi: invoke('notch:wireless:wifi:connect'), disconnectWifi: invoke('notch:wireless:wifi:disconnect'), scanBluetooth: invoke('notch:wireless:bluetooth:scan'), pairBluetooth: invoke('notch:wireless:bluetooth:pair') }),
  windows: Object.freeze({ settings: invoke('notch:windows:settings') }),
  apps: Object.freeze({ list: invoke('notch:apps:list'), launch: invoke('notch:apps:launch'), pick: invoke('notch:apps:pick'), openPath: invoke('notch:apps:openPath') }),
  wallpaper: Object.freeze({ pick: invoke('notch:wallpaper:pick'), apply: invoke('notch:wallpaper:apply'), applyDataUrl: invoke('notch:wallpaper:applyDataUrl'), preview: invoke('notch:wallpaper:preview') }),
  clipboard: Object.freeze({ list: invoke('notch:clipboard:list'), copy: invoke('notch:clipboard:copy'), write: invoke('notch:clipboard:write'), pin: invoke('notch:clipboard:pin'), delete: invoke('notch:clipboard:delete'), clear: invoke('notch:clipboard:clear'), onNew: callback => subscribe('notch:clipboard:new', callback), onChanged: callback => subscribe('notch:clipboard:changed', callback) }),
  power: invoke('notch:power'),
  external: invoke('notch:external'),
  notify: invoke('notch:notify'),
  version: invoke('notch:version'),
  displays: invoke('notch:display:list'),
  setScene: invoke('notch:window:scene'),
  show: invoke('notch:window:show'),
  onToggle: callback => subscribe('notch:toggle', callback),
  onOpen: callback => subscribe('notch:open', callback)
}));
