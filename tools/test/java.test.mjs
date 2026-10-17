import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJavaVersion, findJava, javaDownloadHint } from '../lib/java.mjs';

test('parseJavaVersion', () => {
  assert.equal(parseJavaVersion('openjdk version "25.0.1" 2026-01-20\nOpenJDK Runtime'), 25);
  assert.equal(parseJavaVersion('java version "25"'), 25);
  assert.equal(parseJavaVersion('java version "1.8.0_392"'), 8);
  assert.equal(parseJavaVersion('openjdk version "21.0.2"'), 21);
  assert.equal(parseJavaVersion('garbage'), null);
});

// fake world: versions maps binary path -> major ('java' = PATH java)
function world({ versions = {}, files = [], dirs = {} }) {
  const calls = [];
  return {
    calls,
    exists: (p) => files.includes(p),
    readdir: (d) => { if (!(d in dirs)) throw new Error('ENOENT'); return dirs[d]; },
    spawnSync: (bin) => {
      calls.push(bin);
      if (!(bin in versions)) return { error: new Error('ENOENT'), status: null };
      return { status: 0, stderr: `openjdk version "${versions[bin]}.0.1"` };
    },
  };
}

test('JAVA_HOME has priority over PATH', () => {
  const bin = '/opt/j25/bin/java';
  const w = world({ files: [bin], versions: { [bin]: 25, java: 25 } });
  const r = findJava({ env: { JAVA_HOME: '/opt/j25' }, platform: 'linux', ...w });
  assert.deepEqual(r, { home: '/opt/j25', javaBin: bin, major: 25 });
  assert.deepEqual(w.calls, [bin]);
});

test('rejects Java 21 everywhere', () => {
  const bin = '/opt/j21/bin/java';
  const w = world({ files: [bin], versions: { [bin]: 21, java: 21 } });
  assert.equal(findJava({ env: { JAVA_HOME: '/opt/j21' }, platform: 'linux', ...w }), null);
});

test('falls back to PATH when JAVA_HOME is too old', () => {
  const bin = '/opt/j21/bin/java';
  const w = world({ files: [bin], versions: { [bin]: 21, java: 25 } });
  const r = findJava({ env: { JAVA_HOME: '/opt/j21' }, platform: 'linux', ...w });
  assert.deepEqual(r, { home: null, javaBin: 'java', major: 25 });
});

test('windows candidates use java.exe', () => {
  const home = 'C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.1.8-hotspot';
  const bin = `${home}\\bin\\java.exe`;
  const w = world({
    files: [bin], versions: { [bin]: 25 },
    dirs: { 'C:\\Program Files\\Eclipse Adoptium': ['jdk-21.0.5', 'jdk-25.0.1.8-hotspot'] },
  });
  assert.deepEqual(findJava({ env: {}, platform: 'win32', ...w }), { home, javaBin: bin, major: 25 });
});

test('windows Java and Microsoft dirs', () => {
  for (const [dir, name] of [['Java', 'jdk-25'], ['Microsoft', 'jdk-25.0.0.36-hotspot']]) {
    const home = `C:\\Program Files\\${dir}\\${name}`;
    const bin = `${home}\\bin\\java.exe`;
    const w = world({ files: [bin], versions: { [bin]: 25 }, dirs: { [`C:\\Program Files\\${dir}`]: [name] } });
    assert.equal(findJava({ env: {}, platform: 'win32', ...w })?.javaBin, bin);
  }
});

test('macOS candidate', () => {
  const home = '/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home';
  const bin = `${home}/bin/java`;
  const w = world({ files: [bin], versions: { [bin]: 25 }, dirs: { '/Library/Java/JavaVirtualMachines': ['temurin-21.jdk', 'temurin-25.jdk'] } });
  assert.deepEqual(findJava({ env: {}, platform: 'darwin', ...w }), { home, javaBin: bin, major: 25 });
});

test('linux candidate', () => {
  const home = '/usr/lib/jvm/java-25-openjdk-amd64';
  const bin = `${home}/bin/java`;
  const w = world({ files: [bin], versions: { [bin]: 25 }, dirs: { '/usr/lib/jvm': ['java-21-openjdk-amd64', 'java-25-openjdk-amd64'] } });
  assert.deepEqual(findJava({ env: {}, platform: 'linux', ...w }), { home, javaBin: bin, major: 25 });
});

test('nothing found -> null', () => {
  assert.equal(findJava({ env: {}, platform: 'linux', ...world({}) }), null);
});

test('javaDownloadHint per OS', () => {
  const win = javaDownloadHint('win32', 'x64');
  assert.equal(win.url, 'https://adoptium.net/temurin/releases/?version=25&os=windows&arch=x64');
  assert.match(win.hint, /winget install EclipseAdoptium\.Temurin\.25\.JDK/);
  const mac = javaDownloadHint('darwin', 'arm64');
  assert.match(mac.url, /os=mac&arch=aarch64/);
  assert.match(mac.hint, /brew install --cask temurin@25/);
  const lin = javaDownloadHint('linux', 'x64');
  assert.match(lin.url, /os=linux&arch=x64/);
  assert.match(lin.hint, /apt/);
  assert.match(lin.hint, /pacman/);
});
