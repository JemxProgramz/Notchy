(() => {
  Object.assign(P, { bolt: '<path d="m13 2-3 8h6l-5 12 2-9H7z"/>' });
  window.NotchPages = window.NotchPages || {};
  window.NotchPages.apps = function ({ api, $, ic, safeCall, toast, expand, selectTab }) {
    const appView = $('#v-apps');
    appView.innerHTML = `<div class="as"><span>${ic('sr')}</span><input id="asq" placeholder="Search installed apps…" autocomplete="off" aria-label="Search installed apps"><kbd>Ctrl K</kbd><button class="app-add" id="app-add" type="button">Add app</button></div><div id="qk"></div><div id="apl"></div>`;

    const quickLinks = [['Gmail', 'https://mail.google.com'], ['GitHub', 'https://github.com'], ['YouTube', 'https://www.youtube.com'], ['Maps', 'https://maps.google.com']];
    $('#qk').innerHTML = quickLinks.map(([name], index) => `<button class="qk" data-i="${index}"><span>${ic('bolt')}</span><b>${name}</b></button>`).join('');
    $('#qk').onclick = event => {
      const button = event.target.closest('[data-i]');
      if (button) safeCall(() => api.external(quickLinks[Number(button.dataset.i)][1]), 'Could not open link');
    };

    let installedApps = [];
    let customApps = [];
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
          const name = document.createElement('span');
          name.className = 'an';
          name.textContent = app.name;
          const type = document.createElement('em');
          type.className = 'at';
          type.textContent = app.kind;
          const star = document.createElement('button');
          star.type = 'button';
          star.className = `sb ${starred.has(appKey(app)) ? 'on' : ''}`;
          star.title = starred.has(appKey(app)) ? 'Unpin application' : 'Pin application';
          star.setAttribute('aria-label', star.title);
          star.textContent = '☆';
          row.append(icon, name, type, star);
          host.append(row);
        });
      });
      if (!appRows.length) {
        const empty = document.createElement('p');
        empty.className = 'native-empty';
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

    return { refreshApps };
  };
})();
