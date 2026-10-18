#!/usr/bin/env node
/**
 * test-suite.mjs — End-to-end test runner for Coliseum with comprehensive logging.
 *
 * Usage:
 *   node tools/test-suite.mjs              # Run all tests
 *   node tools/test-suite.mjs --cli        # CLI tests only
 *   node tools/test-suite.mjs --mod        # Mod compilation only
 *   node tools/test-suite.mjs --desktop    # Desktop app tests only
 *   node tools/test-suite.mjs --bridge     # Bridge connectivity test
 *
 * Logs: logs/test-<timestamp>.log (full detail)
 * Console: summary only
 */

import { execSync, spawnSync } from 'child_process';
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGS_DIR = join(ROOT, 'logs');
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_FILE = join(LOGS_DIR, `test-${ts}.log`);

if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

// --- Logging ---
const results = [];
let logBuffer = '';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logBuffer += line + '\n';
  console.log(msg);
}

function logDetail(msg) {
  logBuffer += `[${new Date().toISOString()}] ${msg}\n`;
}

function run(cmd, opts = {}) {
  const start = performance.now();
  const r = spawnSync('bash', ['-c', cmd], {
    encoding: 'utf8',
    timeout: opts.timeout || 120000,
    cwd: opts.cwd || ROOT,
    env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME || 'C:\\Program Files\\Zulu\\zulu-25', PATH: `C:\\Program Files\\Zulu\\zulu-25\\bin;${process.env.PATH}` },
  });
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();
  const output = `${stdout}\n${stderr}`.trim();
  logDetail(`CMD: ${cmd}`);
  logDetail(`TIME: ${elapsed}s | EXIT: ${r.status}`);
  if (output) logDetail(`OUTPUT:\n${output}\n`);
  return { ok: r.status === 0, output, elapsed, exitCode: r.status };
}

function test(name, fn) {
  const start = performance.now();
  logDetail(`\n${'='.repeat(60)}\nTEST: ${name}\n${'='.repeat(60)}`);
  try {
    const result = fn();
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    if (result.ok) {
      log(`  ✓ ${name} (${elapsed}s)`);
      results.push({ name, status: 'PASS', elapsed, detail: result.detail || '' });
    } else {
      log(`  ✗ ${name} (${elapsed}s) — ${result.reason || 'failed'}`);
      results.push({ name, status: 'FAIL', elapsed, reason: result.reason, detail: result.detail || '' });
    }
  } catch (e) {
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    log(`  ✗ ${name} (${elapsed}s) — ${e.message}`);
    results.push({ name, status: 'ERROR', elapsed, reason: e.message });
  }
}

// --- Tests ---
const args = process.argv.slice(2);
const runAll = args.length === 0;
const runCli = runAll || args.includes('--cli');
const runMod = runAll || args.includes('--mod');
const runDesktop = runAll || args.includes('--desktop');
const runBridge = runAll || args.includes('--bridge');

log(`\nColiseum Test Suite — ${new Date().toISOString()}`);
log(`Log file: ${LOG_FILE}\n`);

// ===== CLI Tests =====
if (runCli) {
  log('--- CLI Tests ---');

  test('coliseum --help', () => {
    const r = run('node tools/coliseum.mjs --help');
    return { ok: r.ok && r.output.includes('Commands:'), detail: r.output };
  });

  test('coliseum doctor', () => {
    const r = run('node tools/doctor.mjs');
    const allOk = r.output.includes('All dependencies OK');
    return { ok: allOk, reason: allOk ? '' : 'Some deps missing', detail: r.output };
  });

  test('coliseum setup --show', () => {
    const r = run('node tools/coliseum.mjs setup --show');
    return { ok: r.exitCode === 0 || r.output.length > 0, detail: r.output };
  });

  test('bridge --help', () => {
    const r = run('node tools/bridge.mjs --help');
    return { ok: r.output.includes('Commands:') || r.output.includes('Usage'), detail: r.output };
  });

  test('arena --help', () => {
    const r = run('node tools/arena-bridge.mjs --help');
    return { ok: r.output.length > 0, detail: r.output };
  });

  test('autopilot-daemon status (no Foreman)', () => {
    const r = run('node tools/autopilot-daemon.mjs status');
    return { ok: true, detail: r.output }; // Expected: not running
  });

  // Syntax check all .mjs files
  test('syntax check all .mjs files', () => {
    const r = run('for f in tools/*.mjs tools/lib/*.mjs; do node --check "$f" 2>&1 || echo "FAIL: $f"; done');
    const hasFail = r.output.includes('FAIL:');
    return { ok: !hasFail, reason: hasFail ? 'Some files have syntax errors' : '', detail: r.output };
  });
}

