# AgentCraft Architecture

AgentCraft turns a team of coding agents into a Minecraft office. A **Foreman** (TypeScript) runs the agents and owns all state; a **Fabric mod** (Java) renders that state in-world and lets the player steer the team; small **Node CLIs** under `tools/` let scripts and Claude Code talk to the same Foreman without opening the game.

This document is the map. It names the components, what each one owns, and how data flows between them. Message shapes are not repeated here; see [protocol.md](protocol.md).

## Table of contents

1. [System overview](#system-overview)
2. [Foreman (TypeScript)](#foreman-typescript)
3. [Mod (Java/Fabric)](#mod-javafabric)
4. [Wire protocol](#wire-protocol)
5. [Bridge CLI & Arena Bridge](#bridge-cli--arena-bridge)
6. [Theme System & ColiseumBuilder](#theme-system--coliseumbuilder)

## System overview

```
  +------------------+     +--------------------------------------------------+
  | Claude Code/user |---->| Bridge CLI   tools/openclaw-bridge.mjs           |
  +------------------+     | foremancli   tools/foremancli.mjs                |
                           | Arena Bridge tools/arena-bridge.mjs              |
                           +-----------------------+--------------------------+
                                                   | WebSocket (hello -> snapshot -> events)
                                                   v
  +-------------------+     ws://127.0.0.1:7878 (AGENTCRAFT_PORT)
  | Minecraft player  |   +--------------------------------------------------+
  |  (Fabric client)  |   |  FOREMAN  foreman/src                            |
  |                   |   |  server.ts -> foreman.ts (state, intents)        |
  |  +-------------+  |   |    bus / decisions / diff / memory / policy      |
  |  | ForemanLink |<-+-->|  agents/team.ts -> engines: claude | codex | sim |
  |  +------+------+  |   +----------------------+---------------------------+
  |         |         |                          | spawns turns, one worktree per worker
  |  ForemanState     |                          v
  |    -> renderers   |   +--------------------------------------------------+
  |         |         |   |  git repos + worktrees (never pushed)            |
  |  +------v------+  |   +--------------------------------------------------+
  |  | DevBridge   |<-+---- ws://127.0.0.1:7879 <---- tools/devcli.mjs
  |  +-------------+  |
  +--------+----------+
           | integrated server (mod/src/main)
           v
  +--------------------------------------------------------------+
  | hq/*: Theme, ThemedHqBuilder, ColiseumBuilder -> the world   |
  +--------------------------------------------------------------+
```

- The Foreman is the only owner of state. Every client (mod, CLIs) connects over the same WebSocket and receives every broadcast.
- The mod has a second, unrelated socket: `DevBridge` (default port 7879, `AGENTCRAFT_DEV_PORT`, see `mod/src/client/java/dev/agentcraft/client/ClientEnv.java`), driven by `tools/devcli.mjs` for screenshots and scripted QA.
- The Arena Bridge sends `arena.*` messages (defined in `foreman/src/protocol.ts`) for the Coliseum; its section is filled in below.

## Foreman (TypeScript)

Source: `foreman/src`. Started with `npm run start -- --backend sim|claude|codex` (`main.ts`). Configuration precedence is defaults < `config.json` < environment < CLI flags (`config.ts`); the port defaults to 7878 (`AGENTCRAFT_PORT`).

| Module | Role |
| --- | --- |
| `main.ts` | Entry point: loads config, creates the team, claims run files, starts the server. |
| `foreman.ts` | Core. Owns all state, composes subsystems, applies user intents, exposes primitives backends use. Transport-agnostic. |
| `server.ts` | WebSocket server; `hello` -> `snapshot`, then upserts. Rejects browser origins and non-loopback hosts. |
| `protocol.ts` | Wire protocol v1, the single source of truth; `protocol-examples.ts` holds one example per message. |
| `bus.ts` | `MessageBus`: agent-to-agent and agent-to-user messages plus the activity feed. |
| `decisions.ts` | `DecisionQueue`: questions, permission prompts and merge approvals that need the user. |
| `diff.ts` | Parses `git diff` output into structured `DiffFile[]`. |
| `gitsafety.ts` | Git safety environment for agent processes and CI (no pushing). |
| `memory.ts` | Markdown memory, shared and per agent. |
| `policy.ts` | Permission policy for tool calls: allow, or ask (becomes a `permission` decision). |
| `notifier.ts` | Out-of-game notification that a decision is waiting. |
| `taskgraph.ts`, `store.ts`, `repos.ts` | Task dependencies/status; durable state on disk; registered repos, worktrees and guarded merges. |
| `agents/team.ts` | The team: a job queue per agent (plan / work / review / followup), CI, steering. |
| `agents/engine.ts` | Engine interface shared by `agents/claude` and `agents/codex`. |
| `agents/sim` | Deterministic scripted backend on a sandbox repo, for demos and tests. |

Lifecycle of a goal (`agents/team.ts`):

```
  goal.submit (user)
        |
        v
  lead: PLAN  (read-only exploration, writes plan, creates tasks)
        |
        v
  tasks (taskgraph: deps, todo -> doing)
        |
        +--> worker A: WORK in own git worktree --+
        +--> worker B: WORK in own git worktree --+
                                                  v
                       CI in worktree -> task status "review"
                                                  |
                                                  v
                       lead: REVIEW (diff + CI) -> request_merge | changes
                                                  |
                                                  v
                       merge Decision (DecisionQueue) -> user in the mod
                          Merge | Request changes | Reject
                                                  |
                                                  v
                       guarded merge (repos.ts), task done
```

## Mod (Java/Fabric)

Two source sets under `mod/src`:

- `main`: the common/integrated-server side. Blocks (`block/`), the agent entity (`entity/AgentEntity.java`), commands, and the HQ world generation in `hq/` (`HqBuilder`, `Theme`, `ThemedHqBuilder`, `ColiseumBuilder`, ...).
- `client`: `dev.agentcraft.client`; everything that talks to the Foreman and draws UI.

Client feature packages (`mod/src/client/java/dev/agentcraft/client/`):

| Package | Role |
| --- | --- |
| `foreman` | `ForemanLink` (socket and reconnect), `ForemanState` (mirror of the snapshot), `ForemanListener` callbacks, `Protocol`/`ForemanJson` codecs. |
| `agents` | Agent rendering, motion, nameplates, speech bubbles, the agent card (`AgentsFeature`). |
| `taskwall` | Task Wall board and screen (`TaskBoardRenderer`, `TaskScreen`). |
| `decisions` | Decision Podium and decision screen (`DecisionQueue`, `DecisionScreen`). |
| `permissions` | Permission prompt details shown with decisions. |
| `diff` | Diff viewer and Merge Station (`DiffScreen`, `MergeStationRenderer`). |
| `hud` | Goal bar, connection banner, toasts. |
| `console` | In-world console terminal: commands that become client messages. |
| `monitor` | In-world monitors showing agent logs and stats. |
| `library` | Memory archive and markdown reader. |
| `dev` | `DevBridge` on port 7879 for tooling. |

Data flow inside the client:

```
  Foreman --ws--> ForemanLink --> ForemanState (snapshot + upserts)
                                       |
                                       +--> ForemanListener callbacks
                                              |
        +----------+----------+----------+----+-----+-----------+
        v          v          v          v          v           v
     agents    taskwall   decisions     diff      hud       monitor / library
   (entities,  (board     (podium,     (merge    (goal bar,  (screens on
    plates)     render)    screen)      station)  banner)     blocks)

  player input --> console / screens --> ForemanLink --ws--> Foreman
```

## Wire protocol

Full reference: [protocol.md](protocol.md) (generated from `foreman/src/protocol.ts`; do not edit it by hand).

In short:

1. The client connects to `ws://127.0.0.1:7878` (no `Origin` header) and sends `hello`.
2. The Foreman answers with a full `snapshot`.
3. After that it broadcasts incremental messages to every client: `agent.upsert`, `agent.log`, `agent.say`, `task.upsert`, `decision.upsert`, `repo.upsert`, `memory.upsert`, `goal.upsert`, `feed.add`, `diff`, `notify`, `foreman.status`. Upserts replace the whole entity by id.
4. Clients send intents: `goal.submit`, `user.message`, `decision.answer`, `task.action`, `agent.action`, `diff.request`, `repo.add`.
5. A client message carrying an `id` is answered by `ack { re, ok, error?, result? }`; invalid input yields `error`.
6. On disconnect the mod reconnects with backoff, re-sends `hello`, and the new snapshot rebuilds its view.

## Bridge CLI & Arena Bridge

TODO: filled by follow-up task

## Theme System & ColiseumBuilder

TODO: filled by follow-up task
