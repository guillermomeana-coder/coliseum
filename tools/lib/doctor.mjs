// Dependency checks for `coliseum doctor`. Pure: exec / platform / env / fsExists are injectable.
// Each check returns {name, ok, required, found, message, install}.
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { findJava, javaDownloadHint, parseJavaVersion } from './java.mjs';
import { findMinecraftDir } from './minecraft.mjs';

export const MIN_JAVA = 25;
export const MIN_NODE = 22;

// Runs a command and returns {stdout, stderr}. Throws if the binary is missing or exits non-zero.
// (`java -version` prints to stderr, hence spawnSync rather than execFileSync.)
export function defaultExec(cmd, args) {
  const r = nodeSpawnSync(cmd, args, { encoding: 'utf8', timeout: 10000 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
  return { stdout: r.stdout || '', stderr: r.stderr || '' };
}

const text = (r) => (typeof r === 'string' ? r : `${r?.stdout ?? ''}\n${r?.stderr ?? ''}`);
const home = (env) => env.HOME || env.USERPROFILE || os.homedir();

function javaVersionString(output) {
  return /version "([^"]+)"/.exec(output)?.[1] ?? null;
}

export function checkJava({
  platform = process.platform, env = process.env, fsExists = fs.existsSync,
  readdir = fs.readdirSync, spawnSync = nodeSpawnSync,
} = {}) {
  const { hint, url } = javaDownloadHint(platform);
  const base = { name: `Java ${MIN_JAVA}+`, required: true, install: `${hint}  (or ${url})` };
  const probe = (bin) => {
    try {
      const r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 15000 });
      if (!r || r.error) return null;
      return `${r.stderr ?? ''}
${r.stdout ?? ''}`;
    } catch { return null; }
  };
  const hit = findJava({ minMajor: MIN_JAVA, env, platform, exists: fsExists, readdir, spawnSync });
  if (hit) {
    const version = javaVersionString(probe(hit.javaBin) ?? '') || String(hit.major);
    return { ...base, ok: true, found: version, message: `Java ${version} (${hit.javaBin})` };
  }
  // Not found at 25+: probe PATH java once so we can say what is installed.
  const out = probe('java');
  const major = out == null ? null : parseJavaVersion(out);
  if (major == null) return { ...base, ok: false, found: null, message: 'Java not found' };
  const version = javaVersionString(out) || String(major);
  return { ...base, ok: false, found: version, message: `Java ${version} found, but ${MIN_JAVA}+ is required` };
}

export function checkNode({ nodeVersion = process.versions.node, platform = process.platform } = {}) {
  const major = Number(String(nodeVersion).split('.')[0]);
  const hint = platform === 'win32' ? ' or: winget install OpenJS.NodeJS.LTS' : platform === 'darwin' ? ' or: brew install node' : '';
  const base = { name: `Node ${MIN_NODE}+`, required: true, found: nodeVersion, install: `https://nodejs.org (LTS)${hint}` };
  return major >= MIN_NODE
    ? { ...base, ok: true, message: `Node ${nodeVersion}` }
    : { ...base, ok: false, message: `Node ${nodeVersion} found, but ${MIN_NODE}+ is required` };
}

export function checkGit({ exec = defaultExec, platform = process.platform } = {}) {
  const install = platform === 'win32' ? 'winget install Git.Git  (or https://git-scm.com)'
    : platform === 'darwin' ? 'brew install git  (or https://git-scm.com)'
    : 'sudo apt install git  (or https://git-scm.com)';
  const base = { name: 'git', required: true, install };
  try {
    const out = text(exec('git', ['--version'])).trim();
    const v = /git version (\S+)/.exec(out)?.[1] || out;
    return { ...base, ok: true, found: v, message: `git ${v}` };
  } catch {
    return { ...base, ok: false, found: null, message: 'git not found' };
  }
}

export function checkMinecraft({ platform = process.platform, env = process.env, fsExists = fs.existsSync } = {}) {
  const dir = findMinecraftDir({ platform, env, homedir: home(env), exists: fsExists });
  const base = { name: 'Minecraft Java Edition', required: false, install: 'https://www.minecraft.net/download (only needed for --game; headless works without it)' };
  return dir
    ? { ...base, ok: true, found: dir, message: `found ${dir}` }
    : { ...base, ok: false, found: null, message: 'Minecraft not found (optional: headless mode works without it)' };
}

export function runChecks(opts = {}) {
  return [checkJava(opts), checkNode(opts), checkGit(opts), checkMinecraft(opts)];
}

// 0 if every required check passed, else 1. Optional failures are warnings.
export function exitCode(results) {
  return results.some((r) => r.required && !r.ok) ? 1 : 0;
}

export function formatReport(results) {
  const lines = [];
  for (const r of results) {
    const mark = r.ok ? '✓' : r.required ? '✗' : '!';
    lines.push(`  ${mark} ${r.name}: ${r.message}`);
    if (!r.ok) lines.push(`      install: ${r.install}`);
  }
  const failed = results.filter((r) => !r.ok && r.required).length;
  const warned = results.filter((r) => !r.ok && !r.required).length;
  lines.push('');
  lines.push(failed ? `${failed} required dependenc${failed === 1 ? 'y' : 'ies'} missing${warned ? `, ${warned} warning(s)` : ''}.`
    : warned ? `All required dependencies OK (${warned} warning(s)).` : 'All dependencies OK.');
  return lines.join('\n');
}
