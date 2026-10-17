// Minecraft install detection (pure-ish, no deps). All OS/fs access is injectable for tests.
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';

const pathFor = (platform) => (platform === 'win32' ? nodePath.win32 : nodePath.posix);

/**
 * Ordered candidate .minecraft dirs. MINECRAFT_DIR env override comes first.
 * @param {{platform?: string, env?: Record<string,string|undefined>, homedir?: string}} [opts]
 * @returns {string[]}
 */
export function minecraftDirCandidates({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  const p = pathFor(platform);
  const out = [];
  if (env.MINECRAFT_DIR) out.push(env.MINECRAFT_DIR);
  if (platform === 'win32') {
    out.push(p.join(env.APPDATA || p.join(homedir, 'AppData', 'Roaming'), '.minecraft'));
  } else if (platform === 'darwin') {
    out.push(p.join(homedir, 'Library', 'Application Support', 'minecraft'));
  } else {
    out.push(p.join(homedir, '.minecraft'));
    out.push(p.join(homedir, '.var', 'app', 'com.mojang.Minecraft', '.minecraft'));
  }
  return [...new Set(out)];
}

/**
 * First existing Minecraft dir (explicit `override` wins over everything), or null.
 * @param {{override?: string, platform?: string, env?: object, homedir?: string, exists?: (p: string) => boolean}} [opts]
 * @returns {string|null}
 */
export function findMinecraftDir({ override, exists = fs.existsSync, ...rest } = {}) {
  const list = minecraftDirCandidates(rest);
  if (override) list.unshift(override);
  return list.find((d) => exists(d)) ?? null;
}

/** @returns {string} path of <mcDir>/mods */
export function modsDir(mcDir, platform = process.platform) {
  return pathFor(platform).join(mcDir, 'mods');
}

/** Create mods/ if missing; returns its path. */
export function ensureModsDir(mcDir, { mkdir = fs.mkdirSync } = {}) {
  const dir = modsDir(mcDir);
  mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Installed Fabric loader profiles under versions/ (folder fabric-loader-<loader>-<mc> that
 * contains <id>.json), optionally filtered by mcVersion / loaderVersion.
 * @returns {{id: string, loaderVersion: string, mcVersion: string, dir: string}[]}
 */
export function findFabricLoader(mcDir, { mcVersion, loaderVersion, readdir = fs.readdirSync, exists = fs.existsSync } = {}) {
  const versions = nodePath.join(mcDir, 'versions');
  let names;
  try {
    names = readdir(versions);
  } catch {
    return [];
  }
  const found = [];
  for (const id of names) {
    const m = /^fabric-loader-([^-]+)-(.+)$/.exec(id);
    if (!m) continue;
    const dir = nodePath.join(versions, id);
    if (!exists(nodePath.join(dir, `${id}.json`))) continue;
    if (mcVersion && m[2] !== mcVersion) continue;
    if (loaderVersion && m[1] !== loaderVersion) continue;
    found.push({ id, loaderVersion: m[1], mcVersion: m[2], dir });
  }
  return found;
}

/** True if a matching Fabric loader profile is installed. */
export function isFabricInstalled(mcDir, mcVersion, loaderVersion, opts = {}) {
  return findFabricLoader(mcDir, { ...opts, mcVersion, loaderVersion }).length > 0;
}
