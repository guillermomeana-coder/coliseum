'use strict';
// Pure config module (no electron). Same ids/defaults/file shape as tools/setup.mjs.
const fs = require('node:fs');
const path = require('node:path');

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

const LEGACY_OFFICE_MODE = 'openclaw';

function defaults() {
  return { theme: 'warm_studio', auth: 'claude-login', apiKey: '', repos: [], hqMode: 'coliseum_office' };
}

function configPath(home) {
  return path.join(home, '.coliseum', 'config.json');
}

function loadConfig(home) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(home), 'utf8'));
    if (cfg.hqMode === LEGACY_OFFICE_MODE) cfg.hqMode = 'coliseum_office';
    return cfg;
  } catch {
    return defaults();
  }
}

function saveConfig(home, cfg) {
  const file = configPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return file;
}

function validateConfig(cfg) {
  const errors = [];
  const has = (list, id) => list.some(x => x.id === id);
  if (!cfg || typeof cfg !== 'object') return ['config must be an object'];
  if (!has(THEMES, cfg.theme)) errors.push(`unknown theme: ${cfg.theme}`);
  if (!has(AUTH_METHODS, cfg.auth)) errors.push(`unknown auth method: ${cfg.auth}`);
  if (!has(HQ_MODES, cfg.hqMode)) errors.push(`unknown hqMode: ${cfg.hqMode}`);
  if (cfg.auth === 'api-key' && !(typeof cfg.apiKey === 'string' && cfg.apiKey.trim())) {
    errors.push('api-key auth requires an API key');
  }
  const repos = Array.isArray(cfg.repos) ? cfg.repos : [];
  if (!Array.isArray(cfg.repos)) errors.push('repos must be a list');
  for (const r of repos) {
    if (typeof r !== 'string' || !path.isAbsolute(r)) errors.push(`repo path is not absolute: ${r}`);
  }
  return errors;
}

module.exports = { THEMES, AUTH_METHODS, HQ_MODES, defaults, configPath, loadConfig, saveConfig, validateConfig };
