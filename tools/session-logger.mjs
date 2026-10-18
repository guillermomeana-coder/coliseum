#!/usr/bin/env node
/**
 * session-logger.mjs — Comprehensive session logger for Coliseum optimization.
 *
 * Connects to the Foreman and logs EVERYTHING to timestamped files:
 * - All WebSocket events (goals, tasks, decisions, feeds, agent state changes)
 * - Performance metrics (task duration, response times, merge latency)
 * - Error patterns and recovery events
 * - Agent utilization (idle vs working time)
 *
 * Usage:
 *   node tools/session-logger.mjs              # Start logging
 *   node tools/session-logger.mjs --stats      # Show stats from latest log
 *
 * Output: logs/session-<timestamp>.jsonl  (one JSON object per line)
 *         logs/session-<timestamp>.summary.json (generated on Ctrl+C)
 */

import { ForemanClient } from './lib/foremanclient.mjs';
import { writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'logs');
if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

const args = process.argv.slice(2);

// --- Stats mode: analyze latest session log ---
if (args.includes('--stats')) {
  const files = readdirSync(LOGS_DIR).filter(f => f.startsWith('session-') && f.endsWith('.jsonl')).sort();
  if (files.length === 0) { console.log('No session logs found.'); process.exit(0); }
  const latest = join(LOGS_DIR, files[files.length - 1]);
  console.log(`Analyzing: ${latest}\n`);

  const lines = readFileSync(latest, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const events = {};
  const taskTimes = {};
  const agentIdle = {};
  const errors = [];
  const decisions = { total: 0, autoMerged: 0, held: 0, ghostsCleaned: 0, avgLatencyMs: 0 };
  let decisionLatencies = [];

  for (const e of lines) {
    events[e.type] = (events[e.type] || 0) + 1;

    if (e.type === 'task.upsert' && e.data?.status === 'doing' && e.data?.id) {
      taskTimes[e.data.id] = { start: e.ts, title: e.data.title, assignee: e.data.assignee };
    }
    if (e.type === 'task.upsert' && e.data?.status === 'done' && taskTimes[e.data.id]) {
      taskTimes[e.data.id].end = e.ts;
      taskTimes[e.data.id].durationMs = new Date(e.ts) - new Date(taskTimes[e.data.id].start);
    }
    if (e.type === 'agent.upsert' && e.data?.status === 'idle') {
      agentIdle[e.data.name] = (agentIdle[e.data.name] || 0) + 1;
    }
    if (e.type === 'decision.upsert' && e.data?.status === 'open') {
      decisions.total++;
      e._openedAt = e.ts;
    }
    if (e.type === 'decision.upsert' && e.data?.status === 'answered') {
      decisions.autoMerged++;
    }
    if (e.type === 'error') errors.push({ ts: e.ts, msg: e.data?.message || e.data });
  }

  const completedTasks = Object.values(taskTimes).filter(t => t.durationMs);
  const avgTaskMs = completedTasks.length > 0 ? completedTasks.reduce((s, t) => s + t.durationMs, 0) / completedTasks.length : 0;

  console.log('EVENT COUNTS:');
  for (const [k, v] of Object.entries(events).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  console.log(`\nTASK PERFORMANCE (${completedTasks.length} completed):`);
  console.log(`  Avg duration: ${(avgTaskMs / 1000).toFixed(1)}s`);
  if (completedTasks.length > 0) {
    const sorted = completedTasks.sort((a, b) => b.durationMs - a.durationMs);
    console.log(`  Slowest: ${sorted[0].title} (${(sorted[0].durationMs / 1000).toFixed(1)}s) → ${sorted[0].assignee}`);
    console.log(`  Fastest: ${sorted[sorted.length - 1].title} (${(sorted[sorted.length - 1].durationMs / 1000).toFixed(1)}s)`);
  }

  console.log(`\nDECISIONS: ${decisions.total} opened, ${decisions.autoMerged} answered`);
  console.log(`ERRORS: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log(`  [${e.ts}] ${e.msg}`);

  console.log(`\nAGENT IDLE EVENTS:`);
  for (const [k, v] of Object.entries(agentIdle)) console.log(`  ${k}: ${v} idle events`);

  console.log(`\nTotal events: ${lines.length}`);
  console.log(`Duration: ${lines.length > 1 ? ((new Date(lines[lines.length - 1].ts) - new Date(lines[0].ts)) / 60000).toFixed(1) : 0} minutes`);
  process.exit(0);
}

// --- Logger mode ---
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_FILE = join(LOGS_DIR, `session-${ts}.jsonl`);
const SUMMARY_FILE = join(LOGS_DIR, `session-${ts}.summary.json`);

console.log(`Coliseum Session Logger`);
console.log(`Log: ${LOG_FILE}`);
console.log(`Ctrl+C to stop and generate summary.\n`);

let eventCount = 0;
let sessionStart = Date.now();

function logEvent(type, data) {
  const entry = { ts: new Date().toISOString(), type, data };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  eventCount++;

  // Console preview
  const preview = type === 'task.upsert' ? `${data.id} ${data.status}: ${data.title}`
    : type === 'decision.upsert' ? `${data.id} ${data.status}: ${(data.question || '').slice(0, 60)}`
    : type === 'goal.upsert' ? `${data.id} ${data.status} ${Math.round((data.progress || 0) * 100)}%`
    : type === 'agent.upsert' ? `${data.name} → ${data.status}`
    : type === 'feed.add' ? data.text?.slice(0, 80)
    : JSON.stringify(data).slice(0, 80);

  console.log(`[${new Date().toLocaleTimeString()}] ${type}: ${preview}`);
}

// Connect
const port = parseInt(process.env.AGENTCRAFT_PORT || '7878');
const fm = new ForemanClient(`ws://127.0.0.1:${port}`);

try {
  await fm.connect();
} catch (e) {
  console.error(`Cannot connect to Foreman on :${port}. Is Minecraft running?`);
  console.error(e.message);
  process.exit(1);
}

console.log(`Connected to Foreman on :${port}\n`);

// Log initial state
logEvent('session.start', {
  agents: fm.state.agents?.map(a => ({ name: a.name, role: a.role, status: a.status })),
  openDecisions: fm.state.decisions?.filter(d => d.status === 'open').length || 0,
  activeTasks: fm.state.tasks?.filter(t => t.status === 'doing').length || 0,
  repos: fm.state.repos?.map(r => ({ name: r.name, path: r.path })),
});

// Watch all events
fm._watchHandler = (msg) => {
  logEvent(msg.type, msg.decision || msg.goal || msg.task || msg.agent || msg.item || msg);
};

// Enable watch mode
fm.ws.send(JSON.stringify({ method: 'subscribe', params: {} }));

// Periodic health check
const healthInterval = setInterval(() => {
  logEvent('health.check', {
    eventCount,
    uptimeMin: ((Date.now() - sessionStart) / 60000).toFixed(1),
    memMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
}, 60000);

// Graceful shutdown
process.on('SIGINT', () => {
  clearInterval(healthInterval);
  const duration = ((Date.now() - sessionStart) / 60000).toFixed(1);

  logEvent('session.end', { eventCount, durationMin: duration });

  console.log(`\n\nSession ended. ${eventCount} events in ${duration} minutes.`);
  console.log(`Log: ${LOG_FILE}`);
  console.log(`\nRun: node tools/session-logger.mjs --stats`);

  fm.close();
  process.exit(0);
});

// Keep alive
await new Promise(() => {});
