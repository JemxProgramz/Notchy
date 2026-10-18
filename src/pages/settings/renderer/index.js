(() => {
  window.NotchPages = window.NotchPages || {};
  window.NotchPages.settings = function ({ api, ui, $, $$, S, safeCall, toast, refreshClipboard, renderTiles }) {
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
        displays.forEach(display => select.add(new Option(display.primary ? `${display.label} (Primary)` : display.label, String(display.id))));
        select.value = settings.displayId == null ? '' : String(settings.displayId);
      }
      renderTiles();
    }

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

    return { loadSettings, saveSetting, applyTheme };
  };
})();
