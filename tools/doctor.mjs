#!/usr/bin/env node
/**
 * Coliseum doctor — checks dependencies and prints install instructions for anything missing.
 */
import { handleHelp } from './lib/help.mjs';

const USAGE = `Usage: node tools/doctor.mjs [--json]

Checks Java 25+, Node 22+, git and Minecraft Java Edition, and prints install instructions for
anything missing. Minecraft is optional (headless works without it) and only produces a warning.

Options:
  --json          print results as JSON
  -h, --help      show this help

Exit code: 0 if all required dependencies are present, 1 otherwise.
Examples:
  node tools/doctor.mjs
  node tools/doctor.mjs --json`;
handleHelp(USAGE);

const { runChecks, exitCode, formatReport } = await import('./lib/doctor.mjs');

const results = runChecks();
const code = exitCode(results);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: code === 0, results }, null, 2));
} else {
  console.log('Coliseum doctor\n');
  console.log(formatReport(results));
}
process.exitCode = code;
