'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const c = require('../lib/config');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'coliseum-cfg-'));
const abs = path.resolve('/some/repo');

test('load returns defaults when no file', () => {
  assert.deepEqual(c.loadConfig(tmp()), {
    theme: 'warm_studio', auth: 'claude-login', apiKey: '', repos: [], hqMode: 'coliseum_office',
  });
});

test('save/load round-trip', () => {
  const home = tmp();
  const cfg = { ...c.defaults(), theme: 'executive', repos: [abs] };
  const file = c.saveConfig(home, cfg);
  assert.equal(file, path.join(home, '.coliseum', 'config.json'));
  assert.deepEqual(c.loadConfig(home), cfg);
});

test('legacy openclaw hqMode is migrated', () => {
  const home = tmp();
  c.saveConfig(home, { ...c.defaults(), hqMode: 'openclaw' });
  assert.equal(c.loadConfig(home).hqMode, 'coliseum_office');
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
