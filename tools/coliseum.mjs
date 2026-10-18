#!/usr/bin/env node
// coliseum: single CLI entry point dispatching to the tools/*.mjs scripts.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

export const COMMANDS = {
  setup: { script: 'setup.mjs', desc: 'Configure theme, auth and HQ mode' },
  launch: { script: 'launch.mjs', desc: 'Launch Minecraft and the Foreman' },
  doctor: { script: 'doctor.mjs', desc: 'Diagnose your install and environment' },
  bridge: { script: 'bridge.mjs', desc: 'Run the agent <-> Minecraft bridge' },
  arena: { script: 'arena-bridge.mjs', desc: 'Run the arena bridge' },
};

export function helpText() {
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  const lines = Object.entries(COMMANDS).map(([k, v]) => `  ${k.padEnd(width)}  ${v.desc}`);
  return `Usage: coliseum <command> [args...]

Commands:
${lines.join('\n')}

Run "coliseum <command> --help" for command-specific help.

Examples:
  coliseum setup --show
  coliseum launch
  coliseum doctor --help
  coliseum bridge --help`;
}

export function isHelpArg(a) {
  return a === undefined || a === 'help' || a === '-h' || a === '--help';
}

// Returns { kind: 'help' } | { kind: 'unknown', name } | { kind: 'run', name, script, args }
export function resolveCommand(argv) {
  const [name, ...args] = argv;
  if (isHelpArg(name)) return { kind: 'help' };
  if (!Object.hasOwn(COMMANDS, name)) return { kind: 'unknown', name };
  return { kind: 'run', name, script: path.join(HERE, COMMANDS[name].script), args };
}

function run(script, args) {
  const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { try { child.kill(sig); } catch { /* already gone */ } });
  }
  child.on('error', (e) => { console.error(`coliseum: failed to start ${script}: ${e.message}`); process.exit(1); });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

if (isMain) {
  const r = resolveCommand(process.argv.slice(2));
  if (r.kind === 'help') { console.log(helpText()); process.exit(0); }
  if (r.kind === 'unknown') { console.error(`Unknown command: ${r.name}\n\n${helpText()}`); process.exit(1); }
  run(r.script, r.args);
}
