const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, dialog, globalShortcut, clipboard, Notification } = require('electron');
const si = require('systeminformation');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const defaults = {
  startup: false, alwaysOnTop: true, clickThrough: false, animations: true,
  clipboardEnabled: true, clipboardLimit: 100, clipboardRetentionDays: 30,
  monitorRefreshMs: 3000, globalShortcut: 'CommandOrControl+Shift+Space',
  notifications: true, timeFormat: '12h', theme: 'dark', displayId: null
};
let win;
let tray;
let config = { ...defaults };
let clipboardHistory = [];
let lastClipboardText = '';
let suppressedText = '';
let registeredShortcut = null;
let clipboardTimer;
let pendingOpen;
let shuttingDown = false;
let dataLoaded = false;
let cpuLoadPrimed = false;
let mediaProcess;
let mediaState = { supported: null, active: false };
let windowScene = { mode: 'idle', height: 22, wide: false };
const hasSingleInstanceLock = app.requestSingleInstanceLock();

const dataFile = () => path.join(app.getPath('userData'), 'notch-data.json');
const cleanText = value => typeof value === 'string' && value.length <= 20000 ? value.trim() : '';
const sensitiveText = text => /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:password|passphrase|secret|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S/i.test(text);

function loadData() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    config = { ...defaults, ...saved.settings };
    clipboardHistory = Array.isArray(saved.clipboardHistory) ? saved.clipboardHistory : [];
  } catch { /* first launch */ }
  pruneClipboard();
}

function saveData() {
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    fs.writeFileSync(dataFile(), JSON.stringify({ settings: config, clipboardHistory }, null, 2), 'utf8');
  } catch (error) { console.error('Could not save Notch data:', error); }
}

function pruneClipboard() {
  const before = clipboardHistory.length;
  const cutoff = Date.now() - Math.max(1, config.clipboardRetentionDays) * 86400000;
  clipboardHistory = clipboardHistory.filter(item => item.pinned || item.createdAt >= cutoff)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
    .slice(0, Math.max(10, config.clipboardLimit));
  if (before !== clipboardHistory.length) saveData();
}

function broadcast(channel, value) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, value);
}

function handleIpc(channel, listener) {
  return ipcMain.handle(channel, (event, ...args) => {
    const contents = win && !win.isDestroyed() ? win.webContents : null;
    const frame = event.senderFrame;
    if (!contents || event.sender !== contents || frame !== contents.mainFrame || frame.url !== contents.getURL()) {
      throw new Error('Untrusted IPC sender');
    }
    return listener(event, ...args);
  });
}

function startMediaMonitor() {
  const script = fs.readFileSync(path.join(__dirname, 'media.ps1'), 'utf8');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  mediaProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'ignore']
  });
  let output = '';
  const update = line => {
    try {
      const next = JSON.parse(line);
      if (next.active && !Object.hasOwn(next, 'cover') && mediaState.cover) next.cover = mediaState.cover;
      mediaState = next;
      broadcast('notch:media:changed', mediaState);
    } catch { /* ignore incomplete or non-JSON output */ }
  };
  mediaProcess.stdout.setEncoding('utf8');
  mediaProcess.stdout.on('data', chunk => {
    output += chunk;
    const lines = output.split(/\r?\n/);
    output = lines.pop();
    lines.forEach(update);
  });
  mediaProcess.on('error', error => {
    mediaState = { supported: false, active: false, error: error.message };
    broadcast('notch:media:changed', mediaState);
  });
  mediaProcess.on('exit', () => {
    mediaProcess = null;
    if (!shuttingDown) {
      mediaState = { supported: false, active: false };
      broadcast('notch:media:changed', mediaState);
    }
  });
}

function targetDisplay() {
  const found = config.displayId == null ? null : screen.getAllDisplays().find(d => d.id === config.displayId);
  return found || screen.getPrimaryDisplay();
}

function bounds(mode = 'idle', sceneHeight = 520, wide = false) {
  const display = targetDisplay();
  const area = display.workArea;
  let width;
  let height;
  if (mode === 'expanded') {
    width = Math.min(wide ? 964 : 784, Math.max(1, area.width - 24));
    height = Math.min(area.height, 760, Math.max(200, Math.round(Number(sceneHeight) || 520)));
  } else if (mode === 'peek') {
    width = Math.min(area.width, 420);
    height = Math.min(area.height, 164);
  } else if (mode === 'playing') {
    width = Math.min(area.width, 178);
    height = Math.min(area.height, 24);
  } else {
    width = Math.min(area.width, 116);
    height = Math.min(area.height, 22);
  }
  return { x: Math.round(area.x + (area.width - width) / 2), y: area.y, width, height };
}

