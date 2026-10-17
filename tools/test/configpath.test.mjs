import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configDir, configPath, legacyConfigPath, readConfigFile, writeConfigFile } from '../lib/configpath.mjs';

test('win32 uses APPDATA, falls back to home AppData Roaming', () => {
  assert.equal(configDir({ platform: 'win32', env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, homedir: 'C:\\Users\\a' }), 'C:\\Users\\a\\AppData\\Roaming\\Coliseum');
  assert.equal(configDir({ platform: 'win32', env: {}, homedir: 'C:\\Users\\a' }), 'C:\\Users\\a\\AppData\\Roaming\\Coliseum');
  assert.equal(configPath({ platform: 'win32', env: {}, homedir: 'C:\\Users\\a' }), 'C:\\Users\\a\\AppData\\Roaming\\Coliseum\\config.json');
});

test('darwin uses Application Support', () => {
  assert.equal(configDir({ platform: 'darwin', env: {}, homedir: '/Users/a' }), '/Users/a/Library/Application Support/Coliseum');
});

test('linux uses XDG_CONFIG_HOME, else ~/.config', () => {
  assert.equal(configDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/x' }, homedir: '/home/a' }), '/x/coliseum');
  assert.equal(configDir({ platform: 'linux', env: {}, homedir: '/home/a' }), '/home/a/.config/coliseum');
  assert.equal(configDir({ platform: 'freebsd', env: {}, homedir: '/home/a' }), '/home/a/.config/coliseum');
});

test('COLISEUM_HOME overrides everything', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    assert.equal(configDir({ platform, env: { COLISEUM_HOME: '/o', APPDATA: 'z', XDG_CONFIG_HOME: '/x' }, homedir: '/h' }), '/o');
  }
});

test('legacy fallback read, migrate on save, legacy kept', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
  try {
    const opts = { platform: 'linux', env: {}, homedir: home };
    assert.equal(readConfigFile(opts), null);
    fs.mkdirSync(path.dirname(legacyConfigPath(opts)), { recursive: true });
    fs.writeFileSync(legacyConfigPath(opts), JSON.stringify({ theme: 'old' }));
    assert.deepEqual(readConfigFile(opts), { theme: 'old' });
    assert.equal(fs.existsSync(configPath(opts)), false);
    const orig = console.log; const lines = [];
    console.log = (m) => lines.push(m);
    try { writeConfigFile({ theme: 'new' }, opts); } finally { console.log = orig; }
    assert.match(lines[0], /^Migrated config from .* to /);
    assert.deepEqual(readConfigFile(opts), { theme: 'new' });
    assert.ok(fs.existsSync(legacyConfigPath(opts)));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
