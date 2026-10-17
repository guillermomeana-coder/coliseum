// Java detection: find a JDK >= minMajor (default 25) from JAVA_HOME, PATH or well-known install dirs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync as nodeSpawnSync } from 'node:child_process';

/**
 * Major version from `java -version` output. "1.8.0_x" -> 8, "25.0.1" -> 25, "25" -> 25.
 * @param {string} text
 * @returns {number | null}
 */
export function parseJavaVersion(text) {
  const m = /version\s+"(\d+)(?:\.(\d+))?[^"]*"/i.exec(String(text ?? ''));
  if (!m) return null;
  const first = Number(m[1]);
  return first === 1 && m[2] !== undefined ? Number(m[2]) : first;
}

const pathFor = (platform) => (platform === 'win32' ? path.win32 : path.posix);

function candidateHomes(platform, env, readdir) {
  const p = pathFor(platform);
  let roots; // [dir, entry filter, suffix inside entry]
  if (platform === 'win32') {
    const pf = env.ProgramFiles || 'C:\\Program Files';
    roots = [
      [p.join(pf, 'Eclipse Adoptium'), /^jdk-25/i, ''],
      [p.join(pf, 'Java'), /^jdk-25/i, ''],
      [p.join(pf, 'Microsoft'), /^jdk-25/i, ''],
    ];
  } else if (platform === 'darwin') {
    roots = [['/Library/Java/JavaVirtualMachines', /25/, p.join('Contents', 'Home')]];
  } else {
    roots = [['/usr/lib/jvm', /25/, '']];
  }
  const homes = [];
  for (const [dir, re, suffix] of roots) {
    let entries = [];
    try { entries = readdir(dir); } catch { /* dir missing */ }
    for (const e of entries.filter((n) => re.test(n)).sort().reverse()) homes.push(p.join(dir, e, suffix));
  }
  return homes;
}

/**
 * Locate a Java >= minMajor.
 * @param {{minMajor?: number, env?: object, platform?: string, exists?: (p: string) => boolean,
 *   readdir?: (p: string) => string[], spawnSync?: Function}} [opts]
 * @returns {{home: string | null, javaBin: string, major: number} | null}
 */
export function findJava({
  minMajor = 25,
  env = process.env,
  platform = process.platform,
  exists = fs.existsSync,
  readdir = fs.readdirSync,
  spawnSync = nodeSpawnSync,
} = {}) {
  const p = pathFor(platform);
  const exe = platform === 'win32' ? 'java.exe' : 'java';
  const probe = (bin) => {
    try {
      const r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 15000 });
      if (!r || r.error || (r.status ?? 0) !== 0) return null;
      return parseJavaVersion(`${r.stderr ?? ''}\n${r.stdout ?? ''}`);
    } catch { return null; }
  };
  const tryBin = (bin, home) => {
    const major = probe(bin);
    return major !== null && major >= minMajor ? { home, javaBin: bin, major } : null;
  };

  if (env.JAVA_HOME) {
    const bin = p.join(env.JAVA_HOME, 'bin', exe);
    if (exists(bin)) {
      const hit = tryBin(bin, env.JAVA_HOME);
      if (hit) return hit;
    }
  }
  const onPath = tryBin('java', null);
  if (onPath) return onPath;
  for (const home of candidateHomes(platform, env, readdir)) {
    const bin = p.join(home, 'bin', exe);
    if (!exists(bin)) continue;
    const hit = tryBin(bin, home);
    if (hit) return hit;
  }
  return null;
}

/**
 * Where to get Temurin 25 for this OS.
 * @param {string} [platform]
 * @param {string} [arch] node arch (x64, arm64, ...)
 * @returns {{url: string, hint: string}}
 */
export function javaDownloadHint(platform = process.platform, arch = process.arch) {
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
  const a = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'aarch64' : arch;
  const url = `https://adoptium.net/temurin/releases/?version=25&os=${os}&arch=${a}`;
  const hint = platform === 'win32' ? 'winget install EclipseAdoptium.Temurin.25.JDK'
    : platform === 'darwin' ? 'brew install --cask temurin@25'
    : 'apt: sudo apt install temurin-25-jdk (Adoptium repo) | pacman: sudo pacman -S jdk25-openjdk';
  return { url, hint };
}
