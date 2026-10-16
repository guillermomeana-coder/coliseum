#!/usr/bin/env node
/**
 * OpenClaw Office — Interactive Setup
 *
 * Configures auth method, theme, and repos before launching.
 *
 * Usage:
 *   node tools/setup.mjs              # interactive setup
 *   node tools/setup.mjs --show       # show current config
 *   node tools/setup.mjs --theme executive
 *   node tools/setup.mjs --auth claude-login
 *   node tools/setup.mjs --auth api-key --key sk-ant-...
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const HOME = path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw-office');
const CONFIG_PATH = path.join(HOME, 'config.json');

const THEMES = [
  { id: 'warm_studio', name: 'Warm Studio', desc: 'Original timber + copper + plaster (default)' },
  { id: 'modern_glass', name: 'Modern Glass', desc: 'Clean quartz + glass + iron — contemporary office' },
  { id: 'executive', name: 'Executive Suite', desc: 'Dark deepslate + dark oak + gold accents — premium' },
  { id: 'industrial', name: 'Industrial Loft', desc: 'Exposed brick + iron + spruce + concrete' },
  { id: 'minimal', name: 'Minimal', desc: 'White quartz + birch + light gray — ultra clean' },
  { id: 'penthouse', name: 'Penthouse', desc: 'Luxury blackstone + gilded accents + crimson wood' },
];

const AUTH_METHODS = [
  { id: 'claude-login', name: 'Claude Login', desc: 'Use your Claude Max subscription (free, recommended)' },
  { id: 'api-key', name: 'API Key', desc: 'Use an Anthropic API key (costs per token)' },
];

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { theme: 'warm_studio', auth: 'claude-login', apiKey: '', repos: [] };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  console.log(`\nConfig saved to ${CONFIG_PATH}`);
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const cfg = loadConfig();

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     OpenClaw Office — Setup          ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Auth
  console.log('Authentication:');
  AUTH_METHODS.forEach((a, i) => console.log(`  ${i + 1}) ${a.name} — ${a.desc}`));
  const authChoice = await ask(rl, `\nChoose auth [1-${AUTH_METHODS.length}] (current: ${cfg.auth}): `);
  const authIdx = parseInt(authChoice) - 1;
  if (authIdx >= 0 && authIdx < AUTH_METHODS.length) {
    cfg.auth = AUTH_METHODS[authIdx].id;
    if (cfg.auth === 'api-key') {
      const key = await ask(rl, 'Anthropic API key (sk-ant-...): ');
      if (key.trim()) cfg.apiKey = key.trim();
    }
  }

  // Theme
  console.log('\nOffice Theme:');
  THEMES.forEach((t, i) => console.log(`  ${i + 1}) ${t.name} — ${t.desc}`));
  const themeChoice = await ask(rl, `\nChoose theme [1-${THEMES.length}] (current: ${cfg.theme}): `);
  const themeIdx = parseInt(themeChoice) - 1;
  if (themeIdx >= 0 && themeIdx < THEMES.length) cfg.theme = THEMES[themeIdx].id;

  // Repos
  console.log(`\nRegistered repos: ${cfg.repos.length ? cfg.repos.join(', ') : 'none'}`);
  const addRepo = await ask(rl, 'Add a repo path (or Enter to skip): ');
  if (addRepo.trim()) {
    if (!cfg.repos.includes(addRepo.trim())) cfg.repos.push(addRepo.trim());
  }

  saveConfig(cfg);
  console.log('\nCurrent config:');
  console.log(JSON.stringify(cfg, null, 2));
  console.log('\nRun: node tools/launch-openclaw.mjs');

  rl.close();
}

// CLI flags
const args = process.argv.slice(2);
if (args.includes('--show')) {
  console.log(JSON.stringify(loadConfig(), null, 2));
} else if (args.includes('--theme')) {
  const cfg = loadConfig();
  cfg.theme = args[args.indexOf('--theme') + 1];
  saveConfig(cfg);
} else if (args.includes('--auth')) {
  const cfg = loadConfig();
  cfg.auth = args[args.indexOf('--auth') + 1];
  if (args.includes('--key')) cfg.apiKey = args[args.indexOf('--key') + 1];
  saveConfig(cfg);
} else {
  interactive();
}
