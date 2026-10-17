'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { summarize, StatusWatcher, MAX_TOOLTIP } = require('../lib/tray-status.js');

const agent = (o) => ({ id: 'kit', name: 'Kit', state: 'idle', active: true, paused: false, ...o });
const mk = (o = {}) => ({
  foreman: { auth: 'ok' },
  agents: new Map(),
  tasks: new Map(),
  decisions: new Map(),
  ...o,
});

test('offline when no state', () => {
  const s = summarize(null);
  assert.equal(s.level, 'offline');
  assert.match(s.tooltip, /offline/i);
});

test('idle', () => {
  const s = summarize(mk({ agents: [agent()] }));
  assert.equal(s.level, 'idle');
  assert.deepEqual(s.menuItems, [{ label: 'Kit — idle' }]);
});

test('working labels the task', () => {
  const s = summarize(mk({
    agents: new Map([['kit', agent({ state: 'editing', taskId: 't3' })]]),
    tasks: new Map([['t3', { id: 't3', title: 'Backoff helper' }]]),
  }));
  assert.equal(s.level, 'working');
  assert.equal(s.menuItems[0].label, 'Kit — working: t3 Backoff helper');
  assert.match(s.tooltip, /1 agent working/);
});

test('attention with open decisions beats working', () => {
  const s = summarize(mk({
    agents: [agent({ state: 'running' })],
    decisions: [{ id: 'd1', status: 'open' }, { id: 'd2', status: 'open' }, { id: 'd3', status: 'answered' }],
  }));
  assert.equal(s.level, 'attention');
  assert.equal(s.menuItems.at(-1).label, '2 decisions waiting');
});

test('singular decision', () => {
  const s = summarize(mk({ decisions: [{ id: 'd1', status: 'open' }] }));
  assert.equal(s.menuItems.at(-1).label, '1 decision waiting');
});

test('error when auth failed beats everything', () => {
  const s = summarize(mk({ foreman: { auth: 'failed' }, decisions: [{ id: 'd1', status: 'open' }] }));
  assert.equal(s.level, 'error');
});

test('off-shift and paused agents are not working', () => {
  const s = summarize(mk({
    agents: [agent({ state: 'editing', active: false }), agent({ id: 'a', name: 'Ann', state: 'editing', paused: true })],
  }));
  assert.equal(s.level, 'idle');
  assert.deepEqual(s.menuItems.map((m) => m.label), ['Kit — off shift', 'Ann — paused']);
});

test('tooltip stays within 127 chars, even with a huge agent count', () => {
  const agents = Array.from({ length: 5 }, (_, i) => agent({ id: `a${i}`, state: 'editing' }));
  const s = summarize(mk({ foreman: { auth: 'failed' }, agents, decisions: [{ id: 'd', status: 'open' }] }));
  assert.ok(s.tooltip.length <= MAX_TOOLTIP);
  const big = summarize(mk({ agents: [agent({ state: 'editing' })], decisions: [] }));
  assert.ok(big.tooltip.length <= MAX_TOOLTIP);
});

class FakeWS extends EventEmitter {
  constructor(url, opts) { super(); this.url = url; this.opts = opts; this.sent = []; FakeWS.all.push(this); }
  send(d) { this.sent.push(JSON.parse(d)); }
  close() { this.emit('close'); }
}
FakeWS.all = [];

test('watcher: hello, snapshot, upserts, drop -> offline, reconnect with backoff', async () => {
  FakeWS.all = [];
  let resets = 0;
  const timers = [];
  const w = new StatusWatcher({
    port: 1234,
    WebSocket: FakeWS,
    backoff: { next: () => 1000, reset: () => { resets++; } },
    setTimeout: (fn) => { timers.push(fn); return 0; },
    clearTimeout: () => {},
  });
  const updates = [];
  w.on('update', (u) => updates.push(u.level));
  await w.start();
  const ws = FakeWS.all[0];
  assert.equal(ws.url, 'ws://127.0.0.1:1234');
  assert.equal(ws.opts.headers, undefined); // no Origin
  ws.emit('open');
  assert.equal(ws.sent[0].type, 'hello');
  ws.emit('message', JSON.stringify({ v: 1, type: 'snapshot', foreman: { auth: 'ok' }, agents: [agent()], tasks: [], decisions: [] }));
  assert.deepEqual(updates, ['idle']);
  assert.equal(resets, 1);
  ws.emit('message', JSON.stringify({ v: 1, type: 'agent.upsert', agent: agent({ state: 'testing' }) }));
  ws.emit('message', JSON.stringify({ v: 1, type: 'decision.upsert', decision: { id: 'd1', status: 'open' } }));
  assert.deepEqual(updates, ['idle', 'working', 'attention']);
  ws.emit('close');
  assert.equal(updates.at(-1), 'offline');
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(FakeWS.all.length, 2);
  // failed attempt: close without ever connecting schedules again, no extra offline emit
  FakeWS.all[1].emit('close');
  assert.equal(updates.filter((l) => l === 'offline').length, 1);
  assert.equal(timers.length, 2);
  w.close();
  timers[1]();
  assert.equal(FakeWS.all.length, 2);
});
