#!/usr/bin/env node
/**
 * OpenClaw Bridge — Claude Code ↔ AgentCraft Foreman
 *
 * Lets Claude Code send goals, monitor progress, answer decisions,
 * and get diffs from AgentCraft workers without opening Minecraft.
 *
 * Usage:
 *   node openclaw-bridge.mjs status                        # show team state
 *   node openclaw-bridge.mjs goal "Fix SEO on homepage"    # submit a goal
 *   node openclaw-bridge.mjs tasks                         # list all tasks
 *   node openclaw-bridge.mjs tasks <goalId>                # list tasks for a goal
 *   node openclaw-bridge.mjs decide <decisionId> <option>  # answer a decision
 *   node openclaw-bridge.mjs merge <decisionId>            # shorthand: approve merge
 *   node openclaw-bridge.mjs diff <worktree>               # get diff for a worktree
 *   node openclaw-bridge.mjs msg <agentId> "message"       # message an agent
 *   node openclaw-bridge.mjs watch                         # live feed of all events
 *   node openclaw-bridge.mjs agents                        # list agents and their state
 */

import WebSocket from 'ws';

const PORT = parseInt(process.env.AGENTCRAFT_PORT || '7878');
const TIMEOUT = 15000;

class ForemanBridge {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.state = { foreman: null, agents: [], tasks: [], decisions: [], goals: [], repos: [], feed: [] };
    ws.on('message', (raw) => this._onMsg(JSON.parse(raw)));
  }

  static async connect(port = PORT) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Host: '127.0.0.1' } });
      ws.once('error', reject);
      ws.once('open', () => {
        const bridge = new ForemanBridge(ws);
        bridge._waitSnapshot().then(() => resolve(bridge)).catch(reject);
      });
    });
  }

  _waitSnapshot() {
    return new Promise((resolve) => {
      this._snapshotResolve = resolve;
      this._send({ type: 'hello', modVersion: '0.1.0', protocol: 1, client: 'openclaw' });
    });
  }

  _send(msg) { this.ws.send(JSON.stringify({ v: 1, ...msg })); }

  _onMsg(msg) {
    if (msg.type === 'snapshot') {
      this.state.foreman = msg.foreman;
      this.state.agents = msg.agents || [];
      this.state.tasks = msg.tasks || [];
      this.state.decisions = msg.decisions || [];
      this.state.goals = msg.goals || [];
      this.state.repos = msg.repos || [];
      this.state.feed = msg.feed || [];
      if (this._snapshotResolve) { this._snapshotResolve(); this._snapshotResolve = null; }
    }
    if (msg.type === 'ack' && msg.re) {
      const p = this.pending.get(msg.re);
      if (p) { this.pending.delete(msg.re); clearTimeout(p.timer); msg.ok ? p.resolve(msg.result) : p.reject(msg.error); }
    }
    // Update state incrementally
    if (msg.type === 'task.upsert') this._upsert('tasks', msg.task);
    if (msg.type === 'goal.upsert') this._upsert('goals', msg.goal);
    if (msg.type === 'decision.upsert') this._upsert('decisions', msg.decision);
    if (msg.type === 'agent.upsert') this._upsert('agents', msg.agent);
    if (msg.type === 'repo.upsert') this._upsert('repos', msg.repo);
    if (msg.type === 'feed.add') this.state.feed.push(msg.item);
    // Watch mode handler
    if (this._watchHandler) this._watchHandler(msg);
    // Diff response
    if (msg.type === 'diff' && this._diffResolve) { this._diffResolve(msg); this._diffResolve = null; }
  }

  _upsert(key, obj) {
    const idx = this.state[key].findIndex(x => x.id === obj.id);
    if (idx >= 0) this.state[key][idx] = obj; else this.state[key].push(obj);
  }

  async _rpc(msg) {
    const id = `oc-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout')); }, TIMEOUT);
      this.pending.set(id, { resolve, reject, timer });
      this._send({ ...msg, id });
    });
  }

  // === PUBLIC API ===

  async submitGoal(text, repoId) {
    const r = await this._rpc({ type: 'goal.submit', text, ...(repoId ? { repoId } : {}) });
    return r?.goalId || r;
  }

  async answerDecision(decisionId, option, text) {
    return this._rpc({ type: 'decision.answer', decisionId, option, ...(text ? { text } : {}) });
  }

  async messageAgent(to, text) {
    this._send({ type: 'user.message', to, text });
  }

  async requestDiff(repoId, worktree) {
    return new Promise((resolve) => {
      this._diffResolve = resolve;
      this._send({ type: 'diff.request', requestId: `d-${this.nextId++}`, repoId, worktree });
      setTimeout(() => { if (this._diffResolve) { this._diffResolve(null); this._diffResolve = null; } }, TIMEOUT);
    });
  }

  async addRepo(path) {
    return this._rpc({ type: 'repo.add', path });
  }

  close() { this.ws.close(); }
}

// === CLI ===
const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'help') {
  console.log(`OpenClaw Bridge — Claude Code ↔ AgentCraft

Commands:
  status                        Team state overview
  agents                        List agents and what they're doing
  goal "<text>"                 Submit a goal to the lead
  tasks [goalId]                List tasks
  decisions                     List open decisions
  decide <id> <option> [text]   Answer a decision
  merge <id>                    Approve a merge decision
  diff <worktree>               Get diff for a worktree
  msg <agent|all> "<text>"      Message an agent
  repo-add <path>               Register a new repo
  watch                         Live event stream
  autopilot                     Auto-approve all permissions + merges (full autonomy)
  autopilot --no-merge          Auto-approve permissions only, pause on merges for review
  run "<goal>" [--autopilot]    Submit goal + watch + auto-approve in one command
  `);
  process.exit(0);
}

try {
  const fm = await ForemanBridge.connect();

  switch (cmd) {
    case 'status': {
      const f = fm.state.foreman;
      const onShift = fm.state.agents.filter(a => a.active).length;
      const openD = fm.state.decisions.filter(d => d.status === 'open').length;
      const activeGoal = fm.state.goals.find(g => g.status === 'active' || g.status === 'planning');
      console.log(`=== OpenClaw × AgentCraft ===`);
      console.log(`Backend: ${f.backend} | Auth: ${f.auth} | Cost: $${(f.costUsd || 0).toFixed(2)}`);
      console.log(`Agents: ${onShift}/${fm.state.agents.length} on shift`);
      console.log(`Tasks: ${fm.state.tasks.length} | Open decisions: ${openD}`);
      console.log(`Repos: ${fm.state.repos.map(r => r.name).join(', ') || 'none'}`);
      if (activeGoal) console.log(`Goal: "${activeGoal.text}" (${activeGoal.status}, ${Math.round((activeGoal.progress || 0) * 100)}%)`);
      break;
    }
    case 'agents': {
      for (const a of fm.state.agents) {
        const status = a.active ? a.state : 'off-shift';
        const task = a.taskId ? ` [${a.taskId}]` : '';
        console.log(`  ${a.active ? '●' : '○'} ${a.name} (${a.role}) — ${status}${task}${a.activity ? ': ' + a.activity : ''}`);
      }
      break;
    }
    case 'goal': {
      const text = args.join(' ');
      if (!text) { console.error('Usage: goal "<text>"'); process.exit(1); }
      const goalId = await fm.submitGoal(text);
      console.log(`Goal submitted: ${goalId}`);
      console.log('Marlow is planning...');
      break;
    }
    case 'tasks': {
      const goalFilter = args[0];
      let tasks = fm.state.tasks;
      if (goalFilter) tasks = tasks.filter(t => t.goalId === goalFilter);
      if (!tasks.length) { console.log('No tasks.'); break; }
      for (const t of tasks) {
        console.log(`  [${t.status.padEnd(9)}] ${t.id}: ${t.title}${t.assignee ? ' → ' + t.assignee : ''}`);
      }
      break;
    }
    case 'decisions': {
      const open = fm.state.decisions.filter(d => d.status === 'open');
      if (!open.length) { console.log('No open decisions.'); break; }
      for (const d of open) {
        console.log(`  ${d.id} (${d.kind}) — ${d.question}`);
        console.log(`    Options: ${d.options.join(' | ')}`);
      }
      break;
    }
    case 'decide': {
      const [dId, ...rest] = args;
      const option = rest[0];
      const text = rest.slice(1).join(' ') || undefined;
      await fm.answerDecision(dId, option, text);
      console.log(`Answered ${dId}: ${option}`);
      break;
    }
    case 'merge': {
      await fm.answerDecision(args[0], 'Merge');
      console.log(`Merged ${args[0]}`);
      break;
    }
    case 'diff': {
      const repo = fm.state.repos[0]?.id;
      const wt = args[0];
      const d = await fm.requestDiff(repo, wt);
      if (!d) { console.log('No diff or timeout.'); break; }
      console.log(`${d.base}..${d.branch} — ${d.stats?.files || 0} files, +${d.stats?.additions || 0} -${d.stats?.deletions || 0}`);
      for (const f of d.files || []) {
        console.log(`\n--- ${f.path} (${f.status}) ---`);
        for (const h of f.hunks || []) {
          console.log(h.header);
          for (const l of h.lines || []) {
            const prefix = l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ';
            console.log(`${prefix} ${l.text}`);
          }
        }
      }
      break;
    }
    case 'msg': {
      const [to, ...msgParts] = args;
      await fm.messageAgent(to, msgParts.join(' '));
      console.log(`Message sent to ${to}`);
      break;
    }
    case 'repo-add': {
      const r = await fm.addRepo(args[0]);
      console.log(`Repo added: ${JSON.stringify(r)}`);
      break;
    }
    case 'watch': {
      console.log('Watching events (Ctrl+C to stop)...\n');
      fm._watchHandler = (msg) => {
        const ts = new Date().toLocaleTimeString();
        if (msg.type === 'feed.add') console.log(`[${ts}] ${msg.item.kind}: ${msg.item.text}`);
        else if (msg.type === 'agent.say') console.log(`[${ts}] ${msg.agentId}: "${msg.text}"`);
        else if (msg.type === 'task.upsert') console.log(`[${ts}] task ${msg.task.id}: ${msg.task.status} — ${msg.task.title}`);
        else if (msg.type === 'goal.upsert') console.log(`[${ts}] goal ${msg.goal.id}: ${msg.goal.status} (${Math.round((msg.goal.progress||0)*100)}%)`);
        else if (msg.type === 'decision.upsert' && msg.decision.status === 'open') console.log(`[${ts}] ⚡ DECISION ${msg.decision.id}: ${msg.decision.question}\n         Options: ${msg.decision.options.join(' | ')}`);
        else if (msg.type !== 'snapshot' && msg.type !== 'ack') console.log(`[${ts}] ${msg.type}`);
      };
      await new Promise(() => {}); // hang forever
      break;
    }
    case 'autopilot': {
      const autoMerge = !args.includes('--no-merge');
      console.log(`Autopilot ON${autoMerge ? ' (full: permissions + merges)' : ' (permissions only, merges need review)'}`);
      console.log('Ctrl+C to stop.\n');
      let approved = 0;
      fm._watchHandler = (msg) => {
        const ts = new Date().toLocaleTimeString();
        // Auto-answer open decisions
        if (msg.type === 'decision.upsert' && msg.decision.status === 'open') {
          const d = msg.decision;
          if (d.kind === 'permission') {
            fm.answerDecision(d.id, 'Always allow for this agent').then(() => {
              approved++;
              console.log(`[${ts}] ✓ Auto-approved permission ${d.id} for ${d.agentId || 'agent'}: ${(d.question || '').slice(0, 80)}`);
            }).catch(() => {});
          } else if (d.kind === 'merge' && autoMerge) {
            fm.answerDecision(d.id, 'Merge').then(() => {
              approved++;
              console.log(`[${ts}] ✓ Auto-merged ${d.id}: ${(d.question || '').slice(0, 80)}`);
            }).catch(() => {});
          } else if (d.kind === 'merge' && !autoMerge) {
            console.log(`[${ts}] ⏸ MERGE WAITING: ${d.id} — ${d.question}`);
            console.log(`         Run: node tools/openclaw-bridge.mjs merge ${d.id}`);
          } else if (d.kind === 'question') {
            console.log(`[${ts}] ❓ QUESTION ${d.id} from ${d.agentId}: ${d.question}`);
            console.log(`         Options: ${(d.options || []).join(' | ')}`);
          }
        }
        // Show progress
        if (msg.type === 'goal.upsert') {
          const g = msg.goal;
          console.log(`[${ts}] Goal ${g.id}: ${g.status} (${Math.round((g.progress || 0) * 100)}%)${g.status === 'done' ? ' ✅ COMPLETE' : ''}`);
        }
        if (msg.type === 'task.upsert') {
          const t = msg.task;
          if (t.status === 'done') console.log(`[${ts}] ✅ ${t.id} done: ${t.title}`);
          else if (t.status === 'doing') console.log(`[${ts}] ⚙ ${t.id} started: ${t.title} → ${t.assignee}`);
        }
        if (msg.type === 'feed.add') console.log(`[${ts}] ${msg.item.text}`);
      };
      // Also process any currently open decisions
      for (const d of fm.state.decisions.filter(x => x.status === 'open')) {
        if (d.kind === 'permission') {
          fm.answerDecision(d.id, 'Always allow for this agent').catch(() => {});
          console.log(`✓ Cleared pending permission ${d.id}`);
          approved++;
        } else if (d.kind === 'merge' && autoMerge) {
          fm.answerDecision(d.id, 'Merge').catch(() => {});
          console.log(`✓ Cleared pending merge ${d.id}`);
          approved++;
        }
      }
      if (approved > 0) console.log(`Cleared ${approved} pending decisions.\n`);
      await new Promise(() => {});
      break;
    }
    case 'run': {
      const goalText = args.filter(a => !a.startsWith('--')).join(' ');
      const auto = args.includes('--autopilot') || args.includes('-a');
      if (!goalText) { console.error('Usage: run "<goal text>" [--autopilot]'); process.exit(1); }

      const goalId = await fm.submitGoal(goalText);
      console.log(`Goal submitted: ${goalId}`);
      console.log(`Mode: ${auto ? 'autopilot (full autonomy)' : 'watch (manual decisions)'}\n`);

      fm._watchHandler = (msg) => {
        const ts = new Date().toLocaleTimeString();
        // Auto-approve if autopilot
        if (auto && msg.type === 'decision.upsert' && msg.decision.status === 'open') {
          const d = msg.decision;
          if (d.kind === 'permission') {
            fm.answerDecision(d.id, 'Always allow for this agent').catch(() => {});
            console.log(`[${ts}] ✓ ${d.id} auto-approved`);
          } else if (d.kind === 'merge') {
            fm.answerDecision(d.id, 'Merge').catch(() => {});
            console.log(`[${ts}] ✓ ${d.id} auto-merged`);
          }
        } else if (!auto && msg.type === 'decision.upsert' && msg.decision.status === 'open') {
          console.log(`[${ts}] ⚡ DECISION ${msg.decision.id}: ${msg.decision.question}`);
        }
        // Progress
        if (msg.type === 'goal.upsert' && msg.goal.id === goalId) {
          const g = msg.goal;
          console.log(`[${ts}] Progress: ${Math.round((g.progress || 0) * 100)}% — ${g.status}`);
          if (g.status === 'done') {
            console.log(`\n✅ Goal complete!`);
            fm.close();
            process.exit(0);
          }
        }
        if (msg.type === 'task.upsert' && msg.task.goalId === goalId) {
          const t = msg.task;
          if (t.status === 'done') console.log(`[${ts}] ✅ ${t.id}: ${t.title}`);
          else if (t.status === 'doing') console.log(`[${ts}] ⚙ ${t.id}: ${t.title} → ${t.assignee}`);
        }
      };
      await new Promise(() => {});
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }

  if (cmd !== 'watch') fm.close();
} catch (e) {
  console.error(`Connection failed: ${e.message}\nIs the Foreman running? Launch AgentCraft first.`);
  process.exit(1);
}
