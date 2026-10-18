(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const api = window.notch;
  if (!api) return;
  window.__notchExternalAudioLevels = null;
  api.media.onLevels(levels => {
    window.__notchExternalAudioLevels = Array.isArray(levels) ? levels : null;
  });

  const ui = { settings: {}, controls: null, stats: null, media: null };
  let refreshApps = () => {};
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
    $$('#nav button').forEach(button => {
      const active = button.dataset.t === name;
      button.classList.toggle('on', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $$('.v').forEach(view => view.classList.toggle('on', view.id === `v-${name.toLowerCase()}`));
    $('#isl').classList.toggle('wide', ['Today', 'Stats', 'Clipboard', 'Wallpaper', 'Settings'].includes(name));
    if (name === 'Clipboard') refreshClipboard();
    if (name === 'Apps') refreshApps();
    if (name === 'Today') renderReminders();
    if (name === 'Stats' && typeof refreshStats === 'function') refreshStats();
    try { rise(); fit(); setTimeout(fit, 380); } catch { /* Early startup */ }
  }
  const settingsPage = window.NotchPages.settings({
    api, ui, $, $$, S, safeCall, toast,
    refreshClipboard: () => refreshClipboard(),
    renderTiles: () => renderTiles()
  });
  const { loadSettings, saveSetting } = settingsPage;
  $('#nav').onclick = event => {
    const button = event.target.closest('button[data-t]');
    if (button) selectTab(button.dataset.t);
  };
  tab = selectTab;

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
      night: 'Opens the Windows night light page',
      dark: ui.settings.theme === 'light' ? 'Light theme' : ui.settings.theme === 'system' ? 'Follows Windows' : 'Dark theme'
    };
    const tile = (key, icon, title) => {
      if (key === 'wifi') {
        return `<div style="grid-column:span 3"><button class="tg ${wifi.enabled ? 'on' : ''}" data-k="wifi" type="button" aria-expanded="${wirelessOpen === 'wifi'}" aria-controls="wireless-popover"><span class="ic">${ic(icon)}</span><span class="tx">${title}<small>${escapeMarkup(labels.wifi)}</small></span><span class="wireless-chevron" aria-hidden="true">${ic('ch')}</span></button></div>`;
      }
      if (key === 'bt') {
        return `<div style="grid-column:span 3"><button class="tg ${bluetooth.enabled ? 'on' : ''}" data-k="bt" type="button" aria-expanded="${wirelessOpen === 'bt'}" aria-controls="wireless-popover"><span class="ic">${ic(icon)}</span><span class="tx">${title}<small>${escapeMarkup(labels.bt)}</small></span><span class="wireless-chevron" aria-hidden="true">${ic('ch')}</span></button></div>`;
      }
      const on = key === 'dark' && !!S.dark;
      return `<div style="grid-column:span 3"><button class="tg ${on ? 'on' : ''}" data-k="${key}" type="button"${key === 'dark' ? ` aria-pressed="${on}"` : ''}><span class="ic">${ic(icon)}</span><span class="tx">${title}<small>${escapeMarkup(labels[key])}</small></span></button></div>`;
    };
    $('#tiles').innerHTML = tile('wifi', 'wifi', 'Wi-Fi') + tile('bt', 'bt', 'Bluetooth') + tile('night', 'moon', 'Night Light') + tile('dark', 'dark', 'Notch theme');
    renderSpeakerStatus();
  }
  // Windows sound and brightness controls can be missing on some PCs or displays.
  // When that happens, keep the reason visible and offer a one-click re-check
  // instead of a silent "Unavailable" with no path forward.
  function renderSpeakerStatus() {
    const host = $('#spk');
    if (!host) return;
    const controls = ui.controls;
    if (!controls) {
      host.textContent = 'Windows sound controls';
      return;
    }
    const issues = [];
    if (controls.volume == null) issues.push('Windows master volume is unavailable (no audio output was reported)');
    if (controls.brightness == null || controls.brightnessSupported === false) issues.push('Brightness is unavailable on this display (external monitors often do not support it)');
    if (!issues.length) {
      host.textContent = controls.volume == null ? 'Windows sound controls' : `Windows master volume · ${controls.volume}%`;
      return;
    }
    host.replaceChildren();
    const note = document.createElement('span');
    note.textContent = issues.join(' · ');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'native-retry';
    retry.textContent = 'Check again';
    retry.onclick = () => {
      toast('Checking Windows controls…');
      refreshControls();
      refreshWireless();
    };
    host.append(note, retry);
  }
  /* The original inline renderer repaints the tiles with sample Wi-Fi and audio
     data after legacy interactions. Point every one of those call sites at the
     native renderer so the panel never falls back to placeholder state. */
  tiles = renderTiles;
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
    if (!tile) return;
    const key = tile.dataset.k;
    if (key === 'night') {
      event.preventDefault();
      event.stopImmediatePropagation();
      await safeCall(() => api.windows.settings('nightlight'), 'Could not open Windows night light settings');
      return;
    }
    if (key === 'dark') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const theme = S.dark ? 'light' : 'dark';
      await saveSetting({ theme });
      toast(`${theme === 'dark' ? 'Dark' : 'Light'} theme applied`);
      return;
    }
    if (!['wifi', 'bt'].includes(key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (wirelessBusy) return;
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
    if (event.key !== 'Escape') return;
    if (wirelessOpen) { closeWirelessPanel(); return; }
    if ($('#dd').classList.contains('on')) return; // Legacy dropdown closes itself first.
    const islandNode = $('#isl');
    if (!islandNode.classList.contains('open') && !islandNode.classList.contains('peek')) return;
    if (document.activeElement instanceof HTMLElement && islandNode.contains(document.activeElement)) document.activeElement.blur();
    islandNode.classList.remove('open', 'peek');
    mclose();
    try { fit(); } catch { /* Geometry may not be ready yet. */ }
  });
  /* Arrow keys move between the top-level sections while the tab strip has focus. */
  $('#nav').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = $$('#nav button');
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const last = buttons.length - 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : (index + (event.key === 'ArrowRight' ? 1 : last)) % buttons.length;
    buttons[next].focus({ preventScroll: true });
    selectTab(buttons[next].dataset.t);
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
  const sourceNames = [
    [/zunemusic|windowsmediaplayer|media\s*player/i, 'Media Player'],
    [/zunevideo|films|movies/i, 'Movies & TV'],
    [/spotify/i, 'Spotify'],
    [/msedge|edge/i, 'Edge'],
    [/chrome/i, 'Chrome'],
    [/firefox/i, 'Firefox'],
    [/brave/i, 'Brave'],
    [/vlc/i, 'VLC'],
    [/musicbee/i, 'MusicBee'],
    [/foobar/i, 'foobar2000'],
    [/itunes|apple/i, 'Apple Music'],
    [/amazon/i, 'Amazon Music'],
    [/youtube/i, 'YouTube'],
    [/groove/i, 'Groove Music']
  ];
  function friendlySource(raw) {
    const value = String(raw || '');
    for (const [pattern, name] of sourceNames) if (pattern.test(value)) return name;
    const tail = value.split(/[!\\/]/).pop() || value;
    const cleaned = tail
      .replace(/_[a-z0-9]{13}$/i, '')
      .replace(/\.exe$/i, '')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || 'Media';
  }
  function renderLocalLabel() {
    /* The built-in synthesized player is opt-in: until the user presses play
       (or an external session takes over) the island reads as idle instead of
       pretending a track is playing. */
    const playing = !!S.play;
    $$('.mt h4').forEach(node => node.textContent = playing ? ST[si].n : 'Nothing playing');
    $$('.mt p').forEach(node => node.textContent = playing ? ST[si].a : 'Start a player, or press play for lofi radio');
    $$('.art,.ca').forEach(node => { node.classList.remove('has-art'); node.style.backgroundColor = ''; node.style.backgroundImage = ''; node.style.background = GR[si]; });
    if (!playing) {
      ['#ps', '#pkt', '#pd', '#pkd'].forEach(id => { const node = $(id); if (node) node.textContent = '0:00'; });
      ['#pb', '#pkb'].forEach(id => { const node = $(id); if (node) node.style.width = '0%'; });
    }
  }
  /* Album art flows through a single helper so every surface (expanded tile,
     peek card, compact island chip) stays in sync, and so a missing thumbnail
     falls back to a labelled gradient instead of a blank square. */
  function applyCover(cover) {
    $$('.art,.ca').forEach(node => {
      if (cover) {
        node.classList.add('has-art');
        node.style.backgroundColor = 'rgba(0,0,0,.35)';
        node.style.backgroundImage = `url("${cover}")`;
      } else {
        node.classList.remove('has-art');
        node.style.backgroundColor = '';
        node.style.backgroundImage = '';
        node.style.background = GR[si];
      }
    });
  }

  /* Windows only refreshes the media timeline a few times a second, so a raw
     poll leaves the progress bar frozen and jumping between samples. A local
     wall-clock clock extrapolates from the last sample and re-syncs whenever a
     fresh update arrives, keeping the bar smooth and in step with playback. */
  let mediaClock = null;
  function syncMediaClock(media) {
    if (!media?.active) { mediaClock = null; mediaScrubbing = false; return; }
    if (mediaScrubbing) return;
    const duration = Number(media.duration) || 0;
    const updatedAt = Number(media.updatedAt);
    const age = Number.isFinite(updatedAt) && updatedAt > 0 ? Math.max(0, Date.now() - updatedAt) / 1000 : 0;
    const position = (Number(media.position) || 0) + (media.playing ? age : 0);
    mediaClock = {
      position: duration > 0 ? Math.min(position, duration) : position,
      duration,
      playing: !!media.playing,
      at: performance.now()
    };
  }
  let mediaScrubbing = false;
  let mediaSeekPreview = 0;
  let pendingTimelineChange = null;
  const mediaIdentity = media => [media?.source, media?.title, media?.artist, media?.album].map(value => String(value || '')).join('\u0000');
  function reconcileMediaTimeline(media) {
    const pending = pendingTimelineChange;
    if (!pending) return media;
    const position = Number(media?.position) || 0;
    const updatedAt = Number(media?.updatedAt) || 0;
    const now = Date.now();
    const sampleAge = updatedAt > 0 ? Math.max(0, now - updatedAt) / 1000 : 0;
    const reportedPosition = position + (media?.playing ? sampleAge : 0);
    const expectedPosition = pending.position + (media?.playing ? Math.max(0, now - pending.issuedAt) / 1000 : 0);
    if (mediaIdentity(media) !== pending.identity || Math.abs(reportedPosition - expectedPosition) <= 1.5 ||
        now >= pending.expiresAt) {
      pendingTimelineChange = null;
      return media;
    }
    return { ...media, position: pending.position, updatedAt: pending.issuedAt };
  }
  function clockPosition() {
    if (!mediaClock) return 0;
    const elapsed = mediaClock.playing ? (performance.now() - mediaClock.at) / 1000 : 0;
    const value = mediaClock.position + elapsed;
    return mediaClock.duration > 0 ? Math.min(value, mediaClock.duration) : value;
  }
  function renderProgress() {
    if (!mediaClock) return;
    const position = mediaScrubbing ? mediaSeekPreview : clockPosition();
    const duration = mediaClock.duration;
    const percent = duration > 0 ? `${Math.min(100, position / duration * 100).toFixed(3)}%` : '0%';
    ['#ps', '#pkt'].forEach(id => { const node = $(id); if (node) node.textContent = formatTime(position); });
    ['#pb', '#pkb'].forEach(id => { const node = $(id); if (node) node.style.width = percent; });
    const seekValue = duration > 0 ? String(Math.round(Math.min(1, Math.max(0, position / duration)) * 1000)) : '0';
    $$('.media-seek').forEach(node => {
      if (document.activeElement !== node) node.value = seekValue;
      node.setAttribute('aria-valuetext', `${formatTime(position)} of ${formatTime(duration)}`);
      node.disabled = !currentMedia?.active || !currentMedia.canSeek || duration <= 0;
    });
  }
  let progressFrame = 0;
  function progressLoop() {
    progressFrame = 0;
    renderProgress();
    if (currentMedia?.active && currentMedia.playing) progressFrame = requestAnimationFrame(progressLoop);
  }
  function updateProgressLoop() {
    if (currentMedia?.active && currentMedia.playing) {
      if (!progressFrame) progressFrame = requestAnimationFrame(progressLoop);
    } else if (progressFrame) {
      cancelAnimationFrame(progressFrame);
      progressFrame = 0;
    }
  }

  function renderExternalMedia() {
    const media = currentMedia;
    syncMediaClock(media);
    if (!media?.active) {
      $('#isl').classList.remove('ext');
      $('#eq').classList.toggle('on', !!S.play);
      $('#isl').classList.toggle('playing', !!S.play);
      localRender();
      renderLocalLabel();
      updateProgressLoop();
      return;
    }
    const title = media.title || 'Playing audio';
    const source = friendlySource(media.source);
    const details = [media.artist, media.album, source].filter(Boolean).join(' · ');
    $$('.mt h4').forEach(node => node.textContent = title);
    $$('.mt p').forEach(node => node.textContent = details);
    applyCover(media.cover);
    renderProgress();
    updateProgressLoop();
    ['#pd', '#pkd'].forEach(id => { const node = $(id); if (node) node.textContent = mediaClock.duration ? formatTime(mediaClock.duration) : 'Live'; });
    $('#pp').innerHTML = $('#pkpp').innerHTML = ic(media.playing ? 'pa' : 'pl');
    /* The compact indicator stays visible whenever a session is loaded so its
       artwork persists while paused; the bars animate only during playback. */
    $('#eq').classList.toggle('on', true);
    $('#isl').classList.toggle('ext', true);
    const wasCompact = $('#isl').classList.contains('playing');
    $('#isl').classList.add('playing');
    if (!wasCompact) { try { fit(); } catch { /* Startup */ } }
  }
  async function mediaAction(action, positionMs) {
    const previousMedia = currentMedia;
    const previousClock = mediaClock;
    let optimisticMedia = null;
    const now = Date.now();
    const targetPosition = action === 'seek' ? Math.max(0, Number(positionMs) / 1000) :
      action === 'previous' || action === 'next' ? 0 : null;
    if (currentMedia?.active && (action === 'toggle' || targetPosition !== null)) {
      optimisticMedia = {
        ...currentMedia,
        position: targetPosition === null ? clockPosition() : targetPosition,
        updatedAt: now,
        playing: action === 'toggle' ? !currentMedia.playing : !!currentMedia.playing
      };
      currentMedia = optimisticMedia;
      S.play = optimisticMedia.playing;
      if (targetPosition !== null) {
        pendingTimelineChange = {
          identity: mediaIdentity(optimisticMedia),
          position: targetPosition,
          issuedAt: now,
          expiresAt: now + 1800
        };
      }
      renderExternalMedia();
    }
    const ok = await safeCall(() => api.media.control(action, positionMs), 'Media control failed');
    if (!ok) {
      if (optimisticMedia && currentMedia === optimisticMedia) {
        currentMedia = previousMedia;
        mediaClock = previousClock;
        if (pendingTimelineChange?.issuedAt === now) pendingTimelineChange = null;
        S.play = !!previousMedia?.playing;
        renderExternalMedia();
      }
      toast('This player did not accept the media command');
    }
  }
  $$('.media-seek').forEach(node => {
    node.addEventListener('pointerdown', () => {
      if (!mediaClock || !currentMedia?.canSeek) return;
      mediaSeekPreview = clockPosition();
      mediaScrubbing = true;
    });
    node.addEventListener('pointerup', () => setTimeout(() => {
      if (mediaScrubbing) { mediaScrubbing = false; renderProgress(); }
    }, 0));
    node.addEventListener('pointercancel', () => { mediaScrubbing = false; renderProgress(); });
    node.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) mediaScrubbing = true;
    });
    node.addEventListener('input', () => {
      if (!mediaClock || !currentMedia?.canSeek) return;
      mediaScrubbing = true;
      mediaSeekPreview = mediaClock.duration * (Number(node.value) / 1000);
      renderProgress();
    });
    node.addEventListener('change', () => {
      if (!mediaClock || !currentMedia?.canSeek) { mediaScrubbing = false; return; }
      const positionMs = Math.round(mediaSeekPreview * 1000);
      mediaScrubbing = false;
      mediaClock = { ...mediaClock, position: mediaSeekPreview, at: performance.now() };
      mediaAction('seek', positionMs);
      renderProgress();
    });
    node.addEventListener('blur', () => {
      if (mediaScrubbing) { mediaScrubbing = false; renderProgress(); }
    });
  });
  const playerToggle = () => currentMedia?.active ? mediaAction('toggle') : localToggle();
  const playerSkip = direction => currentMedia?.active ? mediaAction(direction < 0 ? 'previous' : 'next') : localSkip(direction);
  $('#pp').onclick = $('#pkpp').onclick = playerToggle;
  $('#prev').onclick = $('#pkprev').onclick = () => playerSkip(-1);
  $('#next').onclick = $('#pknext').onclick = () => playerSkip(1);
  pl = () => {
    if (currentMedia?.active) return renderExternalMedia();
    localRender();
    renderLocalLabel();
  };
  const island = $('#isl');
  const oldMouseEnter = island.onmouseenter;
  island.onmouseenter = () => {
    if (currentMedia?.active && !island.classList.contains('open')) { island.classList.add('peek'); fit(); }
    else oldMouseEnter?.();
  };
  let mediaWasActive = false;
  api.media.onChanged(media => {
    media = reconcileMediaTimeline(media);
    const active = !!media?.active;
    const wasActive = mediaWasActive;
    mediaWasActive = active;
    currentMedia = media;
    window.__notchExternalMedia = media;
    if (active) {
      S.play = !!media.playing;
      if (ac) { clearInterval(tm); ac.suspend(); }
    } else if (wasActive) {
      /* External playback ended: return to a neutral idle state instead of
         leaving the fallback player stuck showing a fake "playing" state. */
      S.play = false;
    }
    renderExternalMedia();
  });
  api.media.get().then(media => {
    media = reconcileMediaTimeline(media);
    currentMedia = media;
    window.__notchExternalMedia = media;
    mediaWasActive = !!media?.active;
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

  const appsPage = window.NotchPages.apps({ api, $, ic, safeCall, toast, expand, selectTab });
  refreshApps = appsPage.refreshApps;
  refreshApps();
  window.NotchPages.power({ api, $, ic, safeCall, toast });

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

  /* A disconnected monitor should not leave the notch stuck off-screen. The main
     process falls back to the primary display and this keeps the settings honest. */
  api.onDisplayChanged?.(() => {
    toast('The selected display was disconnected — using the primary display');
    loadSettings();
  });
  loadSettings();
})();