function setWindowScene(scene) {
  if (!scene || !['idle', 'playing', 'peek', 'expanded'].includes(scene.mode)) return false;
  windowScene = {
    mode: scene.mode,
    height: Number.isFinite(Number(scene.height)) ? Number(scene.height) : 520,
    wide: scene.wide === true
  };
  if (!win || win.isDestroyed()) return false;
  win.setBounds(bounds(windowScene.mode, windowScene.height, windowScene.wide), false);
  win.webContents.send('notch:expanded', windowScene.mode === 'expanded');
  return true;
}

function repositionWindow() {
  if (win && !win.isDestroyed()) {
    win.setBounds(bounds(windowScene.mode, windowScene.height, windowScene.wide), false);
  }
}

function openWindow(action = 'toggle') {
  if (!win || win.isDestroyed()) {
    pendingOpen = action === 'toggle' ? 'controls' : action;
    createWindow();
    return;
  }
  const open = action !== 'toggle' || !win.isVisible();
  if (open) {
    setClickThrough(config.clickThrough);
    setWindowScene({ mode: 'expanded', height: windowScene.height, wide: windowScene.wide });
    win.showInactive();
    if (win.webContents.isLoading()) pendingOpen = action;
    else win.webContents.send('notch:open', action);
  } else {
    win.webContents.send('notch:toggle');
  }
}

function setClickThrough(enabled) {
  if (!win || win.isDestroyed()) return;
  if (enabled) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
}

function registerShortcut(shortcut) {
  if (!shortcut) return false;
  if (shortcut === registeredShortcut) return true;
  if (!globalShortcut.register(shortcut, () => openWindow('toggle'))) return false;
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  registeredShortcut = shortcut;
  return true;
}

function setStartup(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: app.getPath('exe') });
}

function createTray() {
  const icon = path.join(__dirname, '..', 'assets', 'notch.ico');
  tray = new Tray(icon);
  tray.setToolTip('Notch');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Notch', click: () => openWindow('controls') },
    { label: 'Settings', click: () => openWindow('settings') },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: config.startup, click: item => { config.startup = item.checked; setStartup(item.checked); saveData(); updateTray(); } },
    { label: 'Click through', type: 'checkbox', checked: config.clickThrough, click: item => { config.clickThrough = item.checked; setClickThrough(item.checked); saveData(); updateTray(); } },
    { type: 'separator' },
    { label: 'Exit Notch', click: () => { shuttingDown = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu());
  tray.on('double-click', () => openWindow('controls'));
  tray.on('click', () => openWindow('toggle'));
  tray.updateMenu = () => tray.setContextMenu(menu());
}

function updateTray() { tray?.updateMenu?.(); }

