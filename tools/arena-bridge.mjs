#!/usr/bin/env node
/**
 * OpenClaw Arena Bridge — connects the Arena skill to the Coliseum visualization.
 *
 * Manages a battle royale of N agents debating the same topic simultaneously.
 * Each agent gets an arena spot, their arguments are broadcast as speech,
 * and a scoreboard tracks standings. Eliminated agents move to the stands.
 *
 * Usage:
 *   node tools/arena-bridge.mjs start "Best approach for Elevyte SEO" --agents 16
 *   node tools/arena-bridge.mjs start "React vs Svelte for our stack" --agents 8
 *   node tools/arena-bridge.mjs status
 *   node tools/arena-bridge.mjs scoreboard
 *   node tools/arena-bridge.mjs spectate          # live commentary feed
 *   node tools/arena-bridge.mjs eliminate <id>     # manual elimination
 *   node tools/arena-bridge.mjs crown <id>         # declare winner
 */

import WebSocket from 'ws';
import { execSync } from 'node:child_process';

const PORT = parseInt(process.env.AGENTCRAFT_PORT || '7878');
const TIMEOUT = 30000;

/**
 * Arena state — tracks all combatants, their arguments, scores, and status.
 */
class ArenaState {
  constructor(topic, agentCount) {
    this.topic = topic;
    this.startTime = Date.now();
    this.combatants = [];
    this.eliminated = [];
    this.champion = null;
    this.round = 0;

    for (let i = 0; i < agentCount; i++) {
      this.combatants.push({
        id: `gladiator_${i}`,
        spot: i,  // arena_spot_N
        score: 0,
        arguments: [],
        status: 'fighting', // fighting | eliminated | champion
        eliminatedAt: null,
      });
    }
  }

  addArgument(gladiatorId, text, score) {
    const g = this.combatants.find(c => c.id === gladiatorId);
    if (!g || g.status !== 'fighting') return;
    g.arguments.push({ text, score, round: this.round, ts: Date.now() });
    g.score += score;
  }

  eliminate(gladiatorId) {
    const g = this.combatants.find(c => c.id === gladiatorId);
    if (!g || g.status !== 'fighting') return;
    g.status = 'eliminated';
    g.eliminatedAt = Date.now();
    this.eliminated.push(g);
  }

  crown(gladiatorId) {
    const g = this.combatants.find(c => c.id === gladiatorId);
    if (!g) return;
    g.status = 'champion';
    this.champion = g;
  }

  activeFighters() {
    return this.combatants.filter(c => c.status === 'fighting');
  }

  scoreboard() {
    return [...this.combatants]
      .sort((a, b) => b.score - a.score)
      .map((c, i) => ({
        rank: i + 1,
        id: c.id,
        score: c.score,
        status: c.status,
        args: c.arguments.length,
      }));
  }
}

/**
 * Connects to the Foreman WebSocket and sends arena events.
 * Arena events are broadcast as user.message to all agents,
 * and arena state updates are sent as feed items.
 */
class ArenaBridge {
  constructor(ws, state) {
    this.ws = ws;
    this.state = state;
    this.nextId = 1;
  }

  static async connect(port = PORT) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Host: '127.0.0.1' } });
      ws.once('error', reject);
      ws.once('open', () => {
        ws.send(JSON.stringify({ v: 1, type: 'hello', modVersion: '0.1.0', protocol: 1, client: 'arena' }));
        // Wait for snapshot
        ws.once('message', () => resolve(ws));
      });
    });
  }

  send(msg) {
    this.ws.send(JSON.stringify({ v: 1, ...msg }));
  }

  broadcast(text) {
    this.send({ type: 'user.message', to: 'all', text, id: `arena-${this.nextId++}` });
  }

  /** Send full arena state to Foreman (rendered on scoreboard). */
  sendState(state) {
    this.send({
      type: 'arena.state',
      topic: state.topic,
      round: state.round,
      combatants: state.combatants.map(c => ({
        id: c.id, spot: c.spot, score: c.score,
        status: c.status, lastArgument: c.arguments.at(-1)?.text
      })),
      champion: state.champion?.id
    });
  }

  /** Send score update for one combatant. */
  sendScore(combatantId, score, argument) {
    this.send({ type: 'arena.score', combatantId, score, argument });
  }

  /** Eliminate a combatant. */
  sendEliminate(combatantId, reason) {
    this.send({ type: 'arena.eliminate', combatantId, reason });
  }

  /** Crown the champion. */
  sendCrown(combatantId) {
    this.send({ type: 'arena.crown', combatantId });
  }

  announce(text) {
    const ts = new Date().toLocaleTimeString();
    console.log(`[${ts}] ${text}`);
    this.broadcast(text);
  }

  close() { this.ws.close(); }
}

