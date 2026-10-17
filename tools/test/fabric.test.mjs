import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readGradleProperties, latestInstallerUrl, downloadFile, installFabricLoader,
  fabricApiUrl, installFabricApi, parseInstallerVersion,
} from '../lib/fabric.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'fabric-test-'));
const XML = '<metadata><versioning><latest>1.0.2</latest><release>1.0.1</release><versions><version>1.0.0</version><version>1.0.1</version></versions></versioning></metadata>';
const mkFetch = (routes, calls = []) => async (url) => {
  calls.push(url);
  const body = routes[url];
  if (body === undefined) return { ok: false, status: 404 };
  return { ok: true, status: 200, text: async () => body, arrayBuffer: async () => Buffer.from(body) };
};

test('readGradleProperties parses and skips comments', () => {
  const f = join(tmp(), 'g.properties');
  writeFileSync(f, '# c\n\nminecraft_version=26.3\nfabric_api_version = 0.161.0+26.3\r\nbad line\n');
  assert.deepEqual(readGradleProperties(f), { minecraft_version: '26.3', fabric_api_version: '0.161.0+26.3' });
});

test('metadata parsing prefers release, falls back to last version', () => {
  assert.equal(parseInstallerVersion(XML), '1.0.1');
  assert.equal(parseInstallerVersion('<versions><version>1</version><version>2</version></versions>'), '2');
  assert.throws(() => parseInstallerVersion('<x/>'));
});

test('latestInstallerUrl', async () => {
  const fetch = mkFetch({ 'https://maven.fabricmc.net/net/fabricmc/fabric-installer/maven-metadata.xml': XML });
  assert.equal(await latestInstallerUrl({ fetch }),
    'https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.0.1/fabric-installer-1.0.1.jar');
});

test('downloadFile writes dest, no temp left; errors on HTTP failure', async () => {
  const d = tmp();
  await downloadFile('u', join(d, 'a.jar'), { fetch: mkFetch({ u: 'data' }) });
  assert.equal(readFileSync(join(d, 'a.jar'), 'utf8'), 'data');
  assert.deepEqual(readdirSync(d), ['a.jar']);
  await assert.rejects(downloadFile('nope', join(d, 'b.jar'), { fetch: mkFetch({}) }), /404/);
});

const loaderFetch = mkFetch({
  'https://maven.fabricmc.net/net/fabricmc/fabric-installer/maven-metadata.xml': XML,
  'https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.0.1/fabric-installer-1.0.1.jar': 'JAR',
});

test('installFabricLoader runs installer with right args', async () => {
  const tmpDir = tmp();
  let call;
  const spawnSync = (bin, args) => { call = { bin, args }; return { status: 0, stdout: 'ok', stderr: '' }; };
  await installFabricLoader({ javaBin: 'J', mcDir: '/mc', mcVersion: '26.3', loaderVersion: '0.19.5', fetch: loaderFetch, spawnSync, tmpDir });
  assert.equal(call.bin, 'J');
  assert.deepEqual(call.args, ['-jar', join(tmpDir, 'fabric-installer.jar'), 'client', '-dir', '/mc', '-mcversion', '26.3', '-loader', '0.19.5']);
  assert.equal(existsSync(join(tmpDir, 'fabric-installer.jar')), true);
});

test('installFabricLoader throws with installer output on failure', async () => {
  const spawnSync = () => ({ status: 2, stdout: '', stderr: 'boom' });
  await assert.rejects(
    installFabricLoader({ mcDir: '/mc', mcVersion: '1', loaderVersion: '2', fetch: loaderFetch, spawnSync, tmpDir: tmp() }),
    /exit 2[\s\S]*boom/);
});

test('fabricApiUrl', () => {
  assert.equal(fabricApiUrl('0.161.0+26.3'),
    'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.161.0+26.3/fabric-api-0.161.0+26.3.jar');
});

test('installFabricApi replaces older jars and skips when present', async () => {
  const modsDir = join(tmp(), 'mods');
  const calls = [];
  const fetch = mkFetch({ [fabricApiUrl('2.0')]: 'NEW' }, calls);
  await installFabricApi({ modsDir, version: '1.0', fetch: mkFetch({ [fabricApiUrl('1.0')]: 'OLD' }) });
  writeFileSync(join(modsDir, 'other.jar'), 'x');
  const r = await installFabricApi({ modsDir, version: '2.0', fetch });
  assert.equal(r.skipped, false);
  assert.deepEqual(r.removed, ['fabric-api-1.0.jar']);
  assert.deepEqual(readdirSync(modsDir).sort(), ['fabric-api-2.0.jar', 'other.jar']);
  const r2 = await installFabricApi({ modsDir, version: '2.0', fetch });
  assert.equal(r2.skipped, true);
  assert.equal(calls.length, 1);
});
