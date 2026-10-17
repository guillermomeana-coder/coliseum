'use strict';
// Starts Foreman and the bridge as child processes. No electron require: testable with plain node.
//
// Layout the packager (T5) must ship when packaged:
//   <resourcesPath>/app-root/foreman/src/main.ts   (+ foreman/node_modules incl. tsx)
//   <resourcesPath>/app-root/tools/bridge.mjs      (+ tools/lib/*, deps resolvable from there)
// In dev the project root is the repo root (desktop/..).

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');

function resolvePaths({ packaged, resourcesPath, appDir }) {
  const projectRoot = packaged ? path.join(resourcesPath, 'app-root') : path.resolve(appDir, '..');
  return {
    projectRoot,
    foremanDir: path.join(projectRoot, 'foreman'),
    foremanEntry: path.join(projectRoot, 'foreman', 'src', 'main.ts'),
    bridgeEntry: path.join(projectRoot, 'tools', 'bridge.mjs'),
  };
}

/** .ts entries (Foreman) run through tsx; others as plain node scripts. */
function buildCommand({ execPath, entry, args = [], useElectronNode = false, env = {} }) {
  const isTs = /\.tsx?$/.test(entry);
  const nodeArgs = isTs ? ['--import', 'tsx', entry, ...args] : [entry, ...args];
  const outEnv = { ...env };
  if (useElectronNode) outEnv.ELECTRON_RUN_AS_NODE = '1';
  return { cmd: execPath, args: nodeArgs, env: outEnv };
}

function foremanArgs(config) {
  const args = ['--backend', 'claude'];
  const repos = (config.repos || []).filter(Boolean);
  if (repos.length) args.push('--repo', repos.join(','));
  if (config.auth === 'claude-login') args.push('--use-claude-login');
  if (config.port) args.push('--port', String(config.port));
  return args;
}

/** Reads <home>/foreman.json; resolves the run info if that Foreman is alive and its port answers. */
function runfileAlive(home) {
  let r;
  try {
    r = JSON.parse(fs.readFileSync(path.join(home, 'foreman.json'), 'utf8'));
  } catch { return Promise.resolve(null); }
  if (!r || !Number.isInteger(r.pid) || r.pid <= 0) return Promise.resolve(null);
  try { process.kill(r.pid, 0); } catch (e) { if (e.code !== 'EPERM') return Promise.resolve(null); }
  return new Promise((resolve) => {
    const s = net.connect({ host: r.host || '127.0.0.1', port: r.port });
    const done = (v) => { s.destroy(); resolve(v ? r : null); };
    s.setTimeout(800, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

class Launcher extends EventEmitter {
  constructor({ paths, execPath = process.execPath, useElectronNode = false, spawn = childProcess.spawn,
    platform = process.platform, checkRunning = runfileAlive, home } = {}) {
    super();
    this.paths = paths;
    this.execPath = execPath;
    this.useElectronNode = useElectronNode;
    this.spawn = spawn;
    this.platform = platform;
    this.checkRunning = checkRunning;
    this.home = home || process.env.AGENTCRAFT_HOME || path.join(os.homedir(), '.agentcraft');
    this.children = new Map(); // source -> child
    this.status = 'stopped';
    this.stopping = false;
  }

  isRunning() { return this.status === 'starting' || this.status === 'running'; }

  _setStatus(s) { this.status = s; this.emit('status', s); }

  _spawn(source, entry, args, cwd, env) {
    const c = buildCommand({ execPath: this.execPath, entry, args, useElectronNode: this.useElectronNode, env });
    const child = this.spawn(c.cmd, c.args, { cwd, env: c.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.children.set(source, child);
    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue;
      let buf = '';
      stream.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const l of lines) this.emit('log', l, source);
      });
    }
    child.on('error', (err) => {
      this.emit('log', `spawn error: ${err.message}`, source);
      this._onExit(source, child, null, null);
    });
    child.on('exit', (code, signal) => this._onExit(source, child, code, signal));
    return child;
  }

  _onExit(source, child, code, signal) {
    if (this.children.get(source) !== child) return;
    this.children.delete(source);
    this.emit('exit', { source, code, signal });
    if (this.stopping) {
      if (this.children.size === 0) { this.stopping = false; this._setStatus('stopped'); }
      return;
    }
    if (this.status === 'crashed' || this.status === 'stopped') return;
    this._setStatus('crashed');
    this.stop().catch(() => {});
  }

  /** config: {repos?: string[], auth?: 'api-key'|'claude-login', apiKey?, port?, theme?} */
  async start({ config = {} } = {}) {
    if (this.isRunning()) return;
    this._setStatus('starting');
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    if (config.auth === 'api-key' && config.apiKey) env.ANTHROPIC_API_KEY = config.apiKey; // never logged
    if (config.theme) env.AGENTCRAFT_THEME = String(config.theme);
    if (config.port) env.AGENTCRAFT_PORT = String(config.port);

    const existing = await this.checkRunning(this.home);
    if (existing) {
      this.emit('log', `reusing running Foreman (pid ${existing.pid}, port ${existing.port})`, 'foreman');
      env.AGENTCRAFT_PORT = String(existing.port);
    } else {
      this._spawn('foreman', this.paths.foremanEntry, foremanArgs(config), this.paths.foremanDir, env);
    }
    this._spawn('bridge', this.paths.bridgeEntry, ['watch'], this.paths.projectRoot, env);
    this._setStatus('running');
  }

  async stop() {
    const kids = [...this.children.values()];
    if (!kids.length) {
      if (this.status !== 'crashed') this._setStatus('stopped');
      return;
    }
    this.stopping = true;
    for (const child of kids) this._kill(child);
  }

  _kill(child) {
    if (this.platform === 'win32' && child.pid) {
      try {
        this.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        return;
      } catch { /* fall through */ }
    }
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

module.exports = { resolvePaths, buildCommand, Launcher, foremanArgs };