// === CLI ===
const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'help') {
  console.log(`OpenClaw Arena — Battle Royale Bridge

Commands:
  start "<topic>" [--agents N]    Start a battle royale (default: 16 agents)
  status                          Show arena state
  scoreboard                      Current rankings
  spectate                        Live commentary feed
  eliminate <id>                  Manually eliminate a combatant
  crown <id>                     Declare the champion
  `);
  process.exit(0);
}

switch (cmd) {
  case 'start': {
    const topic = args.filter(a => !a.startsWith('--')).join(' ');
    const agentIdx = args.indexOf('--agents');
    const agentCount = agentIdx >= 0 ? parseInt(args[agentIdx + 1]) : 16;

    if (!topic) {
      console.error('Usage: start "<topic>" [--agents N]');
      process.exit(1);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`  OPENCLAW ARENA — BATTLE ROYALE`);
    console.log(`${'='.repeat(50)}`);
    console.log(`  Topic:    ${topic}`);
    console.log(`  Fighters: ${agentCount}`);
    console.log(`  Format:   All vs All — last one standing wins`);
    console.log(`${'='.repeat(50)}\n`);

    const state = new ArenaState(topic, agentCount);

    console.log(`Arena initialized with ${agentCount} combatants.`);
    console.log(`Spots assigned: arena_spot_0 through arena_spot_${agentCount - 1}`);
    console.log(`\nTo connect to Foreman and broadcast: arena-bridge.mjs spectate`);
    console.log(`\nThis is the arena state manager. The actual AI debate`);
    console.log(`runs through the arena skill which spawns ${agentCount} sub-agents.`);
    console.log(`\nRun in another terminal:`);
    console.log(`  claude -p "arena --quick ${agentCount} ${topic}"`);

    // Save state
    const fs = await import('node:fs');
    fs.writeFileSync('.arena-state.json', JSON.stringify(state, null, 2));
    console.log('\nState saved to .arena-state.json');
    break;
  }

  case 'status': {
    const fs = await import('node:fs');
    try {
      const state = JSON.parse(fs.readFileSync('.arena-state.json', 'utf8'));
      console.log(`Topic: ${state.topic}`);
      console.log(`Fighters: ${state.combatants.filter(c => c.status === 'fighting').length} active`);
      console.log(`Eliminated: ${state.eliminated.length}`);
      console.log(`Champion: ${state.champion ? state.champion.id : 'none yet'}`);
      console.log(`Round: ${state.round}`);
    } catch {
      console.log('No arena running. Start one with: arena-bridge.mjs start "topic"');
    }
    break;
  }

  case 'scoreboard': {
    const fs = await import('node:fs');
    try {
      const state = JSON.parse(fs.readFileSync('.arena-state.json', 'utf8'));
      const board = new ArenaState(state.topic, 0);
      Object.assign(board, state);
      const scores = ArenaState.prototype.scoreboard.call(board);
      console.log(`\n  SCOREBOARD — "${state.topic}"\n`);
      for (const s of scores) {
        const icon = s.status === 'champion' ? '👑' : s.status === 'eliminated' ? '💀' : '⚔';
        console.log(`  ${icon} #${s.rank} ${s.id.padEnd(15)} Score: ${s.score}  Args: ${s.args}  [${s.status}]`);
      }
    } catch {
      console.log('No arena running.');
    }
    break;
  }

  case 'spectate': {
    console.log('Connecting to Foreman for live spectating...\n');
    try {
      const ws = await ArenaBridge.connect();
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        const ts = new Date().toLocaleTimeString();
        if (msg.type === 'agent.say') {
          console.log(`[${ts}] ${msg.agentId}: "${msg.text}"`);
        }
        if (msg.type === 'feed.add') {
          console.log(`[${ts}] ${msg.item.text}`);
        }
      });
      console.log('Spectating... (Ctrl+C to stop)\n');
      await new Promise(() => {});
    } catch (e) {
      console.error(`Connection failed: ${e.message}`);
    }
    break;
  }

  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
