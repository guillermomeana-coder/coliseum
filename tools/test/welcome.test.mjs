import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { welcomeText, isFirstRun, LOGO, INTRO } from '../lib/welcome.mjs';

const tools = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('logo is ascii and <= 80 cols', () => {
  for (const l of LOGO) { assert.ok(l.length <= 80); assert.match(l, /^[\x20-\x7e]*$/); }
  assert.match(welcomeText(), /^[\x00-\x7f]*$/);
});

test('logo keeps its backslashes', () => {
  assert.ok(LOGO.join('').includes('\\'));
  assert.equal(LOGO[1], ' / ___/ _ \\| |   |_ _/ ___|| ____| | | |  \\/  |');
});

test('intro has exactly 3 sentences', () => {
  assert.equal(INTRO.length, 3);
  assert.equal((INTRO.join(' ').match(/[.!?](\s|$)/g) || []).length, 3);
});

test('isFirstRun follows config.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'col-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'colh-'));
  const opts = { env: { COLISEUM_HOME: dir }, homedir: home };
  assert.equal(isFirstRun(opts), true);
  fs.writeFileSync(path.join(dir, 'config.json'), '{}');
  assert.equal(isFirstRun(opts), false);
});

test('launch.mjs without config prints welcome and exits 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'col-'));
  const r = spawnSync(process.execPath, [path.join(tools, 'launch.mjs')], {
    env: { ...process.env, COLISEUM_HOME: dir, HOME: dir, USERPROFILE: dir },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /AI agent team/);
  assert.match(r.stdout, /node tools\/setup\.mjs/);
});
