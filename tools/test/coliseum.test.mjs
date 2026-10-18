import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMMANDS, resolveCommand, helpText } from '../coliseum.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'coliseum.mjs');
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', cwd: path.dirname(CLI) + '/..' });

test('every subcommand maps to an existing file', () => {
  assert.deepEqual(Object.keys(COMMANDS).sort(), ['arena', 'bridge', 'doctor', 'launch', 'setup']);
  for (const name of Object.keys(COMMANDS)) {
    const r = resolveCommand([name, '--x']);
    assert.equal(r.kind, 'run');
    assert.deepEqual(r.args, ['--x']);
    assert.ok(fs.existsSync(r.script), r.script);
  }
});

test('helpText lists every command', () => {
  for (const name of Object.keys(COMMANDS)) assert.ok(helpText().includes(`  ${name} `), name);
});

test('no args / help flags print help, exit 0', () => {
  for (const a of [[], ['help'], ['-h'], ['--help']]) {
    const r = run(...a);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage: coliseum/);
  }
});

test('unknown command exits 1 with message on stderr', () => {
  const r = run('nope');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown command: nope/);
  assert.match(r.stderr, /Usage: coliseum/);
});

test('coliseum doctor --help reaches doctor usage', () => {
  const r = run('doctor', '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout + r.stderr, /show this help/);
});
