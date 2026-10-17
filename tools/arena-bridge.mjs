#!/usr/bin/env node
/**
 * Coliseum Arena Bridge — connects the Arena skill to the Coliseum visualization.
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
 *
 * Plain in-memory model (JSON-serializable, persisted to `.arena-state.json`
 * by the `start` command). Combatants are `{id, spot, score, arguments,
 * status, eliminatedAt}` with status `fighting | eliminated | champion`.
 */
class ArenaState {
  /**
   * @param {string} topic Debate topic.
   * @param {number} agentCount Number of combatants (`gladiator_0`…`gladiator_N-1`), one arena spot each.
   */
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

  /**
   * Record an argument and add its score to a fighting combatant.
   * Silently ignored if the combatant is unknown or no longer fighting.
   * @param {string} gladiatorId Combatant id.
   * @param {string} text Argument text.
   * @param {number} score Points awarded for this argument.
   * @returns {void}
   */
  addArgument(gladiatorId, text, score) {
    const g = this.combatants.find(c => c.id === gladiatorId);
    if (!g || g.status !== 'fighting') return;
    g.arguments.push({ text, score, round: this.round, ts: Date.now() });
    g.score += score;
  }

  /**
   * Mark a fighting combatant as eliminated and move it to `eliminated`.
   * Silently ignored if the combatant is unknown or not fighting.
   * @param {string} gladiatorId Combatant id.
   * @returns {void}
   */
  eliminate(gladiatorId) {
    const g = this.combatants.find(c => c.id === gladiatorId);
    if (!g || g.status !== 'fighting') return;
    g.status = 'eliminated';
    g.eliminatedAt = Date.now();
    this.eliminated.push(g);
  }

  /**
   * Declare a combatant the champion. Ignored if the id is unknown.
   * @param {string} gladiatorId Combatant id.
   * @returns {void}
   */
  crown(gladiatorId) {
    const g = this.combatants.find(c => c.id === gladiatorId);
    if (!g) return;
    g.status = 'champion';
    this.champion = g;
  }

  /**
   * List combatants still fighting.
   * @returns {Array<object>} Combatants whose status is `'fighting'`.
   */
  activeFighters() {
    return this.combatants.filter(c => c.status === 'fighting');
  }

  /**
   * Build the rankings, highest score first (does not mutate state).
   * @returns {Array<{rank: number, id: string, score: number, status: string, args: number}>} One row per combatant.
   */
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
  /**
   * @param {import('ws').WebSocket} ws Open socket to the Foreman (from `ArenaBridge.connect`).
   * @param {ArenaState} state Arena state the bridge reports on.
   */
  constructor(ws, state) {
    this.ws = ws;
    this.state = state;
    this.nextId = 1;
  }

  /**
   * Open a socket to the local Foreman, send the `hello` handshake and wait for the first message (the snapshot).
   * Note: resolves with the raw socket, not an ArenaBridge instance; wrap it with `new ArenaBridge(ws, state)`.
   * @param {number} [port=PORT] Foreman WebSocket port on 127.0.0.1.
   * @returns {Promise<import('ws').WebSocket>} The connected socket.
   * @throws {Error} Rejects on socket error (e.g. ECONNREFUSED when the Foreman is not running).
   */
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

  /**
   * Serialize a message with the protocol version and write it to the socket.
   * @param {object} msg Message body; `type` is required.
   * @returns {void}
   */
  send(msg) {
    this.ws.send(JSON.stringify({ v: 1, ...msg }));
  }

  /**
   * Send a `user.message` addressed to all agents.
   * @param {string} text Message body.
   * @returns {void}
   */
  broadcast(text) {
    this.send({ type: 'user.message', to: 'all', text, id: `arena-${this.nextId++}` });
  }

  /**
   * Send full arena state to Foreman (rendered on scoreboard).
   * @param {ArenaState} state State to publish (topic, round, combatants, champion).
   * @returns {void}
   */
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

  /**
   * Send score update for one combatant.
   * @param {string} combatantId Combatant id.
   * @param {number} score Points awarded.
   * @param {string} argument The argument text that earned them.
   * @returns {void}
   */
  sendScore(combatantId, score, argument) {
    this.send({ type: 'arena.score', combatantId, score, argument });
  }

  /**
   * Eliminate a combatant.
   * @param {string} combatantId Combatant id.
   * @param {string} reason Human-readable reason shown in the arena.
   * @returns {void}
   */
  sendEliminate(combatantId, reason) {
    this.send({ type: 'arena.eliminate', combatantId, reason });
  }

  /**
   * Crown the champion.
   * @param {string} combatantId Winning combatant id.
   * @returns {void}
   */
  sendCrown(combatantId) {
    this.send({ type: 'arena.crown', combatantId });
  }

  /**
   * Log a timestamped line locally and broadcast it to all agents.
   * @param {string} text Announcement text.
   * @returns {void}
   */
  announce(text) {
    const ts = new Date().toLocaleTimeString();
    console.log(`[${ts}] ${text}`);
    this.broadcast(text);
  }

  /**
   * Close the underlying socket.
   * @returns {void}
   */
  close() { this.ws.close(); }
}

// === CLI ===
/**
 * CLI entry point. Top-level code parses `process.argv`:
 * `cmd` is the subcommand, `args` its remaining arguments. With no command
 * (or `help`) it prints usage and exits 0. Otherwise it dispatches in the
 * `switch` below; each `case` is one command handler. Unknown commands exit 1.
 *
 * @type {[string|undefined, ...string[]]}
 */
