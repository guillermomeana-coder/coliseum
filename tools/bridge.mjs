#!/usr/bin/env node
/**
 * Coliseum Bridge — Claude Code ↔ AgentCraft Foreman
 *
 * Lets Claude Code send goals, monitor progress, answer decisions,
 * and get diffs from AgentCraft workers without opening Minecraft.
 *
 * Usage:
 *   node bridge.mjs status                        # show team state
 *   node bridge.mjs goal "Fix SEO on homepage"    # submit a goal
 *   node bridge.mjs goal "Fix SEO" --repo elevyte # submit goal to a specific repo
 *   node bridge.mjs tasks                         # list all tasks
 *   node bridge.mjs tasks <goalId>                # list tasks for a goal
 *   node bridge.mjs decide <decisionId> <option>  # answer a decision
 *   node bridge.mjs merge <decisionId>            # shorthand: approve merge
 *   node bridge.mjs diff <worktree>               # get diff for a worktree
 *   node bridge.mjs msg <agentId> "message"       # message an agent
 *   node bridge.mjs repos                         # list registered repos
 *   node bridge.mjs cost                          # show total API cost
 *   node bridge.mjs watch                         # live feed of all events
 *   node bridge.mjs agents                        # list agents and their state
 */

import WebSocket from 'ws';

const PORT = parseInt(process.env.AGENTCRAFT_PORT || '7878');
const TIMEOUT = 15000;

/**
 * Client for the AgentCraft Foreman WebSocket protocol.
 *
 * Wraps an open socket, mirrors the Foreman's snapshot/upsert stream into
 * `this.state`, and exposes request/response helpers (goals, decisions,
 * diffs, repos, agent messages) for the CLI commands below.
 */
