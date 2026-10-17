import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkJava, checkNode, checkGit, checkMinecraft, exitCode, formatReport } from '../lib/doctor.mjs';

const javaOut = (v) => ({ status: 0, stdout: '', stderr: `openjdk version "${v}" 2025-01-21
OpenJDK Runtime Environment` });
const enoent = () => { throw Object.assign(new Error('spawn java ENOENT'), { code: 'ENOENT' }); };
const enoentSpawn = () => ({ error: Object.assign(new Error('spawn java ENOENT'), { code: 'ENOENT' }) });
const base = { platform: 'linux', env: { HOME: '/home/u' }, fsExists: () => false, readdir: () => [] };

test('java 25 ok', () => {
  const r = checkJava({ ...base, spawnSync: () => javaOut('25.0.1') });
  assert.equal(r.ok, true);
  assert.equal(r.found, '25.0.1');
});

test('java too old reports found version', () => {
  const r = checkJava({ ...base, spawnSync: () => javaOut('21.0.2') });
  assert.equal(r.ok, false);
  assert.equal(r.found, '21.0.2');
  assert.match(r.message, /21\.0\.2/);
  assert.match(r.install, /25/);
});

test('java 1.8 is old', () => {
  const r = checkJava({ ...base, spawnSync: () => javaOut('1.8.0_392') });
  assert.equal(r.ok, false);
  assert.equal(r.found, '1.8.0_392');
});

test('java missing (ENOENT)', () => {
  const r = checkJava({ ...base, spawnSync: enoentSpawn });
  assert.equal(r.ok, false);
  assert.equal(r.found, null);
  assert.match(r.message, /not found/);
});

test('java: real Temurin dir (jdk-25.0.1.8-hotspot) beats old PATH java', () => {
  const dir = String.raw`C:\Program Files\Eclipse Adoptium`;
  const r = checkJava({
    platform: 'win32', env: { ProgramFiles: String.raw`C:\Program Files` },
    readdir: (d) => (d === dir ? ['jdk-25.0.1.8-hotspot'] : []),
    fsExists: (p) => p.includes('jdk-25.0.1.8-hotspot'),
    spawnSync: (bin) => javaOut(bin === 'java' ? '17.0.1' : '25.0.1'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.found, '25.0.1');
  assert.match(r.message, /jdk-25\.0\.1\.8-hotspot/);
});

test('node too old / ok', () => {
  assert.equal(checkNode({ nodeVersion: '20.11.0' }).ok, false);
  assert.equal(checkNode({ nodeVersion: '22.0.0' }).ok, true);
});

test('git ok and missing', () => {
  assert.equal(checkGit({ exec: () => ({ stdout: 'git version 2.45.1\n', stderr: '' }) }).found, '2.45.1');
  const r = checkGit({ exec: enoent, platform: 'win32' });
  assert.equal(r.ok, false);
  assert.match(r.install, /winget/);
});

test('minecraft missing is a warning only', () => {
  const mc = checkMinecraft({ ...base });
  assert.equal(mc.ok, false);
  assert.equal(mc.required, false);
  assert.equal(exitCode([{ ok: true, required: true }, mc]), 0);
  assert.match(formatReport([mc]), /!/);
});

test('minecraft: MINECRAFT_DIR override is found', () => {
  const r = checkMinecraft({ platform: 'linux', env: { HOME: '/h', MINECRAFT_DIR: '/mc' }, fsExists: (p) => p === '/mc' });
  assert.equal(r.ok, true);
  assert.equal(r.found, '/mc');
});

test('minecraft path per platform', () => {
  const seen = [];
  const fsExists = (p) => { seen.push(p); return true; };
  checkMinecraft({ platform: 'win32', env: { APPDATA: 'C:\\A' }, fsExists });
  checkMinecraft({ platform: 'darwin', env: { HOME: '/Users/u' }, fsExists });
  assert.match(seen[0], /\.minecraft$/);
  assert.match(seen[1], /Application Support/);
});

test('exit code: required failure -> 1', () => {
  assert.equal(exitCode([{ ok: false, required: true }]), 1);
  assert.equal(exitCode([{ ok: true, required: true }]), 0);
});
