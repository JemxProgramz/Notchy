(() => {
  window.NotchPages = window.NotchPages || {};
  window.NotchPages.power = function ({ api, $, ic, safeCall, toast }) {
    const actions = [
      ['Lock', 'lock'],
      ['Sleep', 'moon'],
      ['Restart', 'rs'],
      ['Shut down', 'pw']
    ];
    $('#pg').innerHTML = actions.map(([name, icon]) =>
      `<button class="pw" data-n="${name}" type="button">${ic(icon)}${name}</button>`
    ).join('');

    $('#pg').onclick = async event => {
      const button = event.target.closest('.pw');
      if (!button) return;
      const action = { Lock: 'lock', Sleep: 'sleep', Restart: 'restart', 'Shut down': 'shutdown' }[button.dataset.n];
      if (!action) return;
      button.disabled = true;
      const result = await safeCall(() => api.power(action), `Could not ${button.dataset.n.toLowerCase()}`);
      button.disabled = false;
      if (result) toast(`${button.dataset.n} requested`);
    };
  };
})();
