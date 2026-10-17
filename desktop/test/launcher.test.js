'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { resolvePaths, buildCommand, Launcher } = require('../lib/launcher.js');

function fakeSpawn() {
  const calls = [];
  const fn = (cmd, args, opts) => {
    const c = new EventEmitter();
    c.pid = 1000 + calls.length;
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.killed = [];
    c.kill = (s) => { c.killed.push(s); };
    calls.push({ cmd, args, opts, child: c });
    return c;
  };
  fn.calls = calls;
  return fn;
}
const paths = resolvePaths({ packaged: false, appDir: path.resolve('/r/desktop') });
const mk = (o = {}) => {
  const spawn = fakeSpawn();
  return { spawn, l: new Launcher({ paths, spawn, checkRunning: async () => null, platform: 'linux', ...o }) };
};

test('resolvePaths dev vs packaged', () => {
  const d = resolvePaths({ packaged: false, appDir: path.resolve('/r/desktop') });
  assert.strictEqual(d.projectRoot, path.resolve('/r'));
  assert.strictEqual(d.foremanEntry, path.join(path.resolve('/r'), 'foreman', 'src', 'main.ts'));
  const p = resolvePaths({ packaged: true, resourcesPath: path.resolve('/res'), appDir: '/x' });
  assert.strictEqual(p.projectRoot, path.join(path.resolve('/res'), 'app-root'));
  assert.ok(p.bridgeEntry.endsWith(path.join('tools', 'bridge.mjs')));
});

test('buildCommand: tsx for foreman, electron node env', () => {
  const f = buildCommand({ execPath: 'E', entry: '/a/main.ts', args: ['--x'], useElectronNode: true });
  assert.deepStrictEqual(f.args, ['--import', 'tsx', '/a/main.ts', '--x']);
  assert.strictEqual(f.env.ELECTRON_RUN_AS_NODE, '1');
  const b = buildCommand({ execPath: 'node', entry: '/a/bridge.mjs', args: ['watch'] });
  assert.deepStrictEqual(b.args, ['/a/bridge.mjs', 'watch']);
  assert.strictEqual(b.env.ELECTRON_RUN_AS_NODE, undefined);
});

test('start spawns foreman (cwd foreman/) then bridge; api key in env only', async () => {
  const { spawn, l } = mk({ useElectronNode: true });
  await l.start({ config: { auth: 'api-key', apiKey: 'sk-secret', repos: ['/a', '/b'] } });
  assert.strictEqual(spawn.calls.length, 2);
  const [f, b] = spawn.calls;
  assert.strictEqual(f.opts.cwd, paths.foremanDir);
  assert.ok(f.args.includes('tsx') && f.args.includes('/a,/b'));
  assert.strictEqual(f.opts.env.ANTHROPIC_API_KEY, 'sk-secret');
  assert.ok(!JSON.stringify(f.args).includes('sk-secret'));
  assert.ok(b.args[0].endsWith('bridge.mjs'));
  assert.strictEqual(f.opts.env.ELECTRON_RUN_AS_NODE, '1');
  assert.strictEqual(l.status, 'running');
});

test('no api key in env for claude-login', async () => {
  const { spawn, l } = mk();
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await l.start({ config: { auth: 'claude-login', apiKey: 'sk-x' } });
  assert.strictEqual(spawn.calls[0].opts.env.ANTHROPIC_API_KEY, undefined);
  assert.ok(spawn.calls[0].args.includes('--use-claude-login'));
  if (prev) process.env.ANTHROPIC_API_KEY = prev;
});

test('stop kills both children (SIGTERM) and ends stopped', async () => {
  const { spawn, l } = mk();
  const statuses = [];
  l.on('status', (s) => statuses.push(s));
  await l.start({ config: {} });
  await l.stop();
  assert.deepStrictEqual(spawn.calls.map((c) => c.child.killed), [['SIGTERM'], ['SIGTERM']]);
  spawn.calls.forEach((c) => c.child.emit('exit', 0, null));
  assert.strictEqual(l.status, 'stopped');
  assert.strictEqual(l.isRunning(), false);
  assert.strictEqual(statuses[statuses.length - 1], 'stopped');
});

test('windows stop uses taskkill tree kill', async () => {
  const { spawn, l } = mk({ platform: 'win32' });
  await l.start({ config: {} });
  await l.stop();
  const tk = spawn.calls.filter((c) => c.cmd === 'taskkill');
  assert.strictEqual(tk.length, 2);
  assert.deepStrictEqual(tk[0].args, ['/pid', '1000', '/T', '/F']);
});

test('crash emits crashed and kills the sibling', async () => {
  const { spawn, l } = mk();
  const statuses = [];
  l.on('status', (s) => statuses.push(s));
  await l.start({ config: {} });
  spawn.calls[0].child.emit('exit', 1, null);
  assert.ok(statuses.includes('crashed'));
  assert.deepStrictEqual(spawn.calls[1].child.killed, ['SIGTERM']);
  assert.strictEqual(l.isRunning(), false);
});

test('log lines emitted with source; reuses a live foreman', async () => {
  const { spawn, l } = mk({ checkRunning: async () => ({ pid: 5, port: 9999 }) });
  const logs = [];
  l.on('log', (line, src) => logs.push([line, src]));
  await l.start({ config: {} });
  assert.strictEqual(spawn.calls.length, 1);
  assert.strictEqual(spawn.calls[0].opts.env.AGENTCRAFT_PORT, '9999');
  spawn.calls[0].child.stdout.emit('data', Buffer.from('hello\nwor'));
  spawn.calls[0].child.stdout.emit('data', Buffer.from('ld\n'));
  assert.deepStrictEqual(logs.slice(-2), [['hello', 'bridge'], ['world', 'bridge']]);
});