function createWindow() {
  win = new BrowserWindow({
    ...bounds(windowScene.mode, windowScene.height, windowScene.wide),
    icon: path.join(__dirname, '..', 'assets', 'notch.ico'),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: config.alwaysOnTop,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setClickThrough(config.clickThrough);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url).catch(console.error);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.on('close', event => { if (!shuttingDown) { event.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  win.webContents.on('did-finish-load', () => {
    if (pendingOpen) { win.webContents.send('notch:open', pendingOpen); pendingOpen = null; }
  });
}

async function openExternal(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid link'); }
  if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('This link type is not allowed');
  await shell.openExternal(url.href);
}

async function systemStats(order = 'cpu') {
  let load = await si.currentLoad();
  if (!cpuLoadPrimed) {
    await new Promise(resolve => setTimeout(resolve, 250));
    load = await si.currentLoad();
    cpuLoadPrimed = true;
  }
  const [memory, graphics, drives, interfaces, processes, netStats] = await Promise.all([
    si.mem(), si.graphics().catch(() => ({ controllers: [] })), si.fsSize().catch(() => []),
    si.networkInterfaces().catch(() => []), si.processes().catch(() => ({ list: [] })), si.networkStats().catch(() => [])
  ]);
  const gpu = graphics.controllers?.[0] || {};
  const disk = drives.find(x => String(x.mount).toUpperCase() === 'C:') || drives.find(x => x.mount === '/') || drives[0];
  const netRows = (netStats || []).filter(x => x.iface && !/loopback|lo$/i.test(x.iface));
  const ratesReady = netRows.length > 0 && netRows.every(x => Number.isFinite(x.rx_sec) && Number.isFinite(x.tx_sec) && x.rx_sec >= 0 && x.tx_sec >= 0);
  const rx = ratesReady ? netRows.reduce((n, x) => n + x.rx_sec, 0) / 1048576 : null;
  const tx = ratesReady ? netRows.reduce((n, x) => n + x.tx_sec, 0) / 1048576 : null;
  const active = (interfaces || []).find(x => x.operstate === 'up' && !x.internal);
  const sortByMemory = order === 'ram';
  const topProcesses = (processes.list || []).filter(p => p.name && Number.isFinite(Number(p.cpu)) && Number.isFinite(Number(p.memRss)))
    .sort((a, b) => sortByMemory ? Number(b.memRss) - Number(a.memRss) : Number(b.cpu) - Number(a.cpu)).slice(0, 5)
    .map(p => ({ name: p.name, cpu: Number(p.cpu), memoryMb: Number(p.memRss) / 1024 }));
  const gpuLoad = Number(gpu.utilizationGpu);
  return {
    cpu: Number(load.currentLoad) || 0,
    cpuName: os.cpus()[0]?.model || 'Processor',
    threads: os.cpus().length,
    memoryUsed: Math.max(0, (Number(memory.total) || 0) - (Number(memory.available) || 0)),
    memoryTotal: Number(memory.total) || 0,
    gpuName: gpu.model || gpu.name || null,
    gpu: Number.isFinite(gpuLoad) && gpuLoad >= 0 && gpuLoad <= 100 ? gpuLoad : null,
    disk: disk ? { used: Number(disk.used) || 0, size: Number(disk.size) || 0, available: Math.max(0, (Number(disk.size) || 0) - (Number(disk.used) || 0)), mount: disk.mount } : null,
    network: { online: !!active, name: active?.iface || null, rx, tx },
    uptimeSeconds: os.uptime(), topProcesses,
    gpuAvailable: Number.isFinite(gpuLoad) && gpuLoad >= 0 && gpuLoad <= 100
  };
}

const volumeCode = String.raw`
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumeratorComObject {}
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
public interface IMMDeviceEnumerator { [PreserveSig] int EnumAudioEndpoints(int flow,int mask,out IntPtr devices); [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device); }
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("D666063F-1587-4E43-81F1-B948E807363F")]
public interface IMMDevice { [PreserveSig] int Activate(ref Guid iid,int cls,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object result); }
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
public interface IAudioEndpointVolume {
 [PreserveSig] int RegisterControlChangeNotify(IntPtr x); [PreserveSig] int UnregisterControlChangeNotify(IntPtr x); [PreserveSig] int GetChannelCount(out uint n);
 [PreserveSig] int SetMasterVolumeLevel(float v,ref Guid c); [PreserveSig] int SetMasterVolumeLevelScalar(float v,ref Guid c);
 [PreserveSig] int GetMasterVolumeLevel(out float v,ref Guid c); [PreserveSig] int GetMasterVolumeLevelScalar(out float v,ref Guid c);
 [PreserveSig] int SetChannelVolumeLevel(uint n,float v,ref Guid c); [PreserveSig] int SetChannelVolumeLevelScalar(uint n,float v,ref Guid c);
 [PreserveSig] int GetChannelVolumeLevel(uint n,out float v,ref Guid c); [PreserveSig] int GetChannelVolumeLevelScalar(uint n,out float v,ref Guid c);
 [PreserveSig] int SetMute(bool mute,ref Guid c); [PreserveSig] int GetMute(out bool mute);
}
public static class NotchAudioBridge {
 private static T WithEndpoint<T>(Func<IAudioEndpointVolume,T> action) {
  object enumeratorObject=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
  IMMDevice device=null; object endpointObject=null;
  try {
   var enumerator=(IMMDeviceEnumerator)enumeratorObject;
   Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0,0,out device));
   var iid=new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
   Marshal.ThrowExceptionForHR(device.Activate(ref iid,23,IntPtr.Zero,out endpointObject));
   return action((IAudioEndpointVolume)endpointObject);
  } finally {
   if(endpointObject!=null && Marshal.IsComObject(endpointObject)) Marshal.ReleaseComObject(endpointObject);
   if(device!=null && Marshal.IsComObject(device)) Marshal.ReleaseComObject(device);
   if(enumeratorObject!=null && Marshal.IsComObject(enumeratorObject)) Marshal.ReleaseComObject(enumeratorObject);
  }
 }
 public static int GetMasterVolumePercent() {
  return WithEndpoint(v=>{float level; Guid context=Guid.Empty; var hr=v.GetMasterVolumeLevelScalar(out level,ref context); Marshal.ThrowExceptionForHR(hr); return (int)Math.Round(level*100);});
 }
 public static int SetMasterVolumePercent(int percent) {
  return WithEndpoint(v=>{Guid context=Guid.Empty; var hr=v.SetMasterVolumeLevelScalar(percent/100f,ref context); Marshal.ThrowExceptionForHR(hr); float level; hr=v.GetMasterVolumeLevelScalar(out level,ref context); Marshal.ThrowExceptionForHR(hr); return (int)Math.Round(level*100);});
 }
 public static bool GetMute() {
  return WithEndpoint(v=>{bool muted; var hr=v.GetMute(out muted); Marshal.ThrowExceptionForHR(hr); return muted;});
 }
 public static bool SetMute(bool muted) {
  return WithEndpoint(v=>{Guid context=Guid.Empty; var hr=v.SetMute(muted,ref context); Marshal.ThrowExceptionForHR(hr); bool actual; hr=v.GetMute(out actual); Marshal.ThrowExceptionForHR(hr); return actual;});
 }
}`;

async function audioVolume(mode, value) {
  if (mode === 'set' && !Number.isFinite(Number(value))) throw new Error('Volume must be a number');
  const ps = `$ErrorActionPreference='Stop'\n$code=@'\n${volumeCode}\n'@\nAdd-Type -TypeDefinition $code\n$e=[IMMDeviceEnumerator][Activator]::CreateInstance([type]::GetTypeFromCLSID([guid]'BCDE0395-E52F-467C-8E3D-C4579291692E'))\n$d=$null\n$hr=$e.GetDefaultAudioEndpoint(0,0,[ref]$d)\nif($hr -lt 0 -or !$d){throw \"Could not open the default Windows audio output (HRESULT $hr)\"}\n$iid=[guid]'5CDF2C82-841E-4546-9722-0CF74078229A'\n$o=$null\n$hr=$d.Activate([ref]$iid,23,[IntPtr]::Zero,[ref]$o)\nif($hr -lt 0 -or !$o){throw \"Could not access Windows master volume (HRESULT $hr)\"}\n$v=[IAudioEndpointVolume]$o\n$c=[guid]::Empty\nif($env:NOTCH_AUDIO_MODE -eq 'set'){ $scalar=[single]([double]$env:NOTCH_AUDIO_VALUE/100); $hr=$v.SetMasterVolumeLevelScalar($scalar,[ref]$c); if($hr -lt 0){throw \"Windows rejected the volume change (HRESULT $hr)\"}; $n=[single]0; $hr=$v.GetMasterVolumeLevelScalar([ref]$n,[ref]$c); if($hr -lt 0){throw \"Could not verify Windows master volume (HRESULT $hr)\"}; [int][Math]::Round($n*100) } elseif($env:NOTCH_AUDIO_MODE -eq 'mute'){ $muted=$env:NOTCH_AUDIO_VALUE -eq 'true'; $hr=$v.SetMute($muted,[ref]$c); if($hr -lt 0){throw \"Windows rejected the mute change (HRESULT $hr)\"}; $muted=$false; $hr=$v.GetMute([ref]$muted); if($hr -lt 0){throw \"Could not verify Windows mute state (HRESULT $hr)\"}; ConvertTo-Json -Compress $muted } else { $n=[single]0; $hr=$v.GetMasterVolumeLevelScalar([ref]$n,[ref]$c); if($hr -lt 0){throw \"Could not read Windows master volume (HRESULT $hr)\"}; if($env:NOTCH_AUDIO_MODE -eq 'state'){ $muted=$false; $hr=$v.GetMute([ref]$muted); if($hr -lt 0){throw \"Could not read Windows mute state (HRESULT $hr)\"}; ConvertTo-Json -Compress @{volume=[int][Math]::Round($n*100);muted=$muted} } else { [int][Math]::Round($n*100) } }`;
  const powershellScript = `$ErrorActionPreference='Stop'\n$code=@'\n${volumeCode}\n'@\nAdd-Type -TypeDefinition $code\nif($env:NOTCH_AUDIO_MODE -eq 'set'){ [NotchAudioBridge]::SetMasterVolumePercent([int]$env:NOTCH_AUDIO_VALUE) } elseif($env:NOTCH_AUDIO_MODE -eq 'mute'){ [NotchAudioBridge]::SetMute($env:NOTCH_AUDIO_VALUE -eq 'true') | ConvertTo-Json -Compress } else { $volume=[NotchAudioBridge]::GetMasterVolumePercent(); if($env:NOTCH_AUDIO_MODE -eq 'state'){ $muted=[NotchAudioBridge]::GetMute(); ConvertTo-Json -Compress @{volume=$volume;muted=$muted} } else { $volume } }`;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', powershellScript], {
    windowsHide: true, timeout: 7000,
    env: { ...process.env, NOTCH_AUDIO_MODE: mode, NOTCH_AUDIO_VALUE: mode === 'mute' ? String(!!value).toLowerCase() : String(Math.max(0, Math.min(100, Math.round(Number(value) || 0)))) }
  });
  if (mode === 'state' || mode === 'mute') return JSON.parse(stdout.trim());
  return Number(stdout.trim());
}

function latestWriter(operation) {
  let pending;
  let hasPending = false;
  let running;
  return value => {
    pending = value;
    hasPending = true;
    if (!running) {
      running = (async () => {
        let result;
        while (hasPending) {
          const next = pending;
          pending = undefined;
          hasPending = false;
          try {
            result = await operation(next);
          } catch (error) {
            if (!hasPending) throw error;
          }
        }
        return result;
      })().finally(() => { running = undefined; });
    }
    return running;
  };
}

const setAudioVolume = latestWriter(value => audioVolume('set', value));

async function getControls() {
  const result = { wifi: { connected: false, name: null }, bluetooth: { available: false, devices: [] }, volume: null, muted: null, brightness: null, brightnessSupported: false };
  if (process.platform !== 'win32') return result;
  try {
    const { stdout } = await run('netsh.exe', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 4000 });
    const state = stdout.match(/^\s*State\s*:\s*(.+)$/im)?.[1]?.trim();
    result.wifi.connected = /^connected$/i.test(state || '');
    result.wifi.name = result.wifi.connected ? (stdout.match(/^\s*SSID\s*:\s*(.+)$/im)?.[1]?.trim() || null) : null;
  } catch { /* Wi-Fi may be unavailable or not connected */ }
  try {
    const ps = "$d=Get-PnpDevice -Class Bluetooth -ErrorAction Stop | Where-Object Status -eq 'OK' | Select-Object -ExpandProperty FriendlyName; ConvertTo-Json -Compress @($d)";
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 5000 });
    const parsed = JSON.parse(stdout || '[]');
    result.bluetooth.devices = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
    result.bluetooth.available = true;
  } catch { /* Bluetooth query is not available on every Windows install */ }
  try { Object.assign(result, await audioVolume('state')); } catch (error) { console.warn('Could not query Windows master volume:', error.message); }
  try {
    const ps = "$bs=@(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Where-Object Active | Sort-Object InstanceName); $ms=@(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue | Where-Object Active); $pair=$null; foreach($b in $bs){$m=$ms | Where-Object InstanceName -eq $b.InstanceName | Select-Object -First 1; if($m){$pair=[pscustomobject]@{brightness=$b;methods=$m};break}}; if(!$pair){[pscustomobject]@{brightness=$null;supported=$false}|ConvertTo-Json -Compress;exit 0}; [pscustomobject]@{brightness=[int]$pair.brightness.CurrentBrightness;supported=$true}|ConvertTo-Json -Compress";
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 5000 });
    const state = JSON.parse(stdout.trim());
    if (state.supported && Number.isFinite(state.brightness)) {
      result.brightness = state.brightness;
      result.brightnessSupported = true;
    }
  } catch (error) { console.warn('Could not query Windows display brightness support:', error.message); }
  return result;
}

