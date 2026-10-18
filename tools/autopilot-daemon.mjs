#!/usr/bin/env node
/**
 * autopilot-daemon.mjs — Run the bridge autopilot as a detached background process
 * that logs to a file instead of consuming Claude's context window.
 *
 * Usage:
 *   node tools/autopilot-daemon.mjs start          # Start autopilot in background
 *   node tools/autopilot-daemon.mjs start --strict  # Strict merge criteria
 *   node tools/autopilot-daemon.mjs stop            # Stop the daemon
 *   node tools/autopilot-daemon.mjs status          # Show if running + tail logs
 *   node tools/autopilot-daemon.mjs logs [N]        # Show last N lines (default 50)
 *   node tools/autopilot-daemon.mjs run "goal"      # Submit goal + start autopilot
 *
 * Logs go to: tools/.autopilot.log
 * PID file:   tools/.autopilot.pid
 */

import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, appendFileSync, openSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = join(__dirname, '.autopilot.pid');
const LOG_FILE = join(__dirname, '.autopilot.log');
const BRIDGE = join(__dirname, 'bridge.mjs');

const cmd = process.argv[2] || 'status';
const args = process.argv.slice(3);

function getPid() {
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim());
    // Check if process is alive
    try { process.kill(pid, 0); return pid; } catch { return null; }
  } catch { return null; }
}

function tailLog(lines = 50) {
  if (!existsSync(LOG_FILE)) { console.log('No logs yet.'); return; }
  try {
    const content = readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n');
    const tail = allLines.slice(-lines).join('\n');
    console.log(tail);
  } catch (e) { console.error('Error reading log:', e.message); }
}

switch (cmd) {
  case 'start': {
    const existing = getPid();
    if (existing) {
      console.log(`Autopilot already running (PID ${existing}). Use 'stop' first.`);
      process.exit(0);
    }

    const bridgeArgs = ['autopilot', ...args];
    console.log(`Starting autopilot: node bridge.mjs ${bridgeArgs.join(' ')}`);
    console.log(`Logs: ${LOG_FILE}`);

    appendFileSync(LOG_FILE, `\n${'='.repeat(60)}\n[${new Date().toISOString()}] Autopilot daemon started\nArgs: ${bridgeArgs.join(' ')}\n${'='.repeat(60)}\n`);
    const logFd = openSync(LOG_FILE, 'a');

    const child = spawn('node', [BRIDGE, ...bridgeArgs], {
      cwd: join(__dirname, '..'),
      stdio: ['ignore', logFd, logFd],
      detached: true,
      windowsHide: true,
    });

    child.unref();
    writeFileSync(PID_FILE, String(child.pid));
    console.log(`Autopilot started (PID ${child.pid}). It will auto-merge decisions.`);
    console.log(`Check: node tools/autopilot-daemon.mjs status`);
    break;
  }

  case 'stop': {
    const pid = getPid();
    if (!pid) {
      console.log('Autopilot not running.');
      try { unlinkSync(PID_FILE); } catch {}
      process.exit(0);
    }
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Autopilot stopped (PID ${pid}).`);
    } catch (e) {
      console.log(`Could not kill PID ${pid}: ${e.message}`);
    }
    try { unlinkSync(PID_FILE); } catch {}
    break;
  }

  case 'status': {
    const pid = getPid();
    if (pid) {
      console.log(`✅ Autopilot RUNNING (PID ${pid})`);
      console.log(`\nLast 20 log lines:`);
      tailLog(20);
    } else {
      console.log('❌ Autopilot NOT running.');
      if (existsSync(LOG_FILE)) {
        console.log('\nLast 10 log lines from previous run:');
        tailLog(10);
      }
    }
    break;
  }

  case 'logs': {
    const n = parseInt(args[0]) || 50;
    tailLog(n);
    break;
  }

  case 'run': {
    const goalText = args.filter(a => !a.startsWith('--')).join(' ');
    if (!goalText) {
      console.error('Usage: autopilot-daemon.mjs run "goal text" [--strict]');
      process.exit(1);
    }

    // Submit goal first
    try {
      const result = execSync(`node "${BRIDGE}" goal "${goalText.replace(/"/g, '\\"')}"`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf8',
        timeout: 30000,
      });
      console.log(result.trim());
    } catch (e) {
      console.error('Failed to submit goal:', e.message);
      process.exit(1);
    }

    // Then start autopilot if not running
    const existing = getPid();
    if (existing) {
      console.log(`Autopilot already running (PID ${existing}) — it will handle the goal.`);
    } else {
      const strict = args.includes('--strict') ? ['--strict'] : [];
      appendFileSync(LOG_FILE, `\n${'='.repeat(60)}\n[${new Date().toISOString()}] Autopilot started for goal: ${goalText}\n${'='.repeat(60)}\n`);
      const runLogFd = openSync(LOG_FILE, 'a');

      const child = spawn('node', [BRIDGE, 'autopilot', ...strict], {
        cwd: join(__dirname, '..'),
        stdio: ['ignore', runLogFd, runLogFd],
        detached: true,
        windowsHide: true,
      });
      child.unref();
      writeFileSync(PID_FILE, String(child.pid));
      console.log(`Autopilot started (PID ${child.pid}) — will auto-merge all decisions.`);
    }
    break;
  }

  default:
    console.error(`Unknown command: ${cmd}`);
    console.error('Commands: start, stop, status, logs [N], run "goal"');
    process.exit(1);
}
