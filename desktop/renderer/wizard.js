'use strict';
// 4-step setup wizard. Talks to the main process only via window.coliseum.
(function () {
  const api = window.coliseum;
  const content = document.getElementById('content');
  const errorEl = document.getElementById('error');
  const backBtn = document.getElementById('back');
  const nextBtn = document.getElementById('next');
  const stepEls = document.querySelectorAll('#steps li');
  const LAST = 3;

  let step = 0;
  let cfg = null;
  let meta = { themes: [], authMethods: [], hqModes: [] };

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const k of kids) n.append(k);
    return n;
  }

  function cardList(items, selectedId, onPick) {
    const wrap = el('div', { className: 'cards' });
    for (const it of items) {
      const card = el('div', { className: 'card' + (it.id === selectedId ? ' selected' : '') },
        el('b', { textContent: it.name }), el('span', { textContent: it.desc }));
      card.addEventListener('click', () => { onPick(it.id); render(); });
      wrap.append(card);
    }
    return wrap;
  }

  function renderAuth() {
    content.append(el('h2', { textContent: 'How should agents authenticate?' }));
    content.append(cardList(meta.authMethods, cfg.auth, id => { cfg.auth = id; }));
    if (cfg.auth === 'api-key') {
      content.append(el('label', { textContent: 'Anthropic API key' }));
      const input = el('input', { type: 'password', placeholder: 'sk-ant-...', value: cfg.apiKey || '' });
      input.addEventListener('input', () => { cfg.apiKey = input.value.trim(); });
      content.append(input);
    }
  }

  function renderTheme() {
    content.append(el('h2', { textContent: 'Pick an office theme' }));
    content.append(cardList(meta.themes, cfg.theme, id => { cfg.theme = id; }));
    content.append(el('label', { textContent: 'HQ mode' }));
    const sel = el('select');
    for (const m of meta.hqModes) {
      sel.append(el('option', { value: m.id, textContent: `${m.name} — ${m.desc}`, selected: m.id === cfg.hqMode }));
    }
    sel.addEventListener('change', () => { cfg.hqMode = sel.value; });
    content.append(sel);
  }

  function renderRepos() {
    content.append(el('h2', { textContent: 'Which repositories should agents work on?' }));
    const list = el('ul', { className: 'repos' });
    if (!cfg.repos.length) list.append(el('li', { className: 'muted', textContent: 'No repositories added yet.' }));
    cfg.repos.forEach((r, i) => {
      const rm = el('button', { className: 'secondary', textContent: 'Remove' });
      rm.addEventListener('click', () => { cfg.repos.splice(i, 1); render(); });
      list.append(el('li', {}, el('span', { textContent: r }), rm));
    });
    content.append(list);
    const browse = el('button', { textContent: 'Browse…' });
    browse.addEventListener('click', async () => {
      const dir = await api.pickRepo();
      if (dir && !cfg.repos.includes(dir)) cfg.repos.push(dir);
      render();
    });
    content.append(browse);
  }

  function nameOf(list, id) {
    const f = list.find(x => x.id === id);
    return f ? f.name : id;
  }

  function renderSummary() {
    content.append(el('h2', { textContent: 'Ready to go' }));
    const dl = el('dl');
    const row = (k, v) => dl.append(el('dt', { textContent: k }), el('dd', { textContent: v }));
    row('Auth', nameOf(meta.authMethods, cfg.auth) + (cfg.auth === 'api-key' ? ' (key set)' : ''));
    row('Theme', nameOf(meta.themes, cfg.theme));
    row('HQ mode', nameOf(meta.hqModes, cfg.hqMode));
    row('Repos', cfg.repos.length ? cfg.repos.join('\n') : 'none');
    content.append(dl);
    const start = el('button', { className: 'big', textContent: 'Start Coliseum' });
    start.addEventListener('click', onStart);
    content.append(start);
  }

  async function onStart() {
    errorEl.textContent = '';
    const saved = await api.saveConfig(cfg);
    if (!saved.ok) { errorEl.textContent = saved.errors.join('; '); return; }
    const res = await api.start(cfg);
    if (!res.ok) {
      errorEl.textContent = 'Could not start: ' + (res.errors || [res.reason || 'unknown error']).join('; ');
      return;
    }
    showRunning('starting', []);
  }

  const renderers = [renderAuth, renderTheme, renderRepos, renderSummary];

  function render() {
    content.replaceChildren();
    renderers[step]();
    stepEls.forEach((li, i) => {
      li.className = i === step ? 'active' : i < step ? 'done' : '';
    });
    backBtn.disabled = step === 0;
    nextBtn.style.display = step === LAST ? 'none' : '';
  }

  function stepError() {
    if (step === 0 && cfg.auth === 'api-key' && !cfg.apiKey) return 'Enter your API key to continue.';
    return '';
  }

  backBtn.addEventListener('click', () => { errorEl.textContent = ''; step = Math.max(0, step - 1); render(); });
  nextBtn.addEventListener('click', () => {
    errorEl.textContent = stepError();
    if (!errorEl.textContent) { step = Math.min(LAST, step + 1); render(); }
  });

  // --- Running view ---
  const runningEl = document.getElementById('running');
  const navEl = document.getElementById('nav');
  const statusEl = document.getElementById('run-status');
  const logEl = document.getElementById('log');
  const MAX_LOG = 200;
  let running = false;

  function appendLog(line) {
    const stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 8;
    logEl.append(document.createTextNode(line + '\n'));
    while (logEl.childNodes.length > MAX_LOG) logEl.firstChild.remove();
    if (stick) logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(s) { statusEl.textContent = s; statusEl.dataset.status = s; }

  function showRunning(status, lines) {
    running = true;
    errorEl.textContent = '';
    content.hidden = true;
    navEl.hidden = true;
    runningEl.hidden = false;
    logEl.replaceChildren();
    lines.forEach(appendLog);
    setStatus(status);
  }

  function showSetup() {
    running = false;
    runningEl.hidden = true;
    content.hidden = false;
    navEl.hidden = false;
    render();
  }

  api.onLog(line => { if (running) appendLog(line); });
  api.onStatus(s => { if (running) setStatus(s); });
  document.getElementById('stop').addEventListener('click', () => api.stop());
  document.getElementById('open-setup').addEventListener('click', showSetup);

  Promise.all([api.loadConfig(), api.runState()]).then(([res, run]) => {
    cfg = res.config;
    if (!Array.isArray(cfg.repos)) cfg.repos = [];
    meta = res;
    if (res.valid) step = LAST;
    render();
    if (run.status !== 'stopped') showRunning(run.status, run.logs);
  });
})();
