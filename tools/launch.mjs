#!/usr/bin/env node
/**
 * OpenClaw Office — Unified Launcher
 *
 * Reads config from ~/.coliseum/config.json (created by setup.mjs)
 * and launches the Foreman with the right auth, theme, and repos.
 *
 * Usage:
 *   node tools/launch.mjs                    # headless (no game)
 *   node tools/launch.mjs --game             # with Minecraft window
 *   node tools/launch.mjs --repo C:\myrepo   # override repo
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { handleHelp } from './lib/help.mjs';

const USAGE = `Usage: node tools/launch.mjs [--game] [--repo PATH]

Unified launcher: reads ~/.coliseum/config.json (created by setup.mjs) and launches the Foreman with
the configured auth, theme, HQ mode and repos via tools/launch.ps1.

Options:
  --game          also start the Minecraft window (default: headless)
  --repo PATH     use this repo instead of the configured ones
  -h, --help      show this help

Env: HOME / USERPROFILE (config location), JAVA_HOME
Examples:
  node tools/launch.mjs
  node tools/launch.mjs --game --repo C:\myrepo`;
handleHelp(USAGE);


const HOME = path.join(process.env.HOME || process.env.USERPROFILE, '.coliseum');
const CONFIG_PATH = path.join(HOME, 'config.json');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    console.log('No config found. Run: node tools/setup.mjs');
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const cfg = loadConfig();
// Legacy 'openclaw' hqMode id maps to coliseum_office.
if (cfg.hqMode === 'openclaw') cfg.hqMode = 'coliseum_office';
const withGame = args.includes('--game');
const repoOverride = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : null;
const repos = repoOverride ? [repoOverride] : cfg.repos || [];

console.log('╔══════════════════════════════════════╗');
console.log('║     OpenClaw Office — Launching      ║');
console.log('╚══════════════════════════════════════╝');
console.log(`  Auth:   ${cfg.auth}`);
console.log(`  Theme:  ${cfg.theme}`);
console.log(`  HQ:     ${cfg.hqMode || 'coliseum_office'}`);
console.log(`  Repos:  ${repos.join(', ') || 'none'}`);
console.log(`  Game:   ${withGame ? 'yes' : 'headless'}`);
console.log('');

// Build PowerShell command
const psArgs = [];
if (cfg.auth === 'claude-login') psArgs.push('-UseClaudeLogin');
if (!withGame) psArgs.push('-NoGame');
for (const r of repos) psArgs.push('-Repo', `"${r}"`);

// Set env vars
const env = { ...process.env };
env.COLISEUM_THEME = cfg.theme;
env.COLISEUM_HQ_DEFAULT = cfg.hqMode || 'coliseum_office';
// Older mod builds read the OPENCLAW_* names.
env.OPENCLAW_THEME = env.COLISEUM_THEME;
// Older builds don't know 'coliseum_office' (they'd fall back to the arena); they call it 'openclaw'.
env.OPENCLAW_HQ_DEFAULT = env.COLISEUM_HQ_DEFAULT === 'coliseum_office' ? 'openclaw' : env.COLISEUM_HQ_DEFAULT;
if (cfg.auth === 'api-key' && cfg.apiKey) {
  env.ANTHROPIC_API_KEY = cfg.apiKey;
}
if (!env.JAVA_HOME) {
  // Auto-detect common Java 25 install locations
  const candidates = [
    path.join(process.env.HOME || process.env.USERPROFILE, '.jdks', 'temurin-25'),
    path.join(process.env.HOME || process.env.USERPROFILE, '.jdks', 'jdk-25'),
    ...(process.platform === 'win32'
      ? ['C:\\Program Files\\Eclipse Adoptium\\jdk-25', 'C:\\Program Files\\Java\\jdk-25']
      : ['/usr/lib/jvm/temurin-25', '/usr/lib/jvm/java-25']),
  ];
  for (const j25 of candidates) {
    if (fs.existsSync(j25)) { env.JAVA_HOME = j25; break; }
  }
}

const cmd = `powershell -ExecutionPolicy Bypass -File "${path.join(ROOT, 'tools', 'launch.ps1')}" ${psArgs.join(' ')}`;
console.log(`> ${cmd}\n`);

const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'tools', 'launch.ps1'), ...psArgs.flatMap(a => a.startsWith('"') ? [a.slice(1, -1)] : [a])], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  if (code !== 0) console.error(`\nLauncher exited with code ${code}`);
});
