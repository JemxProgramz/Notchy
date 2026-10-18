/* Live Windows system monitor */
{
  const V = $('#v-stats');
  const COL = { cpu: '#ff9f0a', gpu: '#bf5af2', ram: '#30d158', net: '#0a84ff' };
  const history = { cpu: [], gpu: [], ram: [], net: [] };
  let sort = 'ram';
  let busy = false;
  let timer;

  Object.assign(P, {
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    gpu: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 17v2M18 17v2"/>',
    mem: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 16v3M12 16v3M17 16v3M7 11v2M12 11v2M17 11v2"/>',
    dsk: '<path d="M4 7c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3zM4 7v10c0 2 3.6 3 8 3s8-1 8-3V7"/>'
  });

  const card = (key, icon, label, unit) => `
    <div class="sc m" style="--c:${COL[key]}">
      <div class="sh2"><span class="si">${ic(icon)}</span>${label}</div>
      <div class="sn"><b id="n-${key}">—</b><em>${unit}</em></div>
      <p id="s-${key}"></p>
      <div class="sp" id="p-${key}"></div>
    </div>`;

  V.innerHTML = `
    <div class="sx">
      ${card('cpu', 'cpu', 'CPU', '%')}
      ${card('gpu', 'gpu', 'GPU', '%')}
      ${card('ram', 'mem', 'Memory', '%')}
      ${card('net', 'wifi', 'Network', 'MiB/s')}
      <div class="sc sa">
        <div class="sh2">
          <span>Top processes</span>
          <div class="seg" id="seg">
            <button class="is" data-sort="ram">Memory</button>
            <button data-sort="cpu">CPU</button>
          </div>
        </div>
        <div id="al"></div>
      </div>
      <div class="sc sd">
        <div class="sh2">
          <span class="si" style="--c:#8e8e93">${ic('dsk')}</span>
          <span>Storage</span>
          <span class="storage-live">Auto-updates</span>
        </div>
        <div class="dsk-list" id="dsk-list" aria-live="polite"></div>
      </div>
    </div>`;

  const spark = (values, max, color, id) => {
    if (!values.length) return '';
    const width = 120;
    const height = 48;
    const points = values.map((value, index) => [
      values.length === 1 ? width : index / (values.length - 1) * width,
      height - 3 - Math.min(value, max) / max * (height - 12)
    ]);
    let path = `M${points[0][0]} ${points[0][1]}`;
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const current = points[index];
      path += ` Q${previous[0]} ${previous[1]} ${(previous[0] + current[0]) / 2} ${(previous[1] + current[1]) / 2}`;
    }
    path += ` L${width} ${points[points.length - 1][1]}`;
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity=".5"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${path} L${width} ${height} L0 ${height}Z" fill="url(#g${id})"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
  };

  const push = (key, value) => {
    if (!Number.isFinite(value)) return;
    history[key].push(Math.max(0, value));
    if (history[key].length > 36) history[key].shift();
  };

  const fmtBytes = value => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let amount = Number(value) || 0;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index++;
    }
    return `${amount.toFixed(index ? 1 : 0)} ${units[index]}`;
  };

  function renderStorage(drives = []) {
    const host = $('#dsk-list');
    host.replaceChildren();
    if (!drives.length) {
      host.textContent = 'No fixed drives available';
      return;
    }

    drives.forEach(drive => {
      const size = Math.max(0, Number(drive.size) || 0);
      const used = Math.min(size, Math.max(0, Number(drive.used) || 0));
      const percent = size ? Math.min(100, used / size * 100) : 0;
      const item = document.createElement('div');
      item.className = 'drive';

      const heading = document.createElement('div');
      heading.className = 'drive-head';
      const mount = document.createElement('strong');
      mount.textContent = drive.mount || 'Drive';
      heading.append(mount);
      if (drive.label) {
        const label = document.createElement('span');
        label.className = 'drive-label';
        label.textContent = drive.label;
        heading.append(label);
      }

      const usage = document.createElement('div');
      usage.className = 'drive-usage';
      const usedLabel = document.createElement('span');
      usedLabel.textContent = `${fmtBytes(used)} used of ${fmtBytes(size)}`;
      const freeLabel = document.createElement('span');
      freeLabel.textContent = `${fmtBytes(drive.available)} available`;
      usage.append(usedLabel, freeLabel);

      const meter = document.createElement('div');
      meter.className = 'cap';
      meter.setAttribute('role', 'progressbar');
      meter.setAttribute('aria-label', `${drive.mount || 'Drive'} storage used`);
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', '100');
      meter.setAttribute('aria-valuenow', String(Math.round(percent)));
      const fill = document.createElement('u');
      fill.style.width = `${percent}%`;
      meter.append(fill);
      item.append(heading, usage, meter);
      host.append(item);
    });
  }

  function renderProcesses(data) {
    const rows = (data.topProcesses || []).slice(0, 5);
    const host = $('#al');
    host.replaceChildren();
    rows.forEach(process => {
      const nameText = String(process.name || 'Unknown process');
      const memoryMb = Number(process.memoryMb) || 0;
      const cpu = Number(process.cpu) || 0;
      const row = document.createElement('div');
      row.className = 'ar2';

      const icon = document.createElement('em');
      icon.textContent = nameText.slice(0, 1).toUpperCase();
      icon.style.background = '#5e5ce6';

      const details = document.createElement('div');
      const line = document.createElement('div');
      line.className = 'r1';
      const name = document.createElement('span');
      name.textContent = nameText;
      const value = document.createElement('b');
      value.textContent = sort === 'ram' ? `${memoryMb.toFixed(0)} MB` : `${cpu.toFixed(1)}%`;
      line.append(name, value);

      const meter = document.createElement('div');
      meter.className = 'cap';
      const fill = document.createElement('u');
      const totalMemoryMb = (Number(data.memoryTotal) || 0) / 1048576;
      const percent = sort === 'ram' && totalMemoryMb ? memoryMb / totalMemoryMb * 100 : cpu;
      fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      meter.append(fill);
      details.append(line, meter);
      row.append(icon, details);
      host.append(row);
    });
    if (!rows.length) host.textContent = 'No process data available';
  }

  function renderStats(data) {
    const ramPct = data.memoryTotal ? data.memoryUsed / data.memoryTotal * 100 : 0;
    const rx = data.network.rx;
    const tx = data.network.tx;
    push('cpu', data.cpu);
    if (data.gpuAvailable) push('gpu', data.gpu);
    push('ram', ramPct);
    if (rx != null) push('net', rx);

    $('#n-cpu').textContent = Math.round(data.cpu);
    $('#s-cpu').textContent = `${data.cpuName} · ${data.threads} threads`;
    $('#p-cpu').innerHTML = spark(history.cpu, 100, COL.cpu, 'cpu');

    $('#n-gpu').textContent = data.gpuAvailable ? Math.round(data.gpu) : '—';
    $('#s-gpu').textContent = data.gpuName || 'GPU utilization unavailable';
    $('#p-gpu').innerHTML = spark(history.gpu, 100, COL.gpu, 'gpu');

    $('#n-ram').textContent = Math.round(ramPct);
    $('#s-ram').textContent = `${fmtBytes(data.memoryUsed)} used of ${fmtBytes(data.memoryTotal)}`;
    $('#p-ram').innerHTML = spark(history.ram, 100, COL.ram, 'ram');

    $('#n-net').textContent = rx == null ? '—' : rx.toFixed(2);
    $('#s-net').textContent = `${data.network.online ? 'Online' : 'Offline'} · ↓ ${rx == null ? '—' : rx.toFixed(2)} / ↑ ${tx == null ? '—' : tx.toFixed(2)} MiB/s`;
    $('#p-net').innerHTML = spark(history.net, Math.max(1, ...history.net) * 1.2, COL.net, 'net');

    renderProcesses(data);
    renderStorage(data.disks);
  }

  async function refreshStats() {
    if (busy) return;
    busy = true;
    try {
      renderStats(await window.notch.system.stats(sort));
    } catch (error) {
      $('#s-cpu').textContent = 'Could not read system metrics';
      toast(error.message || 'System monitor unavailable');
    } finally {
      busy = false;
    }
  }

  $('#seg').onclick = event => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    sort = button.dataset.sort;
    $$('#seg button').forEach(item => item.classList.toggle('is', item === button));
    refreshStats();
  };
  const statsVisible = () => $('#isl').classList.contains('open') && V.classList.contains('on');
  const schedule = () => {
    clearInterval(timer);
    timer = setInterval(() => {
      if (statsVisible()) refreshStats();
    }, window.__notchSettings?.monitorRefreshMs || 3000);
  };
  window.addEventListener('notch-settings', schedule);
  refreshStats();
  schedule();
}
