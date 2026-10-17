#!/usr/bin/env node
/**
 * Coliseum — Interactive Setup
 *
 * Configures auth method, theme, and repos before launching.
 *
 * Usage:
 *   node tools/setup.mjs              # interactive setup
 *   node tools/setup.mjs --show       # show current config
 *   node tools/setup.mjs --theme executive
 *   node tools/setup.mjs --auth claude-login
 *   node tools/setup.mjs --auth api-key --key sk-ant-...
 *   node tools/setup.mjs --hq-mode coliseum_nether
 *
 * Valid --hq-mode ids: coliseum_office, coliseum, coliseum_nether, coliseum_ice
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { handleHelp } from './lib/help.mjs';
import { resolveReadPath, readConfigFile, writeConfigFile } from './lib/configpath.mjs';

const USAGE = `Usage: node tools/setup.mjs [--show | --theme ID | --auth METHOD [--key KEY] | --hq-mode ID]

Coliseum setup: configures auth method, theme, HQ mode and repos in config.json (Windows: %APPDATA%\\Coliseum,
macOS: ~/Library/Application Support/Coliseum, Linux: $XDG_CONFIG_HOME/coliseum or ~/.config/coliseum).
The old ~/.coliseum/config.json is read as a fallback and migrated on save.
With no options it runs the interactive wizard.

Options:
  --show            print the current config
  --theme ID        warm_studio, modern_glass, executive, industrial, minimal, penthouse
  --auth METHOD     claude-login or api-key
  --key KEY         API key (with --auth api-key)
  --hq-mode ID      coliseum_office, coliseum, coliseum_nether, coliseum_ice
  -h, --help        show this help

Env: COLISEUM_HOME (config dir override), APPDATA, XDG_CONFIG_HOME, HOME / USERPROFILE
Examples:
  node tools/setup.mjs --theme executive
  node tools/setup.mjs --auth claude-login`;
handleHelp(USAGE);



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

const HQ_MODES = [
  { id: 'coliseum_office', name: 'Office', desc: 'Warm studio office — the team works at desks (default)' },
  { id: 'coliseum', name: 'Coliseum', desc: 'Battle royale arena — 100 agents debate simultaneously' },
  { id: 'coliseum_nether', name: 'Nether Coliseum', desc: 'Coliseum arena in a hellish Nether palette' },
  { id: 'coliseum_ice', name: 'Ice Coliseum', desc: 'Coliseum arena in a frozen ice palette' },
];

// Legacy id for the office mode, mapped to coliseum_office on load.
const LEGACY_OFFICE_MODE = 'openclaw';

function loadConfig() {
  const cfg = readConfigFile();
  if (cfg) {
    if (cfg.hqMode === LEGACY_OFFICE_MODE) cfg.hqMode = 'coliseum_office';
    return cfg;
  } else {
    return { theme: 'warm_studio', auth: 'claude-login', apiKey: '', repos: [], hqMode: 'coliseum_office' };
  }
}

function saveConfig(cfg) {
  const p = writeConfigFile(cfg);
  console.log(`\nConfig saved to ${p}`);
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const cfg = loadConfig();

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     Coliseum — Setup          ║');
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

  // HQ Mode
  console.log('\nHQ Mode:');
  HQ_MODES.forEach((m, i) => console.log(`  ${i + 1}) ${m.name} — ${m.desc}`));
  const modeChoice = await ask(rl, `\nChoose mode [1-${HQ_MODES.length}] (current: ${cfg.hqMode || 'coliseum_office'}): `);
  const modeIdx = parseInt(modeChoice) - 1;
  if (modeIdx >= 0 && modeIdx < HQ_MODES.length) cfg.hqMode = HQ_MODES[modeIdx].id;

  // Repos
  console.log(`\nRegistered repos: ${cfg.repos.length ? cfg.repos.join(', ') : 'none'}`);
  const addRepo = await ask(rl, 'Add a repo path (or Enter to skip): ');
  if (addRepo.trim()) {
    if (!cfg.repos.includes(addRepo.trim())) cfg.repos.push(addRepo.trim());
  }

  saveConfig(cfg);
  console.log('\nCurrent config:');
  console.log(JSON.stringify(cfg, null, 2));
  console.log('\nRun: node tools/launch.mjs');

  rl.close();
}

// CLI flags
const args = process.argv.slice(2);
if (args.includes('--show')) {
  console.error(`Config: ${resolveReadPath()}`);
  console.log(JSON.stringify(loadConfig(), null, 2));
} else if (args.includes('--theme')) {
  const cfg = loadConfig();
  cfg.theme = args[args.indexOf('--theme') + 1];
  saveConfig(cfg);
} else if (args.includes('--hq-mode')) {
  const mode = args[args.indexOf('--hq-mode') + 1];
  if (!HQ_MODES.some(m => m.id === mode)) {
    console.error(`Invalid --hq-mode "${mode}". Valid: ${HQ_MODES.map(m => m.id).join(', ')}`);
    process.exit(1);
  }
  const cfg = loadConfig();
  cfg.hqMode = mode;
  saveConfig(cfg);
} else if (args.includes('--auth')) {
  const cfg = loadConfig();
  cfg.auth = args[args.indexOf('--auth') + 1];
  if (args.includes('--key')) cfg.apiKey = args[args.indexOf('--key') + 1];
  saveConfig(cfg);
} else {
  interactive();
}
