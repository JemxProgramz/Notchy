(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const api = window.notch;
  if (!api) return;

  const ui = { settings: {}, controls: null, stats: null, media: null };
  const toast = message => {
    const node = $('#toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('on'), 2400);
  };
  const reportError = (prefix, error) => toast(`${prefix}: ${error?.message || 'operation failed'}`);
  const safeCall = async (operation, label) => {
    try { return await operation(); }
    catch (error) { reportError(label, error); return null; }
  };

  function selectTab(name) {
    if (name !== 'Controls' && wirelessOpen) {
      closeWirelessPanel();
    }
    $$('#nav button').forEach(button => button.classList.toggle('on', button.dataset.t === name));
    $$('.v').forEach(view => view.classList.toggle('on', view.id === `v-${name.toLowerCase()}`));
    $('#isl').classList.toggle('wide', ['Today', 'Stats', 'Clipboard', 'Wallpaper', 'Settings'].includes(name));
    if (name === 'Clipboard') refreshClipboard();
    if (name === 'Apps') refreshApps();
    if (name === 'Today') renderReminders();
    try { rise(); fit(); setTimeout(fit, 380); } catch { /* Early startup */ }
  }
  if (Array.isArray(T) && !T.includes('Settings')) T.push('Settings');
  if (!$('#nav [data-t="Settings"]')) {
    const button = document.createElement('button');
    button.dataset.t = 'Settings';
    button.textContent = 'Settings';
    $('#nav').append(button);
  }
  if (!$('#v-settings')) {
    const section = document.createElement('section');
    section.className = 'v';
    section.id = 'v-settings';
    section.innerHTML = `
      <div class="settings-grid">
        <div class="tile settings-card"><h3>Appearance</h3>
          <label class="setting-row"><span>Theme<small>Apply to the Notch interface</small></span><select data-setting="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow Windows</option></select></label>
          <label class="setting-row"><span>Animations</span><input type="checkbox" data-setting="animations"></label>
          <label class="setting-row"><span>Time format</span><select data-setting="timeFormat"><option value="12h">12 hour</option><option value="24h">24 hour</option></select></label>
          <label class="setting-row"><span>Display</span><select data-setting="displayId"><option value="">Primary display</option></select></label>
        </div>
        <div class="tile settings-card"><h3>Desktop</h3>
          <label class="setting-row"><span>Start with Windows</span><input type="checkbox" data-setting="startup"></label>
          <label class="setting-row"><span>Always on top</span><input type="checkbox" data-setting="alwaysOnTop"></label>
          <label class="setting-row"><span>Click through</span><input type="checkbox" data-setting="clickThrough"></label>
          <label class="setting-row"><span>Open shortcut<small>Electron accelerator, e.g. Ctrl+Shift+Space</small></span><input type="text" data-setting="globalShortcut" spellcheck="false"></label>
        </div>
        <div class="tile settings-card"><h3>Privacy and reminders</h3>
          <label class="setting-row"><span>Clipboard history<small>Text stays on this PC</small></span><input type="checkbox" data-setting="clipboardEnabled"></label>
          <label class="setting-row"><span>Keep history for</span><select data-setting="clipboardRetentionDays"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label>
          <label class="setting-row"><span>Notifications</span><input type="checkbox" data-setting="notifications"></label>
        </div>
        <div class="tile settings-card"><h3>Monitoring and about</h3>
          <label class="setting-row"><span>Refresh interval</span><select data-setting="monitorRefreshMs"><option value="1000">1 second</option><option value="3000">3 seconds</option><option value="5000">5 seconds</option><option value="10000">10 seconds</option></select></label>
          <p id="about-notch" class="setting-note">Notch</p>
          <div class="setting-actions"><button type="button" id="settings-reset">Restore defaults</button></div>
        </div>
      </div>`;
    $('#in').append(section);
  }

  function applyTheme() {
    const preference = ui.settings.theme || 'dark';
    const dark = preference === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
      : preference === 'dark';
    S.dark = dark ? 1 : 0;
    $('#isl').classList.toggle('light', !dark);
    document.body.classList.toggle('no-motion', ui.settings.animations === false);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (ui.settings.theme === 'system') applyTheme();
  });
  async function saveSetting(patch) {
    const saved = await safeCall(() => api.settings.save(patch), 'Could not save setting');
    if (!saved) return false;
    ui.settings = saved;
    window.__notchSettings = saved;
    window.dispatchEvent(new Event('notch-settings'));
    applyTheme();
    if ('clipboardEnabled' in patch && patch.clipboardEnabled) refreshClipboard();
    renderTiles();
    return true;
  }
  async function loadSettings() {
    const settings = await safeCall(() => api.settings.get(), 'Could not load settings');
    if (!settings) return;
    ui.settings = settings;
    window.__notchSettings = settings;
    window.dispatchEvent(new Event('notch-settings'));
    applyTheme();
    $$('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      const value = settings[key];
      if (input.type === 'checkbox') input.checked = !!value;
      else if (key === 'displayId') input.value = value == null ? '' : String(value);
      else if (value != null) input.value = String(value);
    });
    const version = await safeCall(() => api.version(), 'Could not read version');
    if (version) $('#about-notch').textContent = `Notch ${version} · Windows desktop utility`;
    const displays = await safeCall(() => api.displays(), 'Could not list displays');
    if (displays) {
      const select = $('[data-setting="displayId"]');
      select.replaceChildren(new Option('Primary display', ''));
      displays.forEach(display => select.add(new Option(display.label, String(display.id))));
      select.value = settings.displayId == null ? '' : String(settings.displayId);
    }
    renderTiles();
  }
  $('#nav').onclick = event => {
    const button = event.target.closest('button[data-t]');
    if (!button) return;
    selectTab(button.dataset.t);
  };
  tab = selectTab;
  $('#v-settings').addEventListener('change', async event => {
    const input = event.target.closest('[data-setting]');
    if (!input) return;
    const key = input.dataset.setting;
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (['clipboardRetentionDays', 'monitorRefreshMs'].includes(key)) value = Number(value);
    if (key === 'displayId') value = value === '' ? null : Number(value);
    if (await saveSetting({ [key]: value })) toast('Setting saved');
    else loadSettings();
  });
  $('#settings-reset').onclick = async () => {
    const defaults = {
      startup: false, alwaysOnTop: true, clickThrough: false, animations: true,
      clipboardEnabled: true, clipboardLimit: 100, clipboardRetentionDays: 30,
      monitorRefreshMs: 3000, globalShortcut: 'CommandOrControl+Shift+Space',
      notifications: true, timeFormat: '12h', theme: 'dark', displayId: null
    };
    if (await saveSetting(defaults)) { await loadSettings(); toast('Defaults restored'); }
  };

  /* Real Windows control state and actions. */
  const settingsArea = { night: 'nightlight' };
  let wirelessOpen = null;
  let selectedNetwork = null;
  let wirelessBusy = false;
  let wirelessLoading = false;
  let wirelessRequestId = 0;
  let wifiConnectionAttempt = null;
  const escapeMarkup = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
  function renderTiles() {
    const controls = ui.controls || {};
    const wifi = controls.wifi || {};
    const bluetooth = controls.bluetooth || {};
    const wifiNetworks = Array.isArray(wifi.networks) ? wifi.networks.length : 0;
    const bluetoothDevices = Array.isArray(bluetooth.devices) ? bluetooth.devices.length : 0;
    const labels = {
      wifi: wirelessOpen === 'wifi' && wirelessLoading ? 'Searching for networks' : wifi.connected ? `Connected · ${wifi.name || 'Wi-Fi'}` : !wifi.available || !wifi.radioAvailable ? 'Wireless control unavailable' : !wifi.enabled ? 'Networks paused' : wifiNetworks ? pluralize(wifiNetworks, 'network') + ' nearby' : 'Refresh to find networks',
      bt: wirelessOpen === 'bt' && wirelessLoading ? 'Checking devices' : !bluetooth.available ? 'Not available on this PC' : !bluetooth.enabled ? 'Devices paused' : bluetoothDevices ? pluralize(bluetoothDevices, 'device') + ' detected' : 'No devices detected',
      night: 'Open Windows settings',
      dark: ui.settings.theme === 'light' ? 'Light theme' : 'Dark theme'
    };
    const tile = (key, icon, title) => {
      if (key === 'wifi') {
        return `<div style="grid-column:span 3"><button class="tg ${wifi.enabled ? 'on' : ''}" data-k="wifi" type="button" aria-expanded="${wirelessOpen === 'wifi'}" aria-controls="wireless-popover"><span class="ic">${ic(icon)}</span><span class="tx">${title}<small>${escapeMarkup(labels.wifi)}</small></span><span class="wireless-chevron" aria-hidden="true">${ic('ch')}</span></button></div>`;
      }
      if (key === 'bt') {
        return `<div style="grid-column:span 3"><button class="tg ${bluetooth.enabled ? 'on' : ''}" data-k="bt" type="button" aria-expanded="${wirelessOpen === 'bt'}" aria-controls="wireless-popover"><span class="ic">${ic(icon)}</span><span class="tx">${title}<small>${escapeMarkup(labels.bt)}</small></span><span class="wireless-chevron" aria-hidden="true">${ic('ch')}</span></button></div>`;
      }
      return `<div style="grid-column:span 3"><button class="tg ${key === 'dark' && S.dark ? 'on' : ''}" data-k="${key}" type="button"><span class="ic">${ic(icon)}</span><span class="tx">${title}<small>${escapeMarkup(labels[key])}</small></span></button></div>`;
    };
    $('#tiles').innerHTML = tile('wifi', 'wifi', 'Wi-Fi') + tile('bt', 'bt', 'Bluetooth') + tile('night', 'moon', 'Night Light') + tile('dark', 'dark', 'Notch theme');
    $('#spk').textContent = controls.volume == null ? 'Windows sound controls' : `Windows master volume · ${controls.volume}%`;
  }
  function renderWirelessPanel() {
    const panel = $('#wireless-popover');
    if (!wirelessOpen) {
      panel.classList.remove('on');
      panel.innerHTML = '';
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('aria-busy', 'false');
      try { fit(); setTimeout(fit, 280); } catch { /* Geometry may not be ready yet. */ }
      return;
    }
    const controls = ui.controls || {};
    const wifi = controls.wifi || {};
    const bluetooth = controls.bluetooth || {};
    const busy = wirelessBusy || wirelessLoading ? 'disabled' : '';
    if (wirelessOpen === 'wifi') {
      const networks = Array.isArray(wifi.networks) ? wifi.networks : [];
      const canScan = wifi.available && wifi.radioAvailable && wifi.enabled;
      const current = wifiConnectionAttempt ? `Connecting to ${escapeMarkup(wifiConnectionAttempt)}…` : wirelessLoading ? 'Scanning for nearby networks…' : wifi.connected ? `Connected to ${escapeMarkup(wifi.name || 'Wi-Fi')}` : !wifi.available || !wifi.radioAvailable ? 'Wireless control is unavailable on this device' : !wifi.enabled ? 'Wi-Fi is off' : networks.length ? `${pluralize(networks.length, 'network')} nearby` : 'No networks found nearby';
      const rows = wirelessLoading
        ? '<div class="wireless-empty" role="status"><span class="wireless-spinner" aria-hidden="true"></span>Scanning for networks…</div>'
        : canScan && networks.length
        ? networks.map(network => `<div class="wireless-row"><span class="wireless-name" title="${escapeMarkup(network.name)}">${escapeMarkup(network.name)}</span><span class="wireless-meta">${network.saved ? 'Saved · ' : ''}${escapeMarkup(network.authentication)} · ${Math.round(network.signal)}%</span><button type="button" data-action="wifi-network" data-ssid="${escapeMarkup(network.name)}" ${!wifi.enabled || network.name === wifi.name || busy ? 'disabled' : ''}>${network.name === wifi.name ? 'Connected' : 'Connect'}</button></div>`).join('')
        : !canScan ? '<div class="wireless-empty">Turn on Wi-Fi to see and connect to nearby networks.</div>' : '<div class="wireless-empty">No nearby networks found. Refresh to scan again.</div>';
      const passwordForm = selectedNetwork
        ? `<form class="wireless-form" id="wifi-password-form">${selectedNetwork.secure ? `<div class="wireless-password"><input id="wifi-password" type="password" autocomplete="current-password" placeholder="Password for ${escapeMarkup(selectedNetwork.name)}" aria-label="Wi-Fi password" required minlength="8" maxlength="64"><button type="button" data-action="wifi-password-toggle" aria-label="Show password" aria-pressed="false">Show</button></div>` : ''}<button type="submit" ${busy}>Connect</button><button type="button" data-action="wifi-cancel">Cancel</button></form><div class="wireless-caption">Windows will save this network profile for future connections.</div>`
        : '';
      panel.innerHTML = `<div class="wireless-card"><div class="wireless-head"><div><div class="wireless-title">Wi-Fi</div><div class="wireless-caption" role="status">${current}</div></div><div class="wireless-actions"><button type="button" class="wireless-refresh" data-action="wireless-refresh" aria-label="Refresh Wi-Fi networks" ${busy}>Refresh</button><button type="button" class="wireless-switch" data-action="wifi-toggle" role="switch" aria-label="Wi-Fi" aria-checked="${wifi.enabled}" ${!wifi.available || !wifi.radioAvailable || busy ? 'disabled' : ''}><span aria-hidden="true"></span></button></div></div>${wifi.connected ? `<div class="wireless-actions" style="margin-bottom:7px"><span class="wireless-connected" role="status"><span aria-hidden="true">●</span> Connected to ${escapeMarkup(wifi.name || 'Wi-Fi')}</span><button type="button" data-action="wifi-disconnect" ${busy}>Disconnect</button></div>` : ''}<div class="wireless-list">${rows}</div>${passwordForm}</div>`;
    } else {
      const devices = Array.isArray(bluetooth.devices) ? bluetooth.devices : [];
      const rows = wirelessLoading
        ? '<div class="wireless-empty" role="status"><span class="wireless-spinner" aria-hidden="true"></span>Checking Bluetooth devices…</div>'
        : devices.length
        ? devices.map(device => `<div class="wireless-row"><span class="wireless-name">${escapeMarkup(device.name || 'Bluetooth device')}</span><span class="wireless-meta">${device.paired === false ? 'Available' : device.connected === true ? 'Connected' : 'Paired'}</span>${device.paired === false && device.canPair && device.id ? `<button type="button" data-action="bluetooth-pair" data-device-id="${escapeMarkup(device.id)}" ${busy ? 'disabled' : ''}>Pair</button>` : ''}</div>`).join('')
        : '<div class="wireless-empty">No Bluetooth devices detected.</div>';
      const status = wirelessLoading ? 'Searching for Bluetooth devices…' : !bluetooth.available ? 'Bluetooth is unavailable on this device' : !bluetooth.enabled ? 'Bluetooth is off' : devices.length ? pluralize(devices.length, 'device') + ' found' : 'No Bluetooth devices found nearby';
      panel.innerHTML = `<div class="wireless-card"><div class="wireless-head"><div><div class="wireless-title">Bluetooth</div><div class="wireless-caption" role="status">${status}</div></div><div class="wireless-actions"><button type="button" class="wireless-refresh" data-action="wireless-refresh" aria-label="Find Bluetooth devices" ${busy}>Find devices</button><button type="button" class="wireless-switch" data-action="bluetooth-toggle" role="switch" aria-label="Bluetooth" aria-checked="${bluetooth.enabled}" ${!bluetooth.available || busy ? 'disabled' : ''}><span aria-hidden="true"></span></button></div></div><div class="wireless-list">${rows}</div><div class="wireless-caption" style="margin-top:8px">Pair devices here. Windows may ask you to confirm pairing; paired accessories connect through Windows.</div></div>`;
    }
    panel.classList.add('on');
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('aria-busy', String(wirelessLoading || wirelessBusy));
    try { fit(); setTimeout(fit, 280); } catch { /* Geometry may not be ready yet. */ }
  }
  function closeWirelessPanel() {
    wirelessOpen = null;
    selectedNetwork = null;
    wirelessLoading = false;
    wirelessRequestId++;
    renderTiles();
    renderWirelessPanel();
  }
  function toggleWirelessPanel(key) {
    const isClosing = wirelessOpen === key;
    wirelessOpen = isClosing ? null : key;
    selectedNetwork = null;
    if (isClosing) {
      wirelessRequestId++;
      wirelessLoading = false;
    }
    renderTiles();
    renderWirelessPanel();
  }
  async function refreshWireless(deep = false) {
    const requestId = ++wirelessRequestId;
    wirelessLoading = true;
    renderWirelessPanel();
    const value = await safeCall(() => api.wireless.get(), 'Could not refresh wireless devices');
    if (requestId !== wirelessRequestId) return;
    if (wirelessOpen === 'wifi' && value?.wifi?.enabled) {
      value.wifi.networks = await safeCall(() => api.wireless.scanWifi(), 'Could not scan nearby Wi-Fi networks') || [];
      if (requestId !== wirelessRequestId) return;
    }
    if (wirelessOpen === 'bt' && value?.bluetooth?.enabled) {
      value.bluetooth.devices = await safeCall(() => api.wireless.scanBluetooth(deep), 'Could not find nearby Bluetooth devices') || [];
      if (requestId !== wirelessRequestId) return;
    }
    wirelessLoading = false;
    if (!value) { renderWirelessPanel(); return; }
    ui.controls = { ...ui.controls, ...value };
    if (selectedNetwork && !value.wifi?.networks?.some(network => network.name === selectedNetwork.name)) selectedNetwork = null;
    renderTiles();
    renderWirelessPanel();
  }
  function syncControlSlider(input, value) {
    const level = Math.max(0, Math.min(100, Math.round(Number(value))));
    const percentage = `${level}%`;
    input.value = String(level);
    input.style.setProperty('--p', percentage);
    input.parentElement.style.setProperty('--p', percentage);
    input.parentElement.classList.toggle('g1', level > 8);
    input.parentElement.classList.toggle('g2', level > 90);
  }
  async function refreshControls() {
    const value = await safeCall(() => api.controls.get(), 'Could not read Windows controls');
    if (!value) return;
    ui.controls = value;
    renderTiles();
    renderWirelessPanel();
    const volume = $('#vol');
    if (value.volume == null) {
      volume.disabled = true;
      volume.parentElement.classList.add('disabled');
      volume.title = 'Windows master volume controls are unavailable';
      $('#vp').textContent = 'Unavailable';
    } else {
      volume.disabled = false;
      volume.parentElement.classList.remove('disabled');
      volume.title = 'Windows master volume';
    }
    if (value.volume != null && document.activeElement !== volume) {
      syncControlSlider(volume, value.volume);
      $('#vp').textContent = `${value.volume}%`;
    }
    const brightness = $('#br');
    if (value.brightness == null || value.brightnessSupported === false) {
      brightness.disabled = true;
      brightness.parentElement.classList.add('disabled');
      brightness.title = 'Brightness controls are unavailable on this display';
      $('#bp').textContent = 'Unavailable';
    } else if (document.activeElement !== brightness) {
      brightness.disabled = false;
      brightness.parentElement.classList.remove('disabled');
      syncControlSlider(brightness, value.brightness);
      $('#bp').textContent = `${value.brightness}%`;
    }
  }
  async function toggleWirelessRadio(kind) {
    if (wirelessBusy) return;
    const key = kind === 'WiFi' ? 'wifi' : 'bluetooth';
    const panelKey = kind === 'WiFi' ? 'wifi' : 'bt';
    const previous = ui.controls?.[key] || {};
    const enabled = !previous.enabled;
    ui.controls = {
      ...ui.controls,
      [key]: {
        ...previous,
        enabled,
        ...(kind === 'WiFi' && !enabled ? { connected: false, name: null } : {})
      }
    };
    wirelessBusy = true;
    renderTiles();
    renderWirelessPanel();
    const result = await safeCall(() => api.wireless.radio(kind, enabled), `Could not change ${kind === 'WiFi' ? 'Wi-Fi' : 'Bluetooth'} state`);
    wirelessBusy = false;
    if (result == null) {
      ui.controls = { ...ui.controls, [key]: previous };
    } else {
      ui.controls = { ...ui.controls, [key]: { ...ui.controls[key], enabled: result } };
      toast(`${kind === 'WiFi' ? 'Wi-Fi' : 'Bluetooth'} ${result ? 'enabled' : 'disabled'}`);
    }
    renderTiles();
    renderWirelessPanel();
    if (result && wirelessOpen === panelKey) void refreshWireless();
  }
  $('#tiles').addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    const tile = target?.closest('#tiles [data-k]');
    if (!tile || !['wifi', 'bt'].includes(tile.dataset.k)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (wirelessBusy) return;
    const key = tile.dataset.k;
    toggleWirelessPanel(key);
    $('#tiles [data-k="' + key + '"]')?.focus({ preventScroll: true });
    if (wirelessOpen) await refreshWireless();
  }, true);
  $('#wireless-popover').onclick = async event => {
    const button = event.target.closest('[data-action]');
    if (!button || wirelessBusy) return;
    const action = button.dataset.action;
    if (action === 'wifi-network') {
      const network = ui.controls?.wifi?.networks?.find(item => item.name === button.dataset.ssid);
      if (!network) { toast('That network is no longer available. Refresh and try again.'); return; }
      if (network.saved) {
        wifiConnectionAttempt = network.name;
        wirelessBusy = true;
        renderWirelessPanel();
        const result = await safeCall(() => api.wireless.connectWifi({ ssid: network.name }), `Could not connect to ${network.name}`);
        wirelessBusy = false;
        wifiConnectionAttempt = null;
        if (result?.connected) toast(`Connected to ${network.name}`);
        await refreshWireless();
      } else if (network.secure) {
        selectedNetwork = network;
        renderWirelessPanel();
        $('#wifi-password')?.focus();
      } else {
        wifiConnectionAttempt = network.name;
        wirelessBusy = true;
        renderWirelessPanel();
        const result = await safeCall(() => api.wireless.connectWifi({ ssid: network.name }), `Could not connect to ${network.name}`);
        wirelessBusy = false;
        wifiConnectionAttempt = null;
        if (result?.connected) toast(`Connected to ${network.name}`);
        await refreshWireless();
      }
      return;
    }
    if (action === 'wifi-cancel') {
      selectedNetwork = null;
      renderWirelessPanel();
      return;
    }
    if (action === 'wifi-password-toggle') {
      const input = $('#wifi-password');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(show));
      input.focus();
      return;
    }
    if (action === 'wifi-toggle' || action === 'bluetooth-toggle') {
      const kind = action === 'wifi-toggle' ? 'WiFi' : 'Bluetooth';
      await toggleWirelessRadio(kind);
      return;
    }
    if (action === 'wireless-refresh') {
      await refreshWireless(true);
      return;
    }
    if (action === 'wifi-disconnect') {
      wirelessBusy = true;
      renderWirelessPanel();
      const result = await safeCall(() => api.wireless.disconnectWifi(), 'Could not disconnect Wi-Fi');
      wirelessBusy = false;
      if (result) toast('Disconnected from Wi-Fi');
      await refreshWireless();
      return;
    }
    if (action === 'bluetooth-pair') {
      const deviceId = button.dataset.deviceId;
      if (!deviceId) return;
      wirelessBusy = true;
      renderWirelessPanel();
      const result = await safeCall(() => api.wireless.pairBluetooth(deviceId), 'Could not pair Bluetooth device');
      wirelessBusy = false;
      if (result) toast(`Paired ${result.name || 'Bluetooth device'}`);
      await refreshWireless();
    }
  };
  $('#wireless-popover').onsubmit = async event => {
    if (event.target.id !== 'wifi-password-form' || wirelessBusy || !selectedNetwork) return;
    event.preventDefault();
    const ssid = selectedNetwork.name;
    const password = $('#wifi-password').value;
    wifiConnectionAttempt = ssid;
    selectedNetwork = null;
    wirelessBusy = true;
    renderWirelessPanel();
    const result = await safeCall(() => api.wireless.connectWifi({ ssid, password }), `Could not connect to ${ssid}`);
    wirelessBusy = false;
    wifiConnectionAttempt = null;
    if (result?.connected) toast(`Connected to ${ssid}`);
    await refreshWireless();
  };
  document.addEventListener('click', event => {
    const path = event.composedPath();
    if (wirelessOpen && !path.includes($('#tiles')) && !path.includes($('#wireless-popover'))) {
      closeWirelessPanel();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && wirelessOpen) {
      closeWirelessPanel();
    }
  });
  let volumeTimer, brightnessTimer, volumeRequest = 0;
  $('#vol').addEventListener('input', () => {
    const request = ++volumeRequest;
    const desired = Number($('#vol').value);
    $('#vp').textContent = `${desired}%`;
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(async () => {
      const applied = await safeCall(() => api.controls.volume(desired), 'Could not change Windows master volume');
      if (applied == null) {
        if (request === volumeRequest) await refreshControls();
        return;
      }
      if (request !== volumeRequest) return;
      syncControlSlider($('#vol'), applied);
      $('#vp').textContent = `${applied}%`;
      $('#spk').textContent = `Windows master volume · ${applied}%`;
    }, 60);
  });
  $('#br').addEventListener('input', () => {
    $('#bp').textContent = `${$('#br').value}%`;
    clearTimeout(brightnessTimer);
    brightnessTimer = setTimeout(async () => {
      const value = await safeCall(() => api.controls.brightness(Number($('#br').value)), 'Could not change display brightness');
      if (value == null) {
        await refreshControls();
        return;
      }
      $('#bp').textContent = `${value}%`;
      syncControlSlider($('#br'), value);
    }, 100);
  });
  refreshControls();
  window.addEventListener('online', refreshControls);
  window.addEventListener('offline', refreshControls);

  /* Browser and Windows media sessions take over the compact player when active. */
  const localToggle = toggle;
  const localSkip = skip;
  const localRender = pl;
  let currentMedia = null;
  window.__notchExternalMedia = null;
  const formatTime = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    return hours ? `${hours}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` : `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };
  function renderExternalMedia() {
    const media = currentMedia;
    if (!media?.active) {
      $$('.mt h4').forEach(node => node.textContent = ST[si].n);
      $$('.mt p').forEach(node => node.textContent = ST[si].a);
      $$('.art,.ca').forEach(node => { node.style.backgroundImage = ''; node.style.background = GR[si]; });
      $('#eq').classList.toggle('on', !!S.play);
      $('#isl').classList.toggle('playing', !!S.play);
      localRender();
      return;
    }
    const title = media.title || 'Playing audio';
    const source = String(media.source || '').split(/[!\\/]/).pop().replace(/\.exe$/i, '') || 'Media player';
    const details = [media.artist, media.album, source].filter(Boolean).join(' · ');
    $$('.mt h4').forEach(node => node.textContent = title);
    $$('.mt p').forEach(node => node.textContent = details);
    if (media.cover) {
      $$('.art,.ca').forEach(node => {
        node.style.background = '#18181b';
        node.style.backgroundImage = `url("${media.cover}")`;
        node.style.backgroundSize = 'cover';
        node.style.backgroundPosition = 'center';
      });
    } else {
      $$('.art,.ca').forEach(node => { node.style.backgroundImage = ''; node.style.background = GR[si]; });
    }
    const position = Number(media.position) || 0;
    const duration = Number(media.duration) || 0;
    const percent = duration > 0 ? `${Math.min(100, position / duration * 100)}%` : '0%';
    ['#ps', '#pkt'].forEach(id => { if ($(id)) $(id).textContent = formatTime(position); });
    ['#pb', '#pkb'].forEach(id => { if ($(id)) $(id).style.width = percent; });
    $$('.media .bar > span:last-child').forEach(node => node.textContent = duration ? formatTime(duration) : 'Live');
    $('#pp').innerHTML = $('#pkpp').innerHTML = ic(media.playing ? 'pa' : 'pl');
    $('#eq').classList.toggle('on', !!media.playing);
    const wasCompact = $('#isl').classList.contains('playing');
    $('#isl').classList.add('playing');
    if (!wasCompact) { try { fit(); } catch { /* Startup */ } }
  }
  async function mediaAction(action) {
    const ok = await safeCall(() => api.media.control(action), 'Media control failed');
    if (!ok) toast('This player did not accept the media command');
  }
  const playerToggle = () => currentMedia?.active ? mediaAction('toggle') : localToggle();
  const playerSkip = direction => currentMedia?.active ? mediaAction(direction < 0 ? 'previous' : 'next') : localSkip(direction);
  $('#pp').onclick = $('#pkpp').onclick = playerToggle;
  $('#prev').onclick = $('#pkprev').onclick = () => playerSkip(-1);
  $('#next').onclick = $('#pknext').onclick = () => playerSkip(1);
  pl = () => currentMedia?.active ? renderExternalMedia() : localRender();
  const island = $('#isl');
  const oldMouseEnter = island.onmouseenter;
  island.onmouseenter = () => {
    if (currentMedia?.active && !island.classList.contains('open')) { island.classList.add('peek'); fit(); }
    else oldMouseEnter?.();
  };
  api.media.onChanged(media => {
    currentMedia = media;
    window.__notchExternalMedia = media;
    if (media?.active) {
      S.play = !!media.playing;
      if (ac) { clearInterval(tm); ac.suspend(); }
    }
    renderExternalMedia();
  });
  api.media.get().then(media => {
    currentMedia = media;
    window.__notchExternalMedia = media;
    if (media?.active) S.play = !!media.playing;
    renderExternalMedia();
  }).catch(() => {});

  /* Persistent Windows clipboard history instead of renderer-only sample rows. */
  const nativeItem = item => ({
    id: String(item.id),
    k: item.kind === 'image' ? 'image' : item.kind,
    x: String(item.text || item.name || 'Image'),
    t: Math.max(0, Math.floor((Date.now() - Number(item.createdAt || Date.now())) / 60000)),
    pin: item.pinned ? 1 : 0
  });
  async function refreshClipboard() {
    const rows = await safeCall(() => api.clipboard.list(), 'Could not read clipboard history');
    if (!rows) return;
    CB.items = rows.map(nativeItem);
    CB.cur = CB.items.some(item => item.id === CB.cur) ? CB.cur : (CB.items[0]?.id ?? null);
    CB.sel.clear();
    cbRender(1);
  }
  cbDo = async action => {
    const ids = CB.sel.size > 1 ? [...CB.sel] : CB.cur == null ? [] : [CB.cur];
    const items = CB.items.filter(item => ids.includes(item.id));
    if (!items.length) return;
    try {
      if (action === 'copy' || action === 'paste') {
        await api.clipboard.write(items.map(item => item.x).join('\n'));
        toast(items.length > 1 ? `Copied ${items.length} items. Press Ctrl+V to paste.` : 'Copied. Press Ctrl+V to paste.');
      } else if (action === 'pin') {
        for (const item of items) await api.clipboard.pin(item.id);
      } else if (action === 'del') {
        await api.clipboard.delete(ids);
      }
      await refreshClipboard();
    } catch (error) { reportError('Clipboard action failed', error); }
  };
  $('#cbg').onclick = () => selectTab('Settings');
  $('#cbg').title = 'Clipboard privacy settings';
  $('#cbl').onclick = event => {
    const row = event.target.closest('.cr');
    if (!row) return;
    const id = row.dataset.id;
    if (event.ctrlKey || event.metaKey) {
      CB.sel.has(id) ? CB.sel.delete(id) : CB.sel.add(id);
    } else {
      CB.sel.clear();
      CB.cur = id;
    }
    cbRender();
  };
  $('#cbl').ondblclick = event => { if (event.target.closest('.cr')) cbDo('copy'); };
  api.clipboard.onNew(refreshClipboard);
  api.clipboard.onChanged(refreshClipboard);
  refreshClipboard();

  /* Installed app launcher uses Start menu identities and native shell launch. */
  const appView = $('#v-apps');
  appView.innerHTML = `<div class="as"><span>${ic('sr')}</span><input id="asq" placeholder="Search installed apps…" autocomplete="off" aria-label="Search installed apps"><kbd>Ctrl K</kbd><button class="app-add" id="app-add" type="button">Add app</button></div><div id="qk"></div><div id="apl"></div>`;
  const quickLinks = [['Gmail', 'https://mail.google.com'], ['GitHub', 'https://github.com'], ['YouTube', 'https://www.youtube.com'], ['Maps', 'https://maps.google.com']];
  $('#qk').innerHTML = quickLinks.map(([name], index) => `<button class="qk" data-i="${index}"><span>${ic('bolt')}</span><b>${name}</b></button>`).join('');
  $('#qk').onclick = event => {
    const button = event.target.closest('[data-i]');
    if (button) safeCall(() => api.external(quickLinks[Number(button.dataset.i)][1]), 'Could not open link');
  };
  let installedApps = [], customApps = [];
  try { customApps = JSON.parse(localStorage.getItem('notch.customApps') || '[]'); } catch { customApps = []; }
  let starred = new Set();
  let recent = [];
  try { starred = new Set(JSON.parse(localStorage.getItem('notch.starredApps') || '[]')); } catch { }
  try { recent = JSON.parse(localStorage.getItem('notch.recentApps') || '[]'); } catch { }
  const appKey = app => app.path || app.id || app.name;
  const allApps = () => [
    ...installedApps.map(item => ({ ...item, name: item.name, kind: 'Application' })),
    ...customApps.map(item => ({ ...item, kind: 'Custom application' }))
  ];
  let appRows = [];
  function renderApps() {
    const query = $('#asq').value.trim().toLowerCase();
    const all = allApps();
    let groups;
    if (query) {
      groups = [['Results', all.filter(app => app.name.toLowerCase().includes(query))]];
    } else {
      const byKey = key => all.find(app => appKey(app) === key);
      groups = [
        ['Pinned', [...starred].map(byKey).filter(Boolean)],
        ['Recent', recent.map(byKey).filter(app => app && !starred.has(appKey(app)))],
        ['Installed applications', all.filter(app => !starred.has(appKey(app)) && !recent.includes(appKey(app)))]
      ];
    }
    groups = groups.filter(([, rows]) => rows.length);
    appRows = groups.flatMap(([, rows]) => rows);
    const host = $('#apl');
    host.replaceChildren();
    groups.forEach(([title, rows]) => {
      const heading = document.createElement('div');
      heading.className = 'ah';
      heading.textContent = title;
      host.append(heading);
      rows.forEach(app => {
        const index = appRows.indexOf(app);
        const row = document.createElement('div');
        row.className = 'ar3';
        row.dataset.nativeIndex = String(index);
        const icon = app.icon ? document.createElement('img') : document.createElement('span');
        if (app.icon) { icon.src = app.icon; icon.className = 'app-icon'; icon.alt = ''; }
        else { icon.className = 'app-fallback'; icon.textContent = app.name.slice(0, 1).toUpperCase(); }
        const name = document.createElement('span'); name.className = 'an'; name.textContent = app.name;
        const type = document.createElement('em'); type.className = 'at'; type.textContent = app.kind;
        const star = document.createElement('button');
        star.type = 'button'; star.className = `sb ${starred.has(appKey(app)) ? 'on' : ''}`;
        star.title = starred.has(appKey(app)) ? 'Unpin application' : 'Pin application';
        star.setAttribute('aria-label', star.title); star.textContent = '☆';
        row.append(icon, name, type, star);
        host.append(row);
      });
    });
    if (!appRows.length) {
      const empty = document.createElement('p'); empty.className = 'native-empty';
      empty.textContent = query ? 'No installed apps match that search.' : 'No Start menu applications were found.';
      host.append(empty);
    }
  }
  async function refreshApps() {
    const rows = await safeCall(() => api.apps.list(), 'Could not load installed apps');
    if (rows) installedApps = rows;
    renderApps();
  }
  async function openApp(app) {
    if (!app) return;
    const result = app.path
      ? await safeCall(() => api.apps.openPath(app.path), `Could not open ${app.name}`)
      : await safeCall(() => api.apps.launch(app.id), `Could not launch ${app.name}`);
    if (result === null) return;
    const key = appKey(app);
    recent = [key, ...recent.filter(item => item !== key)].slice(0, 8);
    localStorage.setItem('notch.recentApps', JSON.stringify(recent));
    toast(`Opened ${app.name}`);
  }
  $('#app-add').onclick = async () => {
    const result = await safeCall(() => api.apps.pick(), 'Could not add application');
    if (!result) return;
    if (!customApps.some(app => app.path === result.path)) customApps.push(result);
    localStorage.setItem('notch.customApps', JSON.stringify(customApps));
    renderApps();
  };
  $('#asq').oninput = renderApps;
  $('#apl').onclick = event => {
    const row = event.target.closest('.ar3');
    if (!row) return;
    const app = appRows[Number(row.dataset.nativeIndex)];
    if (event.target.closest('.sb')) {
      const key = appKey(app);
      starred.has(key) ? starred.delete(key) : starred.add(key);
      localStorage.setItem('notch.starredApps', JSON.stringify([...starred]));
      renderApps();
      return;
    }
    openApp(app);
  };
  $('#asq').onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); openApp(appRows[0]); }
    if (event.key === 'Escape') { $('#asq').value = ''; renderApps(); }
  };
  window.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    event.preventDefault();
    expand();
    selectTab('Apps');
    setTimeout(() => $('#asq').focus(), 150);
  });
  refreshApps();

  /* Power actions call the main process; restart and shutdown are confirmed there. */
  $('#pg').onclick = async event => {
    const button = event.target.closest('.pw');
    if (!button) return;
    const actions = { Lock: 'lock', Sleep: 'sleep', Restart: 'restart', 'Shut down': 'shutdown' };
    const action = actions[button.dataset.n];
    if (!action) return;
    button.disabled = true;
    const result = await safeCall(() => api.power(action), `Could not ${button.dataset.n.toLowerCase()}`);
    button.disabled = false;
    if (result) toast(`${button.dataset.n} requested`);
  };

  /* Desktop wallpaper selection and applying use the native file picker/API. */
  const builtInWallpapers = window.notchWallpaperUI.builtIns;
  const toolbar = $('.wb');
  const applyWallpaperButton = document.createElement('button');
  applyWallpaperButton.type = 'button';
  applyWallpaperButton.id = 'desktop-wallpaper';
  applyWallpaperButton.className = 'desktop-apply';
  applyWallpaperButton.textContent = 'Apply to desktop';
  toolbar.append(applyWallpaperButton);
  const wallpaperRows = () => [
    ...builtInWallpapers.map((wallpaper, index) => ({ ...wallpaper, id: `built:${index}`, builtIn: true })),
    ...JSON.parse(localStorage.getItem('notch.userWallpapers') || '[]').map(wallpaper => ({ ...wallpaper, id: `user:${wallpaper.id}`, builtIn: false }))
  ];
  $('#wfb').onclick = async () => {
    const image = await safeCall(() => api.wallpaper.pick(), 'Could not choose wallpaper');
    if (!image?.dataUrl) return;
    await safeCall(() => window.notchWallpaperUI.add(image), 'Could not import wallpaper');
  };
  async function toPng(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(1, 1920 / image.width, 1080 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }
  applyWallpaperButton.onclick = async () => {
    const selected = wallpaperRows().find(item => item.id === localStorage.getItem('notch.selectedWallpaper'));
    if (!selected) return toast('Choose a wallpaper first');
    try {
      let source = selected.dataUrl;
      if (!source) {
        const match = selected.css.match(/url\(["']?(.*?)["']?\)/);
        source = match?.[1];
      }
      if (!source) throw new Error('Wallpaper preview is unavailable');
      await api.wallpaper.applyDataUrl(await toPng(source));
      toast('Windows desktop wallpaper applied');
    } catch (error) { reportError('Could not apply wallpaper', error); }
  };

  /* Refreshable live reminders, stored locally and delivered through Windows notifications. */
  const reminderKey = 'notch.reminders';
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const readReminders = () => { try { return JSON.parse(localStorage.getItem(reminderKey) || '[]'); } catch { return []; } };
  const reminderHost = $('.twk');
  if (reminderHost && !$('#reminder-wrap')) {
    const wrap = document.createElement('div'); wrap.id = 'reminder-wrap'; wrap.className = 'reminder-wrap';
    wrap.innerHTML = `<div class="reminder-head"><span>Reminders</span><button class="reminder-add" id="reminder-add" type="button">Add</button></div><form class="reminder-form" id="reminder-form" hidden><input name="title" maxlength="80" placeholder="Reminder" required><input name="date" type="date" required><input name="time" type="time" required><button type="submit">Save</button></form><div class="reminder-list" id="reminder-list"></div>`;
    reminderHost.append(wrap);
  }
  function renderReminders() {
    const rows = readReminders().sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    const today = localDate(new Date());
    const upcoming = rows.filter(item => `${item.date}T${item.time}` >= `${today}T${new Date().toTimeString().slice(0, 5)}`);
    const next = upcoming[0];
    if ($('#nt1')) $('#nt1').textContent = next ? `Next · ${new Date(`${next.date}T${next.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'No upcoming reminders';
    if ($('#nt2')) $('#nt2').textContent = next ? next.title : 'Add one for a reminder';
    const list = $('#reminder-list');
    if (!list) return;
    list.replaceChildren();
    rows.filter(item => item.date >= today).slice(0, 4).forEach(item => {
      const row = document.createElement('div'); row.className = 'reminder-item';
      const label = document.createElement('span'); label.innerHTML = `<b></b> · <span></span>`;
      label.querySelector('b').textContent = item.title;
      label.querySelector('span').textContent = `${item.date} ${item.time}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = 'Delete reminder';
      remove.onclick = () => { localStorage.setItem(reminderKey, JSON.stringify(readReminders().filter(entry => entry.id !== item.id))); renderReminders(); };
      row.append(label, remove); list.append(row);
    });
    if (!rows.length) list.textContent = 'No reminders yet';
  }
  $('#reminder-add')?.addEventListener('click', () => {
    const form = $('#reminder-form');
    form.hidden = !form.hidden;
    if (!form.hidden) { form.elements.date.value = localDate(new Date()); form.elements.time.value = new Date(Date.now() + 3600000).toTimeString().slice(0, 5); form.elements.title.focus(); }
  });
  $('#reminder-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const item = { id: `${Date.now()}`, title: form.elements.title.value.trim(), date: form.elements.date.value, time: form.elements.time.value, notified: false };
    if (!item.title || !item.date || !item.time) return;
    const rows = readReminders(); rows.push(item); localStorage.setItem(reminderKey, JSON.stringify(rows));
    form.reset(); form.hidden = true; renderReminders(); toast('Reminder saved');
  });
  function checkReminders() {
    const now = new Date(); const due = readReminders(); let changed = false;
    due.forEach(item => {
      if (!item.notified && new Date(`${item.date}T${item.time}`) <= now && now - new Date(`${item.date}T${item.time}`) < 60000) {
        item.notified = true; changed = true; api.notify('Notch reminder', item.title);
      }
    });
    if (changed) localStorage.setItem(reminderKey, JSON.stringify(due));
    renderReminders();
  }
  renderReminders();
  setInterval(checkReminders, 30000);

  loadSettings();
})();
