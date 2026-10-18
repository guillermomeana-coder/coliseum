import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectModJar, replaceModJar } from '../lib/installmod.mjs';

test('selectModJar prefers exact name and skips sources', () => {
  const files = ['coliseum-0.1.0-sources.jar', 'coliseum-0.1.0.jar', 'coliseum-0.0.9.jar'];
  assert.equal(selectModJar(files, { base: 'coliseum', version: '0.1.0' }), 'coliseum-0.1.0.jar');
  assert.equal(selectModJar(['coliseum-0.1.0-sources.jar'], { base: 'coliseum', version: '0.1.0' }), null);
  assert.equal(selectModJar([], { base: 'coliseum', version: '0.1.0' }), null);
});

test('replaceModJar removes old coliseum jars, keeps others', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'im-'));
  try {
    const mods = path.join(tmp, 'mods');
    fs.mkdirSync(mods);
    fs.writeFileSync(path.join(mods, 'coliseum-0.0.9.jar'), 'old');
    fs.writeFileSync(path.join(mods, 'fabric-api-1.jar'), 'x');
    const jar = path.join(tmp, 'coliseum-0.1.0.jar');
    fs.writeFileSync(jar, 'new');
    const { removed } = replaceModJar({ jarPath: jar, modsDir: mods, base: 'coliseum' });
    assert.deepEqual(removed, ['coliseum-0.0.9.jar']);
    assert.deepEqual(fs.readdirSync(mods).sort(), ['coliseum-0.1.0.jar', 'fabric-api-1.jar']);
    assert.equal(fs.readFileSync(path.join(mods, 'coliseum-0.1.0.jar'), 'utf8'), 'new');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