const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'help') {
  console.log(`Coliseum Arena — Battle Royale Bridge

Commands:
  start "<topic>" [--agents N]    Start a battle royale (default: 16 agents)
  simulate ["topic"]              Run a fake battle royale for visual testing (no AI needed)
  status                          Show arena state
  scoreboard                      Current rankings
  spectate                        Live commentary feed
  eliminate <id>                  Manually eliminate a combatant
  crown <id>                     Declare the champion
  `);
  process.exit(0);
}

switch (cmd) {
  /**
   * `start`: initialize an arena and save it to `.arena-state.json` in the cwd.
   * args: `<topic...> [--agents N]` (default 16). Exits 1 if no topic.
   * Does not connect to the Foreman.
   * @throws {Error} If the state file cannot be written.
   */
  case 'start': {
    const topic = args.filter(a => !a.startsWith('--')).join(' ');
    const agentIdx = args.indexOf('--agents');
    const agentCount = agentIdx >= 0 ? parseInt(args[agentIdx + 1]) : 16;

    if (!topic) {
      console.error('Usage: start "<topic>" [--agents N]');
      process.exit(1);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`  COLISEUM ARENA — BATTLE ROYALE`);
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

  /** `status`: summarize `.arena-state.json`; prints a hint if it is missing or unreadable. No args. */
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

  /** `scoreboard`: print rankings from `.arena-state.json`; prints a notice if it is missing or unreadable. No args. */
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

  /**
   * `spectate`: connect to the Foreman and print `agent.say` / `feed.add` events until interrupted.
   * Connection errors are caught and reported; no args.
   */
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

  /**
   * `simulate`: run a fake 16-fighter battle royale, one round every 3 s, eliminating the
   * lowest scorer each round and crowning the last survivor. Connects to the Foreman if
   * available, otherwise runs CLI-only. args: `["topic"]`.
   */
  case 'simulate': {
    // Simulated battle royale for visual testing — no real AI, just fake scores/eliminations
    const topic = args.filter(a => !a.startsWith('--')).join(' ') || 'Simulated Arena Test';
    const count = 16;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`  SIMULATED BATTLE ROYALE`);
    console.log(`${'='.repeat(50)}`);
    console.log(`  Topic: ${topic}`);
    console.log(`  Fighters: ${count} (simulated)\n`);

    const state = new ArenaState(topic, count);

    let ws;
    try {
      ws = await ArenaBridge.connect();
    } catch {
      console.log('Foreman not running — simulating in CLI only.\n');
    }

    const bridge = ws ? new ArenaBridge(ws, state) : null;

    // Simulate rounds
    const names = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
                   'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa'];
    state.combatants.forEach((c, i) => { c.id = names[i] || c.id; });

    const arguments_pool = [
      'Performance is critical — we should optimize first',
      'Developer experience matters more than raw speed',
      'Type safety prevents bugs at scale',
      'Simplicity wins — less code, fewer bugs',
      'Testing coverage is the real metric',
      'User experience trumps everything',
      'Ship fast, iterate later',
      'Architecture decisions are permanent — think carefully',
      'Data-driven decisions only',
      'Community ecosystem matters for long-term',
    ];

    if (bridge) bridge.sendState(state);

    let round = 0;
    const interval = setInterval(() => {
      round++;
      state.round = round;
      const active = state.activeFighters();

      if (active.length <= 1) {
        // Crown winner
        if (active.length === 1) {
          state.crown(active[0].id);
          const ts = new Date().toLocaleTimeString();
          console.log(`\n[${ts}] CHAMPION: ${active[0].id} with score ${active[0].score}!`);
          if (bridge) {
            bridge.sendCrown(active[0].id);
            bridge.announce(`CHAMPION: ${active[0].id} wins with score ${active[0].score}!`);
          }
        }
        clearInterval(interval);

        // Print final scoreboard
        console.log(`\n  FINAL SCOREBOARD\n`);
        const scores = state.scoreboard();
        for (const s of scores) {
          const icon = s.status === 'champion' ? 'WINNER' : s.status === 'eliminated' ? 'OUT' : '???';
          console.log(`  #${String(s.rank).padStart(2)} ${s.id.padEnd(12)} Score: ${String(s.score).padStart(4)}  [${icon}]`);
        }

        if (bridge) bridge.close();
        return;
      }

      const ts = new Date().toLocaleTimeString();
      console.log(`[${ts}] --- Round ${round} (${active.length} fighters) ---`);

      // Each active fighter gets a random score
      for (const c of active) {
        const score = Math.floor(Math.random() * 30) + 1;
        const arg = arguments_pool[Math.floor(Math.random() * arguments_pool.length)];
        state.addArgument(c.id, arg, score);
        if (bridge) bridge.sendScore(c.id, score, arg);
      }

      // Eliminate the lowest scorer this round
      const sorted = [...active].sort((a, b) => a.score - b.score);
      const loser = sorted[0];
      state.eliminate(loser.id);
      console.log(`[${ts}] ELIMINATED: ${loser.id} (score: ${loser.score})`);
      if (bridge) {
        bridge.sendEliminate(loser.id, `Lowest score in round ${round}`);
        bridge.sendState(state);
      }

    }, 3000); // 3 seconds per round

    await new Promise(() => {}); // keep alive
    break;
  }

  /** Any other command: print an error and exit 1. */
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
