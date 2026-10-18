const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('src/renderer/index.html', 'utf8');
const rendererStylesPath = 'src/renderer/styles.css';
const rendererScripts = [
  { file: 'src/renderer/app.js', url: 'app.js' },
  { file: 'src/pages/clipboard/renderer/index.js', url: '../pages/clipboard/renderer/index.js' },
  { file: 'src/pages/controls/renderer/index.js', url: '../pages/controls/renderer/index.js' },
  { file: 'src/pages/today/renderer/index.js', url: '../pages/today/renderer/index.js' },
  { file: 'src/pages/stats/renderer/index.js', url: '../pages/stats/renderer/index.js' },
  { file: 'src/pages/apps/renderer/index.js', url: '../pages/apps/renderer/index.js' },
  { file: 'src/pages/wallpaper/renderer/index.js', url: '../pages/wallpaper/renderer/index.js' },
  { file: 'src/pages/power/renderer/index.js', url: '../pages/power/renderer/index.js' },
  { file: 'src/pages/settings/renderer/index.js', url: '../pages/settings/renderer/index.js' },
  { file: 'src/renderer/bootstrap.js', url: 'bootstrap.js' }
];
const rendererScriptFiles = rendererScripts.map(script => script.file);
const mainPageScripts = [
  'src/pages/index.js',
  'src/pages/controls/main.js',
  'src/pages/controls/wireless/main.js',
  'src/pages/controls/wifi/main.js',
  'src/pages/controls/bluetooth/main.js',
  'src/pages/controls/brightness/main.js',
  'src/pages/controls/volume/main.js',
  'src/pages/controls/windows-settings/main.js',
  'src/pages/today/main.js',
  'src/pages/today/task/main.js',
  'src/pages/stats/main.js',
  'src/pages/clipboard/main.js',
  'src/pages/apps/main.js',
  'src/pages/wallpaper/main.js',
  'src/pages/power/main.js',
  'src/pages/settings/main.js'
];

