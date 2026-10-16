#!/usr/bin/env node
/**
 * OpenClaw Office — Unified Launcher
 *
 * Reads config from ~/.openclaw-office/config.json (created by setup.mjs)
 * and launches the Foreman with the right auth, theme, and repos.
 *
 * Usage:
 *   node tools/launch-openclaw.mjs                    # headless (no game)
 *   node tools/launch-openclaw.mjs --game             # with Minecraft window
 *   node tools/launch-openclaw.mjs --repo C:\myrepo   # override repo
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HOME = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw-office');
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
const withGame = args.includes('--game');
const repoOverride = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : null;
const repos = repoOverride ? [repoOverride] : cfg.repos || [];

console.log('╔══════════════════════════════════════╗');
console.log('║     OpenClaw Office — Launching      ║');
console.log('╚══════════════════════════════════════╝');
console.log(`  Auth:   ${cfg.auth}`);
console.log(`  Theme:  ${cfg.theme}`);
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
env.OPENCLAW_THEME = cfg.theme;
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
