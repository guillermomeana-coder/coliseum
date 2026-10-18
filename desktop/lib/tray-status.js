'use strict';
// Tray status model: summarize(Foreman state mirror) -> {tooltip, level, menuItems}, and a
// StatusWatcher that keeps the mirror over the Foreman WebSocket. No electron here.
const { EventEmitter } = require('node:events');

const MAX_TOOLTIP = 127; // Windows NOTIFYICONDATA szTip limit (127 chars + NUL)
const BUSY_STATES = new Set(['thinking', 'reading', 'editing', 'running', 'testing']);

const values = (c) => (!c ? [] : c instanceof Map ? [...c.values()] : Array.isArray(c) ? c : Object.values(c));
const get = (c, id) => (c instanceof Map ? c.get(id) : values(c).find((x) => x && x.id === id));

function truncate(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function agentLabel(agent, tasks) {
  const name = agent.name || agent.id;
  if (agent.active === false) return `${name} — off shift`;
  if (agent.paused) return `${name} — paused`;
  const state = agent.state || 'idle';
  if (BUSY_STATES.has(state)) {
    const task = agent.taskId ? get(tasks, agent.taskId) : null;
    const what = task ? `${task.id} ${task.title}` : agent.taskId || agent.activity || '';
    return what ? `${name} — working: ${what}` : `${name} — working`;
  }
  if (state === 'waiting_user') return `${name} — waiting for you`;
  if (state === 'blocked' || state === 'error') return `${name} — ${state}`;
  return `${name} — ${state === 'done' ? 'done' : 'idle'}`;
}

/**
 * @param {object|null} state Foreman mirror {foreman, agents, tasks, decisions}; null/undefined = not connected
 * @returns {{tooltip: string, level: 'offline'|'idle'|'working'|'attention'|'error', menuItems: {label: string}[]}}
 */
function summarize(state) {
  if (!state) {
    return { tooltip: 'Coliseum — Foreman offline', level: 'offline', menuItems: [{ label: 'Foreman offline' }] };
  }
  const agents = values(state.agents);
  const open = values(state.decisions).filter((d) => d && d.status === 'open').length;
  const busy = agents.filter((a) => a.active !== false && !a.paused && BUSY_STATES.has(a.state)).length;
  const authFailed = !!(state.foreman && state.foreman.auth === 'failed');

  const level = authFailed ? 'error' : open > 0 ? 'attention' : busy > 0 ? 'working' : 'idle';

  const menuItems = agents.map((a) => ({ label: agentLabel(a, state.tasks) }));
  if (authFailed) menuItems.unshift({ label: 'Claude login failed' });
  if (open > 0) menuItems.push({ label: `${open} decision${open === 1 ? '' : 's'} waiting` });

  const parts = ['Coliseum'];
  if (authFailed) parts.push('login failed');
  if (open > 0) parts.push(`${open} decision${open === 1 ? '' : 's'} waiting`);
  parts.push(busy > 0 ? `${busy} agent${busy === 1 ? '' : 's'} working` : 'idle');
  return { tooltip: truncate(parts.join(' — '), MAX_TOOLTIP), level, menuItems };
}

function emptyState() {
  return { foreman: null, agents: new Map(), tasks: new Map(), decisions: new Map() };
}

function applyMessage(s, m) {
  const up = (map, e) => { if (e && e.id != null) map.set(e.id, e); };
  switch (m.type) {
    case 'snapshot':
      s.foreman = m.foreman || null;
      s.agents = new Map((m.agents || []).map((a) => [a.id, a]));
      s.tasks = new Map((m.tasks || []).map((t) => [t.id, t]));
      s.decisions = new Map((m.decisions || []).map((d) => [d.id, d]));
      return true;
    case 'agent.upsert': up(s.agents, m.agent); return true;
    case 'task.upsert': up(s.tasks, m.task); return true;
    case 'decision.upsert': up(s.decisions, m.decision); return true;
    case 'foreman.status': if (m.status) s.foreman = m.status; return true;
    default: return false;
  }
}

class StatusWatcher extends EventEmitter {
  /**
   * @param {{port?: number, host?: string, WebSocket?: Function, backoff?: {next(): number, reset(): void},
   *          setTimeout?: Function, clearTimeout?: Function}} [opts] injectable for tests
   */
  constructor(opts = {}) {
    super();
    this.port = opts.port ?? Number(process.env.COLISEUM_PORT || 7878);
    this.host = opts.host ?? '127.0.0.1';
    this.WebSocket = opts.WebSocket || null;
    this.backoff = opts.backoff || null;
    this._setTimeout = opts.setTimeout || setTimeout;
    this._clearTimeout = opts.clearTimeout || clearTimeout;
    this.state = emptyState();
    this.connected = false;
    this.closed = true;
    this.ws = null;
    this.timer = null;
    this.last = summarize(null);
  }

  get url() { return `ws://${this.host}:${this.port}`; }

  /** Current summary (offline until the first snapshot arrives). */
  summary() { return this.connected ? summarize(this.state) : summarize(null); }

  async start() {
    if (!this.closed) return;
    this.closed = false;
    if (!this.WebSocket) this.WebSocket = require('ws');
    if (!this.backoff) {
      try {
        const { createBackoff } = await import('../../tools/lib/backoff.mjs');
        this.backoff = createBackoff();
      } catch {
        let n = 0; // fallback when tools/ is not shipped: 1s..30s
        this.backoff = { next: () => Math.min(30000, 1000 * 2 ** n++), reset: () => { n = 0; } };
      }
    }
    if (this.closed) return;
    this._connect();
  }

  _emit() {
    this.last = this.summary();
    this.emit('update', this.last);
  }

  _connect() {
    let ws;
    try {
      ws = new this.WebSocket(this.url, { handshakeTimeout: 3000 }); // ws sends no Origin header
    } catch {
      return this._scheduleReconnect();
    }
    this.ws = ws;
    ws.on('open', () => {
      ws.send(JSON.stringify({ v: 1, type: 'hello', modVersion: 'desktop-0.1.0', protocol: 1, client: 'desktop' }));
    });
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'snapshot') { this.connected = true; this.backoff.reset(); }
      if (applyMessage(this.state, m) && this.connected) this._emit();
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      const was = this.connected;
      this.connected = false;
      this.state = emptyState();
      if (was) this._emit();
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (this.closed) return;
    this.timer = this._setTimeout(() => { this.timer = null; if (!this.closed) this._connect(); }, this.backoff.next());
    if (this.timer && this.timer.unref) this.timer.unref();
  }

  close() {
    this.closed = true;
    if (this.timer) { this._clearTimeout(this.timer); this.timer = null; }
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    if (ws) { try { ws.close(); } catch { /* already closed */ } }
  }
}

module.exports = { summarize, StatusWatcher, MAX_TOOLTIP };