async function setBrightness(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) throw new Error('Brightness must be a number');
  const level = Math.max(0, Math.min(100, Math.round(numericValue)));
  const ps = "$bs=@(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Where-Object Active | Sort-Object InstanceName); $ms=@(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Where-Object Active); $pair=$null; foreach($b in $bs){$m=$ms | Where-Object InstanceName -eq $b.InstanceName | Select-Object -First 1; if($m){$pair=[pscustomobject]@{brightness=$b;methods=$m};break}}; if(!$pair){throw 'Brightness control is unavailable on this display'}; $r=Invoke-CimMethod -InputObject $pair.methods -MethodName WmiSetBrightness -Arguments @{Timeout=[uint32]1;Brightness=[byte]$env:NOTCH_BRIGHTNESS}; if($null -ne $r -and $r.PSObject.Properties['ReturnValue'] -and [int]$r.ReturnValue -ne 0){throw \"Display rejected brightness change (return code $($r.ReturnValue))\"}";
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 5000, env: { ...process.env, NOTCH_BRIGHTNESS: String(level) } });
  return level;
}

const setDisplayBrightness = latestWriter(setBrightness);

let startMenuLinks;
const appIconCache = new Map();
const appKey = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

function getStartMenuLinks() {
  if (startMenuLinks) return startMenuLinks;
  startMenuLinks = new Map();
  const roots = [
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ];
  const visit = (dir, depth = 0) => {
    if (depth > 8) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file, depth + 1);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.lnk') {
        try { startMenuLinks.set(appKey(path.basename(entry.name, '.lnk')), { file, ...shell.readShortcutLink(file) }); } catch { /* Broken shortcuts are ignored. */ }
      }
    }
  };
  roots.forEach(root => visit(root));
  return startMenuLinks;
}