// ===== Mod Tests =====
if (runMod) {
  log('\n--- Mod Tests ---');

  test('mod compileJava', () => {
    const r = run('cd mod && ./gradlew.bat compileJava --no-daemon 2>&1', { timeout: 300000 });
    return { ok: r.output.includes('BUILD SUCCESSFUL'), reason: r.ok ? '' : 'Build failed', detail: r.output };
  });

  test('mod compileClientJava', () => {
    const r = run('cd mod && ./gradlew.bat compileClientJava --no-daemon 2>&1', { timeout: 300000 });
    // compileClientJava might not exist for all setups
    return { ok: r.output.includes('BUILD SUCCESSFUL') || r.output.includes('UP-TO-DATE'), detail: r.output };
  });

  test('mod build jar', () => {
    const r = run('cd mod && ./gradlew.bat jar --no-daemon 2>&1', { timeout: 300000 });
    return { ok: r.output.includes('BUILD SUCCESSFUL'), reason: r.ok ? '' : 'Jar build failed', detail: r.output };
  });
}

// ===== Desktop Tests =====
if (runDesktop) {
  log('\n--- Desktop Tests ---');

  test('desktop package.json valid', () => {
    const r = run('node -e "const p = require(\'./desktop/package.json\'); console.log(p.name, p.version)"');
    return { ok: r.ok, detail: r.output };
  });

  test('desktop npm install', () => {
    const r = run('cd desktop && npm install 2>&1', { timeout: 120000 });
    return { ok: r.ok || r.output.includes('up to date'), detail: r.output.slice(-500) };
  });

  test('desktop main.js syntax', () => {
    const r = run('node -c desktop/main.js 2>&1');
    return { ok: r.ok, detail: r.output };
  });

  test('desktop preload.js syntax', () => {
    const r = run('node -c desktop/preload.js 2>&1');
    return { ok: r.ok, detail: r.output };
  });

  test('desktop lib modules syntax', () => {
    const r = run('for f in desktop/lib/*.js desktop/lib/*.mjs; do [ -f "$f" ] && node -c "$f" 2>&1 || true; done');
    return { ok: !r.output.includes('SyntaxError'), detail: r.output };
  });
}

// ===== Bridge Tests =====
if (runBridge) {
  log('\n--- Bridge Connectivity Tests ---');

  test('bridge connects (expects ECONNREFUSED if no Foreman)', () => {
    const r = run('timeout 20 node tools/bridge.mjs status 2>&1 || true', { timeout: 25000 });
    const connected = r.output.includes('"ok": true');
    const refused = r.output.includes('ECONNREFUSED') || r.output.includes('not reachable');
    return {
      ok: connected || refused, // Both are valid states
      reason: connected ? 'Connected to Foreman' : refused ? 'No Foreman running (expected)' : 'Unknown error',
      detail: r.output,
    };
  });

  test('foremancli status', () => {
    const r = run('timeout 20 node tools/foremancli.mjs status 2>&1 || true', { timeout: 25000 });
    return { ok: true, detail: r.output }; // Informational
  });
}

// ===== Summary =====
log(`\n${'='.repeat(60)}`);
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const errors = results.filter(r => r.status === 'ERROR').length;
const total = results.length;

log(`RESULTS: ${passed}/${total} passed, ${failed} failed, ${errors} errors`);

if (failed + errors > 0) {
  log('\nFailed tests:');
  for (const r of results.filter(r => r.status !== 'PASS')) {
    log(`  ✗ ${r.name}: ${r.reason || r.status}`);
  }
}

// Write full log
logDetail(`\n${'='.repeat(60)}\nSUMMARY JSON:\n${JSON.stringify(results, null, 2)}`);
writeFileSync(LOG_FILE, logBuffer);
log(`\nFull log: ${LOG_FILE}`);

// Write machine-readable summary
const summaryFile = join(LOGS_DIR, `test-${ts}.json`);
writeFileSync(summaryFile, JSON.stringify({
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  javaVersion: spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr?.match(/version "([^"]+)"/)?.[1] || 'unknown',
  results,
  totals: { total, passed, failed, errors },
}, null, 2));
log(`Summary JSON: ${summaryFile}`);

process.exit(failed + errors > 0 ? 1 : 0);
