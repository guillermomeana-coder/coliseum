'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const c = require('../lib/config');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'coliseum-cfg-'));
const env = home => ({ homedir: home, env: { COLISEUM_HOME: path.join(home, 'cfg') } });
const abs = path.resolve('/some/repo');

test('load returns defaults when no file', () => {
  assert.deepEqual(c.loadConfig(env(tmp())), {
    theme: 'warm_studio', auth: 'claude-login', apiKey: '', repos: [], hqMode: 'coliseum_office',
  });
});

test('save/load round-trip', () => {
  const o = env(tmp());
  const cfg = { ...c.defaults(), theme: 'executive', repos: [abs] };
  const file = c.saveConfig(o, cfg);
  assert.equal(file, path.join(o.env.COLISEUM_HOME, 'config.json'));
  assert.deepEqual(c.loadConfig(o), cfg);
});

test('legacy openclaw hqMode is migrated', () => {
  const o = env(tmp());
  c.saveConfig(o, { ...c.defaults(), hqMode: 'openclaw' });
  assert.equal(c.loadConfig(o).hqMode, 'coliseum_office');
});


test('per-platform paths', () => {
  const p = (platform, e, homedir) => c.configPath({ platform, env: e, homedir });
  assert.equal(p('win32', { APPDATA: 'C:\\A\\Roaming' }, 'C:\\U\\me'), 'C:\\A\\Roaming\\Coliseum\\config.json');
  assert.equal(p('win32', {}, 'C:\\U\\me'), 'C:\\U\\me\\AppData\\Roaming\\Coliseum\\config.json');
  assert.equal(p('darwin', {}, '/Users/me'), '/Users/me/Library/Application Support/Coliseum/config.json');
  assert.equal(p('linux', {}, '/home/me'), '/home/me/.config/coliseum/config.json');
  assert.equal(p('linux', { XDG_CONFIG_HOME: '/x' }, '/home/me'), '/x/coliseum/config.json');
  assert.equal(c.configDir({ platform: 'linux', env: { COLISEUM_HOME: '/o', XDG_CONFIG_HOME: '/x' }, homedir: '/h' }), '/o');
});

test('legacy fallback on load, migrate on save keeps legacy file', () => {
  const home = tmp();
  const o = { platform: 'linux', env: {}, homedir: home };
  const legacy = c.legacyConfigPath(o);
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.writeFileSync(legacy, JSON.stringify({ ...c.defaults(), theme: 'minimal' }));
  assert.equal(c.loadConfig(o).theme, 'minimal');
  const file = c.saveConfig(o, { ...c.defaults(), theme: 'executive' });
  assert.equal(path.normalize(file), path.join(home, '.config', 'coliseum', 'config.json'));
  assert.equal(c.loadConfig(o).theme, 'executive');
  assert.equal(JSON.parse(fs.readFileSync(legacy, 'utf8')).theme, 'minimal');
});

test('paths match tools/lib/configpath.mjs', async () => {
  const m = await import('../../tools/lib/configpath.mjs');
  const cases = [
    ['win32', { APPDATA: 'C:\\A' }, 'C:\\U'], ['win32', {}, 'C:\\U'],
    ['darwin', {}, '/Users/me'], ['linux', {}, '/home/me'],
    ['linux', { XDG_CONFIG_HOME: '/x' }, '/home/me'], ['linux', { COLISEUM_HOME: '/o' }, '/home/me'],
    ['win32', { COLISEUM_HOME: 'D:\\c' }, 'C:\\U'],
  ];
  for (const [platform, e, homedir] of cases) {
    const o = { platform, env: e, homedir };
    assert.equal(c.configDir(o), m.configDir(o));
    assert.equal(c.configPath(o), m.configPath(o));
  }
});

test('default config is valid', () => {
  assert.deepEqual(c.validateConfig(c.defaults()), []);
});

test('validation errors', () => {
  const errs = c.validateConfig({ theme: 'x', auth: 'y', hqMode: 'z', apiKey: '', repos: ['rel/path'] });
  assert.equal(errs.length, 4);
  const apiErrs = c.validateConfig({ ...c.defaults(), auth: 'api-key' });
  assert.deepEqual(apiErrs, ['api-key auth requires an API key']);
  assert.deepEqual(c.validateConfig({ ...c.defaults(), auth: 'api-key', apiKey: 'sk-ant-1' }), []);
});
