import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  minecraftDirCandidates, findMinecraftDir, modsDir, ensureModsDir, findFabricLoader, isFabricInstalled,
} from '../lib/minecraft.mjs';

test('candidates per OS', () => {
  assert.deepEqual(
    minecraftDirCandidates({ platform: 'win32', env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, homedir: 'C:\\Users\\a' }),
    ['C:\\Users\\a\\AppData\\Roaming\\.minecraft']);
  assert.deepEqual(
    minecraftDirCandidates({ platform: 'win32', env: {}, homedir: 'C:\\Users\\a' }),
    ['C:\\Users\\a\\AppData\\Roaming\\.minecraft']);
  assert.deepEqual(
    minecraftDirCandidates({ platform: 'darwin', env: {}, homedir: '/Users/a' }),
    ['/Users/a/Library/Application Support/minecraft']);
  assert.deepEqual(
    minecraftDirCandidates({ platform: 'linux', env: {}, homedir: '/home/a' }),
    ['/home/a/.minecraft', '/home/a/.var/app/com.mojang.Minecraft/.minecraft']);
});

test('MINECRAFT_DIR env first, explicit override beats it', () => {
  const o = { platform: 'linux', env: { MINECRAFT_DIR: '/env/mc' }, homedir: '/home/a' };
  assert.equal(minecraftDirCandidates(o)[0], '/env/mc');
  assert.equal(findMinecraftDir({ ...o, exists: () => true }), '/env/mc');
  assert.equal(findMinecraftDir({ ...o, override: '/ov', exists: () => true }), '/ov');
  assert.equal(findMinecraftDir({ ...o, override: '/ov', exists: (d) => d !== '/ov' }), '/env/mc');
});

test('first existing wins (flatpak fallback), none -> null', () => {
  const o = { platform: 'linux', env: {}, homedir: '/home/a' };
  const flat = '/home/a/.var/app/com.mojang.Minecraft/.minecraft';
  assert.equal(findMinecraftDir({ ...o, exists: (d) => d === flat }), flat);
  assert.equal(findMinecraftDir({ ...o, exists: () => false }), null);
});

test('modsDir / ensureModsDir', () => {
  assert.equal(modsDir('/x/.minecraft', 'linux'), '/x/.minecraft/mods');
  assert.equal(modsDir('C:\\mc', 'win32'), 'C:\\mc\\mods');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  try {
    const d = ensureModsDir(tmp);
    assert.ok(fs.statSync(d).isDirectory());
    assert.equal(ensureModsDir(tmp), d);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('fabric loader detection', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  try {
    const mk = (id, json = true) => {
      fs.mkdirSync(path.join(tmp, 'versions', id), { recursive: true });
      if (json) fs.writeFileSync(path.join(tmp, 'versions', id, `${id}.json`), '{}');
    };
    mk('fabric-loader-0.16.9-1.21.4');
    mk('fabric-loader-0.15.0-1.21.4');
    mk('fabric-loader-0.16.9-1.20.1', false); // no json -> ignored
    mk('1.21.4');
    assert.equal(findMinecraftDirless(tmp).length, 2);
    assert.equal(findFabricLoader(tmp, { mcVersion: '1.21.4', loaderVersion: '0.16.9' })[0].id, 'fabric-loader-0.16.9-1.21.4');
    assert.ok(isFabricInstalled(tmp, '1.21.4'));
    assert.ok(isFabricInstalled(tmp, '1.21.4', '0.15.0'));
    assert.ok(!isFabricInstalled(tmp, '1.21.4', '9.9.9'));
    assert.ok(!isFabricInstalled(tmp, '1.20.1'));
    assert.deepEqual(findFabricLoader(path.join(tmp, 'nope'), {}), []);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
function findMinecraftDirless(dir) { return findFabricLoader(dir, {}); }