function findStartMenuLink(name) {
  const key = appKey(name);
  const links = getStartMenuLinks();
  if (links.has(key)) return links.get(key);
  return [...links.entries()].filter(([candidate]) => candidate.startsWith(key) || key.startsWith(candidate))
    .sort(([a], [b]) => Math.abs(a.length - key.length) - Math.abs(b.length - key.length))[0]?.[1] || null;
}

async function appIcon(candidate) {
  if (!candidate) return null;
  if (!appIconCache.has(candidate)) appIconCache.set(candidate, app.getFileIcon(candidate, { size: 'normal' })
    .then(image => image.isEmpty() ? null : image.toDataURL()).catch(() => null));
  return appIconCache.get(candidate);
}

async function startApps() {
  if (process.platform !== 'win32') return [];
  const ps = "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress";
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 12000, maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout || '[]');
  return (Array.isArray(parsed) ? parsed : [parsed]).filter(a => a?.Name && a?.AppID)
    .map(a => ({ name: String(a.Name), id: String(a.AppID) })).sort((a, b) => a.name.localeCompare(b.name));
}

async function installedApps() {
  return Promise.all((await startApps()).map(async item => {
    const link = findStartMenuLink(item.name);
    const iconPath = link?.icon?.replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '').replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
    return { ...item, icon: await appIcon(iconPath) || await appIcon(link?.target) || await appIcon(link?.file) || await appIcon(`shell:AppsFolder\\${item.id}`) };
  }));
}

