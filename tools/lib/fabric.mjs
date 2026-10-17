// Fabric loader + Fabric API installer helpers (Node >=22, global fetch, no deps).
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAVEN = 'https://maven.fabricmc.net';
export const INSTALLER_METADATA_URL = `${MAVEN}/net/fabricmc/fabric-installer/maven-metadata.xml`;

/** Parse a Java-style .properties file (key=value, # / ! comments) into an object. */
export function readGradleProperties(file) {
  const props = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return props;
}

/** Pick the newest installer version out of maven-metadata.xml text. */
export function parseInstallerVersion(xml) {
  const tag = (name) => xml.match(new RegExp(`<${name}>\\s*([^<\\s]+)\\s*</${name}>`))?.[1];
  const version = tag('release') ?? tag('latest') ?? [...xml.matchAll(/<version>\s*([^<\s]+)\s*<\/version>/g)].map((m) => m[1]).pop();
  if (!version) throw new Error('no installer version found in maven-metadata.xml');
  return version;
}

/** URL of the latest fabric-installer jar. */
export async function latestInstallerUrl({ fetch = globalThis.fetch } = {}) {
  const res = await fetch(INSTALLER_METADATA_URL);
  if (!res.ok) throw new Error(`fetching ${INSTALLER_METADATA_URL} failed: HTTP ${res.status}`);
  const v = parseInstallerVersion(await res.text());
  return `${MAVEN}/net/fabricmc/fabric-installer/${v}/fabric-installer-${v}.jar`;
}

/** Download url to dest via a temp file + rename. */
export async function downloadFile(url, dest, { fetch = globalThis.fetch } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`downloading ${url} failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = `${dest}.part`;
  try {
    writeFileSync(tmp, buf);
    renameSync(tmp, dest);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
  return dest;
}

/** Download the Fabric installer and run it in client mode against mcDir. */
export async function installFabricLoader({
  javaBin = 'java', mcDir, mcVersion, loaderVersion,
  fetch = globalThis.fetch, spawnSync = nodeSpawnSync, tmpDir,
} = {}) {
  if (!mcDir || !mcVersion || !loaderVersion) throw new Error('mcDir, mcVersion and loaderVersion are required');
  const ownTmp = !tmpDir;
  const dir = tmpDir ?? mkdtempSync(join(tmpdir(), 'fabric-installer-'));
  mkdirSync(dir, { recursive: true });
  try {
    const jar = join(dir, 'fabric-installer.jar');
    await downloadFile(await latestInstallerUrl({ fetch }), jar, { fetch });
    const args = ['-jar', jar, 'client', '-dir', mcDir, '-mcversion', mcVersion, '-loader', loaderVersion];
    const r = spawnSync(javaBin, args, { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
      throw new Error(`Fabric installer failed (${r.error ? r.error.message : `exit ${r.status}`})${out ? `:\n${out}` : ''}`);
    }
    return { stdout: r.stdout ?? '', args };
  } finally {
    if (ownTmp) rmSync(dir, { recursive: true, force: true });
  }
}

export function fabricApiUrl(version) {
  return `${MAVEN}/net/fabricmc/fabric-api/fabric-api/${version}/fabric-api-${version}.jar`;
}

/** Install fabric-api-<version>.jar in modsDir, removing older fabric-api-*.jar. */
export async function installFabricApi({ modsDir, version, fetch = globalThis.fetch } = {}) {
  if (!modsDir || !version) throw new Error('modsDir and version are required');
  mkdirSync(modsDir, { recursive: true });
  const name = `fabric-api-${version}.jar`;
  const dest = join(modsDir, name);
  if (existsSync(dest)) return { path: dest, skipped: true, removed: [] };
  await downloadFile(fabricApiUrl(version), dest, { fetch });
  const removed = [];
  for (const f of readdirSync(modsDir)) {
    if (f !== name && /^fabric-api-.*\.jar$/.test(f)) {
      rmSync(join(modsDir, f), { force: true });
      removed.push(f);
    }
  }
  return { path: dest, skipped: false, removed };
}
