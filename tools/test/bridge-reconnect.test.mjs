import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const BRIDGE = fileURLToPath(new URL('../bridge.mjs', import.meta.url));

// Minimal fake Foreman: answers `hello` with a snapshot, records every message and socket.
function fakeForeman() {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const seen = { hellos: 0, sockets: [] };
  wss.on('connection', (ws) => {
    seen.sockets.push(ws);
    ws.on('message', (data) => {
      const m = JSON.parse(String(data));
      if (m.type === 'hello') {
        seen.hellos++;
        ws.send(JSON.stringify({ v: 1, type: 'snapshot', foreman: { backend: 'sim', auth: 'ok' }, agents: [], tasks: [], decisions: [], goals: [], repos: [], feed: [] }));
      }
    });
  });
  return new Promise((resolve) => wss.on('listening', () => resolve({ wss, seen, port: wss.address().port })));
}

// A port nothing listens on.
function closedPort() {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function run(args, env) {
  const child = spawn(process.execPath, [BRIDGE, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', (d) => { out.stdout += d; });
  child.stderr.on('data', (d) => { out.stderr += d; });
  return { child, out };
}

async function until(pred, timeoutMs, what) {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('watch: reconnects with backoff after the server drops the socket, sends hello again', async () => {
  const { wss, seen, port } = await fakeForeman();
  const { child, out } = run(['watch'], { COLISEUM_PORT: String(port) });
  try {
    await until(() => seen.hellos === 1, 5000, 'first hello');
    seen.sockets[0].terminate();
    await until(() => /retry #1 in 1s/.test(out.stderr), 5000, 'retry log');
    assert.match(out.stderr, /\[bridge\] connection lost \(.*\) — retry #1 in 1s/);
    await until(() => seen.hellos === 2, 5000, 'second hello');
    await until(() => /\[bridge\] reconnected/.test(out.stderr), 5000, 'reconnected log');
    assert.equal(child.exitCode, null, 'watch keeps running');
  } finally {
    child.kill();
    for (const s of seen.sockets) s.terminate();
    wss.close();
  }
});

test('status against a closed port retries 5 times total, then exits 1', async () => {
  const port = await closedPort();
  const { child, out } = run(['status'], { COLISEUM_PORT: String(port), COLISEUM_BACKOFF_BASE_MS: '10' });
  try {
    const code = await new Promise((resolve) => child.once('exit', resolve));
    assert.equal(code, 1);
    const retries = out.stderr.match(/retry #\d+ in/g) || [];
    assert.equal(retries.length, 4); // 5 attempts -> 4 retries
    assert.match(out.stderr, /connection failed \(.*\) — retry #1 in 0\.01s/);
    assert.match(out.stderr, /retry #4 in 0\.08s/);
    assert.match(out.stderr, /Connection failed: .*\nIs the Foreman running\?/);
  } finally {
    child.kill();
  }
});