async function pickWallpaper() {
  const choice = await dialog.showOpenDialog(win, { title: 'Choose a wallpaper image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }] });
  if (choice.canceled || !choice.filePaths[0]) return null;
  const file = choice.filePaths[0];
  const stat = fs.statSync(file);
  if (stat.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
  return { name: path.basename(file, ext), path: file, dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` };
}

async function applyWallpaper(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !fs.existsSync(file)) throw new Error('Choose a local image first.');
  const ps = String.raw`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class NotchWallpaper { [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int SystemParametersInfo(int action,int param,string path,int flags); }'; $r=[NotchWallpaper]::SystemParametersInfo(20,0,$env:NOTCH_WALLPAPER,3); if($r -ne 1){exit 1}`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 10000, env: { ...process.env, NOTCH_WALLPAPER: file } });
}

async function powerAction(action) {
  if (!['lock', 'sleep', 'restart', 'shutdown'].includes(action)) throw new Error('Unsupported power action');
  if (action === 'restart' || action === 'shutdown') {
    const word = action === 'restart' ? 'restart' : 'shut down';
    const answer = await dialog.showMessageBox(win, { type: 'warning', title: `Confirm ${word}`, message: `Do you want to ${word} Windows now?`, detail: 'Open files and applications may close.', buttons: ['Cancel', action === 'restart' ? 'Restart Windows' : 'Shut down Windows'], defaultId: 0, cancelId: 0, noLink: true });
    if (answer.response !== 1) return false;
  }
  if (action === 'lock') await run('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true });
  if (action === 'sleep') {
    const ps = "Add-Type -MemberDefinition '[DllImport(\"powrprof.dll\")] public static extern bool SetSuspendState(bool hibernate,bool forceCritical,bool disableWakeEvent);' -Name NotchPower -Namespace Native; [Native.NotchPower]::SetSuspendState($false,$false,$false) | Out-Null";
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 5000 });
  }
  if (action === 'restart') await run('shutdown.exe', ['/r', '/t', '0', '/c', 'Restart requested by Notch'], { windowsHide: true });
  if (action === 'shutdown') await run('shutdown.exe', ['/s', '/t', '0', '/c', 'Shutdown requested by Notch'], { windowsHide: true });
  return true;
}

handleIpc('notch:settings:get', () => ({ ...config }));
handleIpc('notch:settings:save', async (_event, patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
  const next = { ...config };
  for (const key of ['startup', 'alwaysOnTop', 'clickThrough', 'animations', 'clipboardEnabled', 'notifications']) if (key in patch) next[key] = !!patch[key];
  if ('clipboardLimit' in patch) next.clipboardLimit = Math.max(10, Math.min(500, Number(patch.clipboardLimit) || 100));
  if ('clipboardRetentionDays' in patch) next.clipboardRetentionDays = Math.max(1, Math.min(365, Number(patch.clipboardRetentionDays) || 30));
  if ('monitorRefreshMs' in patch) next.monitorRefreshMs = Math.max(1000, Math.min(10000, Number(patch.monitorRefreshMs) || 3000));
  if ('timeFormat' in patch && ['12h', '24h'].includes(patch.timeFormat)) next.timeFormat = patch.timeFormat;
  if ('theme' in patch && ['dark', 'light', 'system'].includes(patch.theme)) next.theme = patch.theme;
  if ('displayId' in patch && (patch.displayId === null || screen.getAllDisplays().some(d => d.id === patch.displayId))) next.displayId = patch.displayId;
  if ('globalShortcut' in patch && typeof patch.globalShortcut === 'string') {
    if (!registerShortcut(patch.globalShortcut)) throw new Error('That shortcut is unavailable. Choose a different key combination.');
    next.globalShortcut = patch.globalShortcut;
  }
  config = next;
  if ('startup' in patch) setStartup(config.startup);
  win?.setAlwaysOnTop(config.alwaysOnTop);
  setClickThrough(config.clickThrough);
  if ('displayId' in patch) repositionWindow();
  pruneClipboard();
  saveData();
  updateTray();
  return { ...config };
});
handleIpc('notch:system:stats', systemStats);
handleIpc('notch:media:get', () => mediaState);
handleIpc('notch:media:control', (_event, action) => {
  if (!['toggle', 'previous', 'next'].includes(action) || !mediaProcess || !mediaState.supported) return false;
  try { mediaProcess.stdin.write(`${action}\n`); return true; } catch { return false; }
});
handleIpc('notch:controls:get', getControls);
handleIpc('notch:controls:volume', async (_event, value) => setAudioVolume(value));
handleIpc('notch:controls:mute', async (_event, muted) => audioVolume('mute', !!muted));
handleIpc('notch:controls:brightness', async (_event, value) => setDisplayBrightness(value));
handleIpc('notch:windows:settings', async (_event, area) => {
  const uris = { wifi: 'ms-settings:network-wifi', bluetooth: 'ms-settings:bluetooth', audio: 'ms-settings:sound', nightlight: 'ms-settings:nightlight', display: 'ms-settings:display', power: 'ms-settings:powersleep', startup: 'ms-settings:startupapps' };
  if (!uris[area]) throw new Error('Unsupported Windows settings page');
  await shell.openExternal(uris[area]);
});
handleIpc('notch:apps:list', installedApps);
handleIpc('notch:apps:launch', async (_event, id) => {
  const apps = await startApps();
  const selected = apps.find(a => a.id === id);
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
  const choice = await dialog.showOpenDialog(win, { title: 'Add an application', properties: ['openFile'], filters: [{ name: 'Applications', extensions: ['exe', 'lnk', 'bat', 'cmd'] }] });
  if (choice.canceled || !choice.filePaths[0]) return null;
  return { name: path.basename(choice.filePaths[0], path.extname(choice.filePaths[0])), path: choice.filePaths[0] };
});
handleIpc('notch:apps:openPath', async (_event, file) => {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !fs.existsSync(file)) throw new Error('Application path is unavailable');
  const error = await shell.openPath(file);
  if (error) throw new Error(error);
});
handleIpc('notch:wallpaper:pick', pickWallpaper);
handleIpc('notch:wallpaper:apply', (_event, file) => applyWallpaper(file));
handleIpc('notch:wallpaper:applyDataUrl', async (_event, value) => {
  if (typeof value !== 'string' || value.length > 16 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error('Invalid wallpaper image');
  const file = path.join(app.getPath('userData'), 'wallpaper.png');
  fs.writeFileSync(file, Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'));
  await applyWallpaper(file);
});
handleIpc('notch:wallpaper:preview', async (_event, file) => {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (stat.size > 25 * 1024 * 1024) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
});
handleIpc('notch:power', (_event, action) => powerAction(action));
handleIpc('notch:external', (_event, url) => openExternal(url));
handleIpc('notch:window:scene', (_event, scene) => setWindowScene(scene));
handleIpc('notch:window:show', () => openWindow('controls'));
handleIpc('notch:clipboard:list', () => clipboardHistory);
handleIpc('notch:clipboard:copy', async (_event, id) => {
  const item = clipboardHistory.find(x => x.id === id);
  if (!item) throw new Error('Clipboard item not found');
  suppressedText = item.text;
  await clipboard.writeText(item.text);
  setTimeout(() => { if (suppressedText === item.text) suppressedText = ''; }, 2500);
});
handleIpc('notch:clipboard:write', async (_event, value) => {
  const text = cleanText(value);
  if (!text) throw new Error('Clipboard text is empty or too long');
  suppressedText = text;
  await clipboard.writeText(text);
  setTimeout(() => { if (suppressedText === text) suppressedText = ''; }, 2500);
});
handleIpc('notch:clipboard:pin', (_event, id) => {
  const item = clipboardHistory.find(x => x.id === id);
  if (!item) return clipboardHistory;
  item.pinned = !item.pinned;
  saveData();
  broadcast('notch:clipboard:changed', clipboardHistory);
  return clipboardHistory;
});
handleIpc('notch:clipboard:delete', (_event, ids) => {
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).filter(x => typeof x === 'string'));
  clipboardHistory = clipboardHistory.filter(x => !wanted.has(x.id));
  saveData();
  broadcast('notch:clipboard:changed', clipboardHistory);
  return clipboardHistory;
});
handleIpc('notch:clipboard:clear', async () => {
  const answer = await dialog.showMessageBox(win, { type: 'warning', title: 'Clear clipboard history', message: 'Delete all saved clipboard items?', buttons: ['Cancel', 'Clear history'], defaultId: 0, cancelId: 0, noLink: true });
  if (answer.response === 1) { clipboardHistory = []; saveData(); broadcast('notch:clipboard:changed', clipboardHistory); }
  return clipboardHistory;
});
handleIpc('notch:notify', (_event, title, body) => {
  if (config.notifications && Notification.isSupported() && typeof title === 'string' && typeof body === 'string') new Notification({ title: title.slice(0, 80), body: body.slice(0, 200) }).show();
});
handleIpc('notch:version', () => app.getVersion());
handleIpc('notch:display:list', () => screen.getAllDisplays().map(d => ({ id: d.id, label: d.label || `Display ${d.id}`, bounds: d.bounds })));

let clipboardBusy = false;
async function monitorClipboard() {
  if (!config.clipboardEnabled || clipboardBusy) return;
  clipboardBusy = true;
  try {
    const text = cleanText(await clipboard.readText());
    if (!text || text === lastClipboardText || text === suppressedText || sensitiveText(text)) return;
    lastClipboardText = text;
    const kind = /^https?:\/\//i.test(text) ? 'link' : /[{};]|^(npm|git|SELECT)\s/i.test(text) ? 'code' : 'text';
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, text, createdAt: Date.now(), pinned: false };
    clipboardHistory.unshift(item);
    pruneClipboard();
    saveData();
    broadcast('notch:clipboard:new', item);
  } catch (error) { console.error('Clipboard monitoring failed:', error); }
  finally { clipboardBusy = false; }
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!win) { pendingOpen = 'controls'; return; }
    openWindow('controls');
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.notch.desktop');
    screen.on('display-added', repositionWindow);
    screen.on('display-removed', repositionWindow);
    screen.on('display-metrics-changed', repositionWindow);
    loadData();
    dataLoaded = true;
    setStartup(config.startup);
    if (!registerShortcut(config.globalShortcut)) {
      config.globalShortcut = defaults.globalShortcut;
      registerShortcut(config.globalShortcut);
    }
    createTray();
    createWindow();
    startMediaMonitor();
    clipboardTimer = setInterval(monitorClipboard, 1200);
    app.on('activate', () => openWindow('controls'));
  }).catch(error => {
    console.error('Notch startup failed:', error);
    dialog.showErrorBox('Notch could not start', error?.message || String(error));
    app.quit();
  });
} else {
  app.quit();
}

app.on('before-quit', () => {
  if (!hasSingleInstanceLock) return;
  shuttingDown = true;
  clearInterval(clipboardTimer);
  globalShortcut.unregisterAll();
  mediaProcess?.stdin.end();
  mediaProcess?.kill();
  if (dataLoaded) saveData();
});
app.on('window-all-closed', event => event?.preventDefault?.());
