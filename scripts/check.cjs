const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('src/renderer/index.html', 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
if (!inlineScript) throw new Error('Could not find the original inline renderer script');

for (const file of ['src/main.js', 'src/preload.js']) {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
}
new vm.Script(inlineScript, { filename: 'src/renderer/index.html' });
const integration = fs.readFileSync('src/renderer/native-integration.js', 'utf8');
new vm.Script(integration, { filename: 'src/renderer/native-integration.js' });
if (!html.includes('<script src="native-integration.js"></script>')) throw new Error('Native renderer integration is not loaded');
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
if (!integration.includes('wifi.connected ? `Connected to ${escapeMarkup(wifi.name || \'Wi-Fi\')}`') || !integration.includes('wifiConnectionAttempt ? `Connecting to')) {
  throw new Error('Wi-Fi must show connecting and confirmed connected status');
}
const main = fs.readFileSync('src/main.js', 'utf8');
const nativeFiles = [
  'src/native/wireless_addon.cc',
  'src/native/wireless_operations.cc',
  'src/native/wireless_common.cc',
  'src/native/wireless_wifi.cc',
  'src/native/wireless_radio.cc',
  'src/native/wireless_bluetooth.cc',
  'src/native/wireless_state.cc'
];
const native = nativeFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const preload = fs.readFileSync('src/preload.js', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (fs.existsSync('src/native/wireless.cc')) {
  throw new Error('Native wireless responsibilities must remain split into focused modules');
}
if (main.includes('netsh.exe') || main.includes('radioPowerShellPrelude') || main.includes('NOTCH_BLUETOOTH_DEVICE_ID')) {
  throw new Error('Wi-Fi and Bluetooth operations must use the native addon, not PowerShell or netsh');
}
if (!main.includes("path.join(process.resourcesPath, 'wireless.node')") || !main.includes("path.join(__dirname, 'native', 'build', 'Release', 'wireless.node')") || !main.includes('wirelessAddon().getState()')) {
  throw new Error('The main process must load and use the native wireless addon');
}
if (!native.includes('WlanOpenHandle') || !native.includes('WlanGetAvailableNetworkList') || !native.includes('WlanConnect') || !native.includes('WlanDisconnect')) {
  throw new Error('The native addon must use the Windows WLAN API for discovery and connection');
}
if (!native.includes('Radio::GetRadiosAsync') || !native.includes('BluetoothDevice::GetDeviceSelectorFromPairingState') || !native.includes('PairAsync')) {
  throw new Error('The native addon must expose Windows radio and Bluetooth discovery/pairing APIs');
}
if (!native.includes('napi_create_async_work') || !packageJson.scripts['build:native'] || !packageJson.build.extraResources?.some(resource => resource.from === 'src/native/build/Release/wireless.node' && resource.to === 'wireless.node')) {
  throw new Error('Native operations must be asynchronous and the addon must be included alongside packaged app resources');
}
if (!preload.includes("scanWifi: invoke('notch:wireless:wifi:scan')") || !preload.includes("scanBluetooth: invoke('notch:wireless:bluetooth:scan')")) {
  throw new Error('The preload bridge must expose native Wi-Fi and Bluetooth scanning to the renderer');
}
if (!integration.includes('api.wireless.scanWifi()') || !integration.includes('api.wireless.scanBluetooth(deep)') || !integration.includes('api.wireless.pairBluetooth(deviceId)')) {
  throw new Error('Wi-Fi scanning and Bluetooth discovery/pairing must be wired to the in-notch panels');
}
if (!fs.readFileSync('electron-builder.appx.yml', 'utf8').includes('from: src/native/build/Release/wireless.node')) {
  throw new Error('The AppX package must include the native wireless addon');
}
if (!native.includes('Windows did not confirm the Wi-Fi connection') || !native.includes('BluetoothConnectionStatus::Connected')) {
  throw new Error('Native connection results must be verified against Windows state');
}
if (!fs.readFileSync('src/native/binding.gyp', 'utf8').includes('"wireless_wifi.cc"') ||
    !fs.readFileSync('src/native/binding.gyp', 'utf8').includes('"wireless_bluetooth.cc"')) {
  throw new Error('The native build must compile the focused wireless modules');
}
if (main.includes("spawn('control.exe', ['bthprops.cpl']")) throw new Error('Bluetooth pairing must not open the legacy Control Panel flow');
if (!fs.existsSync('src/renderer/native.css')) throw new Error('Native renderer styles are missing');

const icon = fs.readFileSync('assets/notch.ico');
if (icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1) throw new Error('assets/notch.ico is not a valid Windows icon');
console.log('Notch source syntax, package metadata, and Windows icon are valid.');