for (const file of ['src/main.js', 'src/preload.js', ...mainPageScripts, ...rendererScriptFiles]) {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
}
const integrationPath = 'src/renderer/integrations/windows.js';
const integration = fs.readFileSync(integrationPath, 'utf8');
new vm.Script(integration, { filename: integrationPath });
if (!html.includes('<link rel="stylesheet" href="styles.css">') || !fs.existsSync(rendererStylesPath)) {
  throw new Error('The renderer stylesheet is missing or not loaded');
}
let previousScriptPosition = -1;
for (const file of rendererScripts) {
  const scriptPath = file.url;
  const scriptPosition = html.indexOf(`<script src="${scriptPath}"></script>`);
  if (scriptPosition < 0) throw new Error(`Renderer script is not loaded: ${scriptPath}`);
  if (scriptPosition <= previousScriptPosition) {
    throw new Error(`Renderer scripts are out of dependency order at ${scriptPath}`);
  }
  previousScriptPosition = scriptPosition;
}
if (html.indexOf('<script src="integrations/windows.js"></script>') <= previousScriptPosition) {
  throw new Error('Native renderer integration must load after the base UI');
}
if (!integration.includes("$('#tiles').addEventListener('click'") || !integration.includes("target?.closest('#tiles [data-k]')") || !integration.includes('event.stopImmediatePropagation()')) {
  throw new Error('Native wireless tile clicks must take precedence over the legacy renderer handler');
}
if (!integration.includes('aria-controls="wireless-popover"') || !html.includes('id="wireless-popover"')) {
  throw new Error('Wireless tile dropdown controls are not connected to their panel');
}
if (!integration.includes('event.composedPath()') || !integration.includes('role="switch"')) {
  throw new Error('Wireless panel dismissal or accessible radio switches are not wired');
}
if (integration.includes('class="wireless-tile"') || !integration.includes('class="wireless-switch"') || !integration.includes('data-action="wifi-toggle"') || !integration.includes('data-action="bluetooth-toggle"')) {
  throw new Error('Each wireless tile must be one intact button, with radio controls in its single details panel');
}
if (!integration.includes('data-action="wifi-network"') || !integration.includes('id="wifi-password-form"') || !integration.includes('data-action="wifi-password-toggle"') || !integration.includes('api.wireless.connectWifi')) {
  throw new Error('Nearby Wi-Fi networks must support in-notch connection and password visibility');
}
if (!integration.includes("const panelKey = kind === 'WiFi' ? 'wifi' : 'bt'") || !integration.includes('wirelessOpen === panelKey')) {
  throw new Error('Enabling a wireless radio must refresh its open panel');
}
if (!integration.includes('wifi.connected ? `Connected to ${escapeMarkup(wifi.name || \'Wi-Fi\')}`') || !integration.includes('wifiConnectionAttempt ? `Connecting to')) {
  throw new Error('Wi-Fi must show connecting and confirmed connected status');
}
const main = fs.readFileSync('src/main.js', 'utf8');
const nativeFiles = [
  'src/pages/controls/wireless/native/wireless_addon.cc',
  'src/pages/controls/wireless/native/wireless_operations.cc',
  'src/pages/controls/wireless/native/wireless_common.cc',
  'src/pages/controls/wifi/native/wifi.cc',
  'src/pages/controls/wireless/native/wireless_radio.cc',
  'src/pages/controls/bluetooth/native/bluetooth.cc',
  'src/pages/controls/wireless/native/wireless_state.cc'
];
const native = nativeFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const audioFiles = [
  'src/pages/controls/audio/native/audio_addon.cc',
  'src/pages/controls/audio/native/loopback.cc',
  'src/pages/controls/audio/native/loopback.h'
];
const audio = audioFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const preload = fs.readFileSync('src/preload.js', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const appxConfig = fs.readFileSync('electron-builder.appx.yml', 'utf8');
if (['src/renderer/pages', 'src/main/pages', 'src/native/pages'].some(directory => fs.existsSync(directory))) {
  throw new Error('Page code must stay grouped under src/pages by page and implementation type');
}
if (main.includes('netsh.exe') || main.includes('radioPowerShellPrelude') || main.includes('NOTCH_BLUETOOTH_DEVICE_ID')) {
  throw new Error('Wi-Fi and Bluetooth operations must use the native addon, not PowerShell or netsh');
}
if (!main.includes("path.join(process.resourcesPath, 'wireless.node')") || !main.includes("path.join(__dirname, 'native', 'build', 'Release', 'wireless.node')") || !main.includes('wirelessAddon().getState()')) {
  throw new Error('The main process must load and use the native wireless addon');
}
if (!main.includes("path.join(process.resourcesPath, 'audio.node')") || !main.includes("path.join(__dirname, 'native', 'build', 'Release', 'audio.node')") || !audio.includes('AUDCLNT_STREAMFLAGS_LOOPBACK') || !audio.includes('IAudioCaptureClient')) {
  throw new Error('External media visualization must use Windows loopback audio samples');
}
if (!native.includes('WlanOpenHandle') || !native.includes('WlanGetAvailableNetworkList') || !native.includes('WlanConnect') || !native.includes('WlanDisconnect')) {
  throw new Error('The native addon must use the Windows WLAN API for discovery and connection');
}
if (!native.includes('Radio::GetRadiosAsync') || !native.includes('BluetoothDevice::GetDeviceSelectorFromPairingState') || !native.includes('PairAsync')) {
  throw new Error('The native addon must expose Windows radio and Bluetooth discovery/pairing APIs');
}
if (!native.includes('napi_create_async_work') || !packageJson.scripts['build:native'] || !packageJson.build.extraResources?.some(resource => resource.from === 'src/native/build/Release/wireless.node' && resource.to === 'wireless.node') || !packageJson.build.extraResources?.some(resource => resource.from === 'src/native/build/Release/audio.node' && resource.to === 'audio.node')) {
  throw new Error('Native operations must be asynchronous and the addon must be included alongside packaged app resources');
}
if (!preload.includes("scanWifi: invoke('notch:wireless:wifi:scan')") || !preload.includes("scanBluetooth: invoke('notch:wireless:bluetooth:scan')")) {
  throw new Error('The preload bridge must expose native Wi-Fi and Bluetooth scanning to the renderer');
}
if (!integration.includes('api.wireless.scanWifi()') || !integration.includes('api.wireless.scanBluetooth(deep)') || !integration.includes('api.wireless.pairBluetooth(deviceId)')) {
  throw new Error('Wi-Fi scanning and Bluetooth discovery/pairing must be wired to the in-notch panels');
}
if (!appxConfig.includes('from: src/native/build/Release/wireless.node') || !appxConfig.includes('from: src/native/build/Release/audio.node')) {
  throw new Error('The AppX package must include the native wireless and audio addons');
}
if (!native.includes('Windows did not confirm the Wi-Fi connection') || !native.includes('BluetoothConnectionStatus::Connected')) {
  throw new Error('Native connection results must be verified against Windows state');
}
if (!fs.readFileSync('src/native/binding.gyp', 'utf8').includes('"../pages/controls/wifi/native/wifi.cc"') ||
    !fs.readFileSync('src/native/binding.gyp', 'utf8').includes('"../pages/controls/bluetooth/native/bluetooth.cc"')) {
  throw new Error('The native build must compile the focused wireless modules');
}
if (!fs.readFileSync('src/native/binding.gyp', 'utf8').includes('"../pages/controls/audio/native/loopback.cc"') ||
    !preload.includes("onLevels: callback => subscribe('notch:media:levels', callback)") ||
    !integration.includes('api.media.onLevels(levels =>') ||
    fs.readFileSync('src/renderer/app.js', 'utf8').includes('Math.sin(t*5.2')) {
  throw new Error('The media visualizer must receive real loopback levels instead of generated external-media waves');
}
if (main.includes("spawn('control.exe', ['bthprops.cpl']")) throw new Error('Bluetooth pairing must not open the legacy Control Panel flow');
if (!fs.existsSync('src/renderer/native.css')) throw new Error('Native renderer styles are missing');

const icon = fs.readFileSync('assets/notch.ico');
if (icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1) throw new Error('assets/notch.ico is not a valid Windows icon');
console.log('Notch source syntax, package metadata, and Windows icon are valid.');
