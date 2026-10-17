// Platform-appropriate location of the Coliseum config. Nothing is created at import time.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function defaults(o = {}) {
  return { platform: o.platform ?? process.platform, env: o.env ?? process.env, homedir: o.homedir ?? os.homedir() };
}

/** Directory holding config.json. COLISEUM_HOME overrides everything. */
export function configDir(opts) {
  const { platform, env, homedir } = defaults(opts);
  if (env.COLISEUM_HOME) return env.COLISEUM_HOME;
  if (platform === 'win32') return path.win32.join(env.APPDATA || path.win32.join(homedir, 'AppData', 'Roaming'), 'Coliseum');
  if (platform === 'darwin') return path.posix.join(homedir, 'Library', 'Application Support', 'Coliseum');
  return path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(homedir, '.config'), 'coliseum');
}

export function configPath(opts) {
  const { platform } = defaults(opts);
  return (platform === 'win32' ? path.win32 : path.posix).join(configDir(opts), 'config.json');
}

/** Pre-t57 location: ~/.coliseum/config.json (home from the injected homedir). */
export function legacyConfigPath(opts) {
  const { homedir } = defaults(opts);
  return path.join(homedir, '.coliseum', 'config.json');
}

/** Path to read from: the new config if present, else the legacy file if present, else the new path. */
export function resolveReadPath(opts) {
  const p = configPath(opts);
  if (fs.existsSync(p)) return p;
  const legacy = legacyConfigPath(opts);
  return fs.existsSync(legacy) ? legacy : p;
}

/** Parsed config JSON, or null when no config exists / it is unreadable. */
export function readConfigFile(opts) {
  try {
    return JSON.parse(fs.readFileSync(resolveReadPath(opts), 'utf8'));
  } catch {
    return null;
  }
}

/** Write config to the new location (migrating from legacy if needed). Returns the path written. */
export function writeConfigFile(cfg, opts) {
  const p = configPath(opts);
  const legacy = legacyConfigPath(opts);
  const migrating = !fs.existsSync(p) && fs.existsSync(legacy);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  if (migrating) console.log(`Migrated config from ${legacy} to ${p}`);
  return p;
}