class ForemanBridge {
  /**
   * @param {import('ws').WebSocket} ws Already-open socket to the Foreman.
   */
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.state = { foreman: null, agents: [], tasks: [], decisions: [], goals: [], repos: [], feed: [] };
    ws.on('message', (raw) => this._onMsg(JSON.parse(raw)));
  }

  /**
   * Open a socket to the local Foreman and wait for the initial snapshot.
   * @param {number} [port=PORT] Foreman WebSocket port on 127.0.0.1.
   * @returns {Promise<ForemanBridge>} Bridge with `state` populated from the snapshot.
   * @throws {Error} Rejects on socket error (e.g. ECONNREFUSED when the Foreman is not running).
   */
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

  /**
   * Send the `hello` handshake and resolve once the Foreman replies with a snapshot.
   * @returns {Promise<void>} Resolves when the snapshot message has been processed.
   */
  _waitSnapshot() {
    return new Promise((resolve) => {
      this._snapshotResolve = resolve;
      this._send({ type: 'hello', modVersion: '0.1.0', protocol: 1, client: 'openclaw' });
    });
  }

  /**
   * Serialize a message with the protocol version and write it to the socket.
   * @param {object} msg Message body; `type` is required.
   * @returns {void}
   */
  _send(msg) { this.ws.send(JSON.stringify({ v: 1, ...msg })); }

  /**
   * Handle one parsed Foreman message: apply snapshots and upserts to `state`,
   * settle pending RPC acks, and forward to the watch handler and diff waiter.
   * @param {{type: string, [key: string]: any}} msg Decoded server message.
   * @returns {void}
   */
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

  /**
   * Insert or replace an entity in a state collection, matched by `id`.
   * @param {'tasks'|'goals'|'decisions'|'agents'|'repos'} key Collection name in `state`.
   * @param {{id: string}} obj Entity to store.
   * @returns {void}
   */
  _upsert(key, obj) {
    const idx = this.state[key].findIndex(x => x.id === obj.id);
    if (idx >= 0) this.state[key][idx] = obj; else this.state[key].push(obj);
  }

  /**
   * Send a message with a fresh id and wait for the matching `ack`.
   * @param {object} msg Message body without `id`.
   * @returns {Promise<any>} The ack's `result`.
   * @throws {Error} Rejects with `Error('timeout')` after TIMEOUT ms, or with the ack's `error` when `ok` is false.
   */
  async _rpc(msg) {
    const id = `oc-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout')); }, TIMEOUT);
      this.pending.set(id, { resolve, reject, timer });
      this._send({ ...msg, id });
    });
  }

  // === PUBLIC API ===

  /**
   * Submit a new goal to the Foreman.
   * @param {string} text Goal description.
   * @param {string} [repoId] Target repo id; omitted to use the Foreman default.
   * @returns {Promise<string>} The new goal id (or the raw result if it has no `goalId`).
   * @throws {Error} On RPC timeout or rejected ack.
   */
  async submitGoal(text, repoId) {
    const r = await this._rpc({ type: 'goal.submit', text, ...(repoId ? { repoId } : {}) });
    return r?.goalId || r;
  }

  /**
   * Answer an open decision (permission, merge or question).
   * @param {string} decisionId Id of the decision.
   * @param {string} option One of the decision's options, e.g. `'Merge'`.
   * @param {string} [text] Optional free-text accompanying the answer.
   * @returns {Promise<any>} The ack result.
   * @throws {Error} On RPC timeout or rejected ack.
   */
  async answerDecision(decisionId, option, text) {
    return this._rpc({ type: 'decision.answer', decisionId, option, ...(text ? { text } : {}) });
  }

  /**
   * Send a chat message to an agent (fire-and-forget, no ack awaited).
   * @param {string} to Agent id, or `'all'`.
   * @param {string} text Message body.
   * @returns {Promise<void>}
   */
  async messageAgent(to, text) {
    this._send({ type: 'user.message', to, text });
  }

  /**
   * Request the diff of a worktree against its base branch.
   * Never rejects: a missing response after TIMEOUT ms resolves with `null`.
   * @param {string} repoId Repo id owning the worktree.
   * @param {string} worktree Worktree identifier/path.
   * @returns {Promise<object|null>} The `diff` message, or `null` on timeout.
   */
  async requestDiff(repoId, worktree) {
    return new Promise((resolve) => {
      this._diffResolve = resolve;
      this._send({ type: 'diff.request', requestId: `d-${this.nextId++}`, repoId, worktree });
      setTimeout(() => { if (this._diffResolve) { this._diffResolve(null); this._diffResolve = null; } }, TIMEOUT);
    });
  }

  /**
   * Register a repository with the Foreman.
   * @param {string} path Filesystem path of the repo.
   * @returns {Promise<object>} The ack result describing the new repo.
   * @throws {Error} On RPC timeout or rejected ack.
   */
  async addRepo(path) {
    return this._rpc({ type: 'repo.add', path });
  }

  /**
   * Clean ghost decisions — merge decisions for worktrees already merged/abandoned.
   * These get stuck in the UI and block the review queue.
   * @returns {Promise<number>} Number of ghost decisions rejected.
   */
  async cleanGhostDecisions() {
    let cleaned = 0;
    for (const d of this.state.decisions.filter(x => x.status === 'open' && x.kind === 'merge')) {
      // Check if the worktree's task is already done
      const task = this.state.tasks.find(t => t.id === d.taskId);
      if (task && task.status === 'done') {
        try {
          await this.answerDecision(d.id, 'Reject', 'Ghost decision: task already done');
          cleaned++;
        } catch { /* ignore */ }
      }
    }
    // Also clean any merge decisions where the question says "is merged"
    for (const d of this.state.decisions.filter(x => x.status === 'open')) {
      if ((d.question || '').includes('is merged') || (d.context || '').includes('is merged')) {
        try {
          await this.answerDecision(d.id, 'Reject', 'Ghost: worktree already merged');
          cleaned++;
        } catch { /* ignore */ }
      }
    }
    return cleaned;
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
 * (or `help`) it prints usage and exits 0. Otherwise it connects to the
 * Foreman and dispatches in the `switch` below; each `case` is one command
 * handler. Connection failures print a hint and exit 1.
 *
 * @type {[string|undefined, ...string[]]}
 */
const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h' || args.includes('--help') || args.includes('-h')) {
  console.log(`OpenClaw Bridge — Claude Code ↔ AgentCraft

Usage: node tools/bridge.mjs <command> [args]   (-h, --help, help)
Env: AGENTCRAFT_PORT (default 7878)
Example: node tools/bridge.mjs status

Commands:
  status                        Team state overview (agents, tasks, cost)
  agents                        List agents and what they're doing
  goal "<text>" [--repo <name>] Submit a goal (optionally target a specific repo)
  tasks [goalId]                List tasks
  decisions                     List open decisions
  decide <id> <option> [text]   Answer a decision
  merge <id>                    Approve a merge decision
  diff <worktree>               Get diff for a worktree
  msg <agent|all> "<text>"      Message an agent
  repos                         List all registered repos (id, name, path, branch, dirty)
  cost                          Show total API cost so far
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
    /** `status`: print backend, cost, agents, task/decision counts, repos and active goal. No args. */
    case 'status': {
      const f = fm.state.foreman;
      const onShift = fm.state.agents.filter(a => a.active).length;
      const openD = fm.state.decisions.filter(d => d.status === 'open').length;
      const doneTasks = fm.state.tasks.filter(t => t.status === 'done').length;
      const totalTasks = fm.state.tasks.length;
      const activeGoal = fm.state.goals.find(g => g.status === 'active' || g.status === 'planning');
      console.log(`=== OpenClaw × AgentCraft ===`);
      console.log(`Backend: ${f.backend} | Auth: ${f.auth}`);
      console.log(`Cost: $${(f.costUsd || 0).toFixed(4)}`);
      console.log(`Agents: ${onShift}/${fm.state.agents.length} on shift`);
      for (const a of fm.state.agents) {
        const status = a.active ? a.state : 'off-shift';
        console.log(`  ${a.active ? '●' : '○'} ${a.name} (${a.role}) — ${status}${a.activity ? ': ' + a.activity : ''}`);
      }
      console.log(`Tasks: ${doneTasks}/${totalTasks} done | Open decisions: ${openD}`);
      console.log(`Repos: ${fm.state.repos.map(r => r.name).join(', ') || 'none'}`);
      if (activeGoal) console.log(`Goal: "${activeGoal.text}" (${activeGoal.status}, ${Math.round((activeGoal.progress || 0) * 100)}%)`);
      break;
    }
    /** `agents`: list every agent with on/off-shift state, task id and activity. No args. */
    case 'agents': {
      for (const a of fm.state.agents) {
        const status = a.active ? a.state : 'off-shift';
        const task = a.taskId ? ` [${a.taskId}]` : '';
        console.log(`  ${a.active ? '●' : '○'} ${a.name} (${a.role}) — ${status}${task}${a.activity ? ': ' + a.activity : ''}`);
      }
      break;
    }
    /**
     * `goal`: submit a goal to the Foreman.
     * args: `<text...> [--repo <name|id>]`. Exits 1 on missing text or unknown repo.
     * @throws {Error} From submitGoal on RPC timeout (reported as a connection failure).
     */
    case 'goal': {
      const repoFlagIdx = args.indexOf('--repo');
      let repoId;
      const textParts = [...args];
      if (repoFlagIdx >= 0) {
        const repoName = args[repoFlagIdx + 1];
        if (!repoName) { console.error('--repo requires a repo name'); process.exit(1); }
        const repo = fm.state.repos.find(r => r.id === repoName || r.name === repoName);
        if (!repo) { console.error(`Repo "${repoName}" not found. Available: ${fm.state.repos.map(r => r.name || r.id).join(', ') || 'none'}`); process.exit(1); }
        repoId = repo.id;
        textParts.splice(repoFlagIdx, 2);
      }
      const text = textParts.join(' ');
      if (!text) { console.error('Usage: goal "<text>" [--repo <name>]'); process.exit(1); }
      const goalId = await fm.submitGoal(text, repoId);
      console.log(`Goal submitted: ${goalId}${repoId ? ` (repo: ${repoId})` : ''}`);
      console.log('Marlow is planning...');
      break;
    }
    /** `tasks`: list tasks. args: `[goalId]` filters to one goal. */
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
    /** `decisions`: list open decisions with their options. No args. */
    case 'decisions': {
      const open = fm.state.decisions.filter(d => d.status === 'open');
      if (!open.length) { console.log('No open decisions.'); break; }
      for (const d of open) {
        console.log(`  ${d.id} (${d.kind}) — ${d.question}`);
        console.log(`    Options: ${d.options.join(' | ')}`);
      }
      break;
    }
    /**
     * `decide`: answer a decision. args: `<decisionId> <option> [text...]`.
     * @throws {Error} From answerDecision on RPC timeout or rejected ack.
     */
    case 'decide': {
      const [dId, ...rest] = args;
      const option = rest[0];
      const text = rest.slice(1).join(' ') || undefined;
      await fm.answerDecision(dId, option, text);
      console.log(`Answered ${dId}: ${option}`);
      break;
    }
    /**
     * `merge`: shorthand for answering a decision with `Merge`. args: `<decisionId>`.
     * @throws {Error} From answerDecision on RPC timeout or rejected ack.
     */
    case 'merge': {
      await fm.answerDecision(args[0], 'Merge');
      console.log(`Merged ${args[0]}`);
      break;
    }
    /** `diff`: print the diff of a worktree using the first repo. args: `<worktree>`. Prints a notice on timeout. */
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
    /** `msg`: message an agent. args: `<agentId|all> <text...>`. */
    case 'msg': {
      const [to, ...msgParts] = args;
      await fm.messageAgent(to, msgParts.join(' '));
      console.log(`Message sent to ${to}`);
      break;
    }
    /**
     * `repo-add`: register a repo. args: `<path>`.
     * @throws {Error} From addRepo on RPC timeout or rejected ack.
     */
    case 'repo-add': {
      const r = await fm.addRepo(args[0]);
      console.log(`Repo added: ${JSON.stringify(r)}`);
      break;
    }
    /** `repos`: list registered repos with path, branch and dirty flag. No args. */
    case 'repos': {
      if (!fm.state.repos.length) { console.log('No repos registered.'); break; }
      console.log('=== Registered Repos ===');
      for (const r of fm.state.repos) {
        const dirty = r.dirty ? ' [dirty]' : '';
        console.log(`  ${r.id} — ${r.name || '(unnamed)'}${dirty}`);
        console.log(`    Path: ${r.path || 'N/A'} | Branch: ${r.branch || 'N/A'}`);
      }
      break;
    }
    /** `cost`: print total API cost so far. No args. */
    case 'cost': {
      const costUsd = fm.state.foreman?.costUsd || 0;
      console.log(`Total API cost: $${costUsd.toFixed(4)}`);
      break;
    }
    /** `watch`: stream all Foreman events until interrupted (never resolves; socket stays open). No args. */
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
    /**
     * `autopilot`: auto-approve permission requests and, unless `--no-merge`,
     * merges that pass the safety checks in `evaluateMerge`. Clears already-open
     * decisions first, then runs until interrupted.
     * args: `[--no-merge] [--strict]`.
     */
    case 'autopilot': {
      const autoMerge = !args.includes('--no-merge');
      const strict = args.includes('--strict');
      console.log(`Autopilot ON${autoMerge ? ' (smart merge: CI + size + safety checks)' : ' (permissions only, merges manual)'}`);
      if (strict) console.log('  --strict: max 200 lines, no env/config/auth files');
      console.log('Ctrl+C to stop.\n');

      // Merge criteria thresholds
      const MAX_FILES = strict ? 10 : 30;
      const MAX_ADDITIONS = strict ? 200 : 1000;
      const SENSITIVE_PATTERNS = /\.(env|pem|key|secret|credentials|auth)\b|password|api[_-]?key|secret/i;

      /**
       * Decide whether a merge decision is safe to auto-approve and act on it.
       * Holds (and prints manual commands) on failed CI, size over MAX_FILES /
       * MAX_ADDITIONS, or sensitive-looking paths in the question, context or
       * fetched diff; otherwise answers `Merge`.
       * @param {{id: string, question?: string, context?: string, worktree?: string}} d Open merge decision.
       * @returns {Promise<boolean>} `true` if merged, `false` if held for manual review.
       * @throws {Error} If answering the decision fails (RPC timeout or rejected ack).
       */
      async function evaluateMerge(d) {
        const ts = new Date().toLocaleTimeString();
        // Extract diff stats from context (format: "N files, +X -Y | tests: pass/fail")
        const ctx = d.context || '';
        const fileMatch = ctx.match(/(\d+)\s*files?/);
        const addMatch = ctx.match(/\+(\d+)/);
        const delMatch = ctx.match(/-(\d+)/);
        const ciMatch = ctx.match(/tests?:\s*(\w+)/i);

        const files = fileMatch ? parseInt(fileMatch[1]) : 0;
        const additions = addMatch ? parseInt(addMatch[1]) : 0;
        const deletions = delMatch ? parseInt(delMatch[1]) : 0;
        const ci = ciMatch ? ciMatch[1].toLowerCase() : 'unknown';

        const reasons = [];

        // Rule 1: CI must pass (if reported)
        if (ci === 'fail') {
          reasons.push(`CI FAILED`);
        }

        // Rule 2: Size limits
        if (files > MAX_FILES) {
          reasons.push(`too many files (${files} > ${MAX_FILES})`);
        }
        if (additions > MAX_ADDITIONS) {
          reasons.push(`too many additions (+${additions} > +${MAX_ADDITIONS})`);
        }

        // Rule 3: Check for sensitive files in the question/context
        if (SENSITIVE_PATTERNS.test(d.question || '') || SENSITIVE_PATTERNS.test(ctx)) {
          reasons.push(`touches sensitive file pattern`);
        }

        // Rule 4: Try to get actual diff for deeper check
        let diffWarnings = [];
        if (d.worktree && fm.state.repos[0]) {
          try {
            const diff = await fm.requestDiff(fm.state.repos[0].id, d.worktree);
            if (diff && diff.files) {
              for (const f of diff.files) {
                if (SENSITIVE_PATTERNS.test(f.path)) {
                  diffWarnings.push(f.path);
                }
              }
              if (diffWarnings.length > 0) {
                reasons.push(`sensitive files: ${diffWarnings.join(', ')}`);
              }
            }
          } catch { /* diff unavailable, proceed with context-based check */ }
        }

        if (reasons.length > 0) {
          console.log(`[${ts}] ⏸ HOLD merge ${d.id}: ${reasons.join('; ')}`);
          console.log(`         ${d.question}`);
          console.log(`         Stats: ${files} files, +${additions} -${deletions}, CI: ${ci}`);
          console.log(`         Manual: node tools/bridge.mjs merge ${d.id}`);
          console.log(`         Reject: node tools/bridge.mjs decide ${d.id} Reject`);
          return false;
        }

        // All checks passed — auto-merge
        await fm.answerDecision(d.id, 'Merge');
        console.log(`[${ts}] ✓ Smart-merged ${d.id}: ${files} files, +${additions} -${deletions}, CI: ${ci}`);
        return true;
      }

      let approved = 0;
      fm._watchHandler = async (msg) => {
        const ts = new Date().toLocaleTimeString();
        if (msg.type === 'decision.upsert' && msg.decision.status === 'open') {
          const d = msg.decision;
          if (d.kind === 'permission') {
            fm.answerDecision(d.id, 'Always allow for this agent').then(() => {
              approved++;
              console.log(`[${ts}] ✓ Permission ${d.id} → always allow`);
            }).catch(() => {});
          } else if (d.kind === 'merge' && autoMerge) {
            const ok = await evaluateMerge(d);
            if (ok) approved++;
          } else if (d.kind === 'merge' && !autoMerge) {
            console.log(`[${ts}] ⏸ MERGE: ${d.id} — ${d.question}`);
            console.log(`         node tools/bridge.mjs merge ${d.id}`);
          } else if (d.kind === 'question') {
            console.log(`[${ts}] ❓ QUESTION ${d.id} from ${d.agentId}: ${d.question}`);
            console.log(`         Options: ${(d.options || []).join(' | ')}`);
          }
        }
        if (msg.type === 'goal.upsert') {
          const g = msg.goal;
          console.log(`[${ts}] Goal ${g.id}: ${g.status} (${Math.round((g.progress || 0) * 100)}%)${g.status === 'done' ? ' ✅ COMPLETE' : ''}`);
        }
        if (msg.type === 'task.upsert') {
          const t = msg.task;
          if (t.status === 'done') console.log(`[${ts}] ✅ ${t.id} done: ${t.title}`);
          else if (t.status === 'doing') console.log(`[${ts}] ⚙ ${t.id}: ${t.title} → ${t.assignee}`);
        }
        if (msg.type === 'feed.add') console.log(`[${ts}] ${msg.item.text}`);
      };
      // Clear pending
      for (const d of fm.state.decisions.filter(x => x.status === 'open')) {
        if (d.kind === 'permission') {
          fm.answerDecision(d.id, 'Always allow for this agent').catch(() => {});
          console.log(`✓ Cleared permission ${d.id}`);
          approved++;
        } else if (d.kind === 'merge' && autoMerge) {
          const ok = await evaluateMerge(d);
          if (ok) approved++;
        }
      }
      if (approved > 0) console.log(`\nCleared ${approved} pending decisions.\n`);
      // Auto-clean ghost decisions (already-merged worktrees stuck in queue)
      const ghosts = await fm.cleanGhostDecisions();
      if (ghosts > 0) console.log(`Cleaned ${ghosts} ghost decision(s).\n`);
      await new Promise(() => {});
      break;
    }
    /**
     * `run`: submit a goal and follow it to completion, exiting 0 when the goal is done.
     * With `--autopilot`/`-a` it auto-approves permissions and smart-merges (holds on
     * failed CI or sensitive paths); otherwise it only prints decisions.
     * args: `<goal text...> [--autopilot|-a]`. Exits 1 if no goal text.
     * @throws {Error} From submitGoal on RPC timeout.
     */
    case 'run': {
      const goalText = args.filter(a => !a.startsWith('--')).join(' ');
      const auto = args.includes('--autopilot') || args.includes('-a');
      if (!goalText) { console.error('Usage: run "<goal text>" [--autopilot]'); process.exit(1); }

      const goalId = await fm.submitGoal(goalText);
      console.log(`Goal submitted: ${goalId}`);
      console.log(`Mode: ${auto ? 'autopilot (smart merge criteria)' : 'watch (manual decisions)'}\n`);

      const SENSITIVE = /\.(env|pem|key|secret|credentials|auth)\b|password|api[_-]?key|secret/i;

      fm._watchHandler = async (msg) => {
        const ts = new Date().toLocaleTimeString();
        if (auto && msg.type === 'decision.upsert' && msg.decision.status === 'open') {
          const d = msg.decision;
          if (d.kind === 'permission') {
            fm.answerDecision(d.id, 'Always allow for this agent').catch(() => {});
            console.log(`[${ts}] ✓ ${d.id} permission approved`);
          } else if (d.kind === 'merge') {
            // Smart merge: check CI + sensitive files
            const ctx = d.context || '';
            const ciFail = /tests?:\s*fail/i.test(ctx);
            const sensitive = SENSITIVE.test(d.question || '') || SENSITIVE.test(ctx);
            if (ciFail || sensitive) {
              console.log(`[${ts}] ⏸ HOLD ${d.id}: ${ciFail ? 'CI failed' : 'sensitive files'}`);
              console.log(`         Manual: node tools/bridge.mjs merge ${d.id}`);
            } else {
              fm.answerDecision(d.id, 'Merge').catch(() => {});
              console.log(`[${ts}] ✓ ${d.id} smart-merged`);
            }
          }
        } else if (!auto && msg.type === 'decision.upsert' && msg.decision.status === 'open') {
          console.log(`[${ts}] ⚡ DECISION ${msg.decision.id}: ${msg.decision.question}`);
        }
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
    /** Any other command: print an error and exit 1. */
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }

  if (cmd !== 'watch') fm.close();
} catch (e) {
  console.error(`Connection failed: ${e.message}\nIs the Foreman running? Launch AgentCraft first.`);
  process.exit(1);
}
