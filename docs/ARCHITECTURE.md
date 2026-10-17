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

Both bridges are small Node scripts (ESM, `ws` package) in `tools/` that speak the Foreman wire protocol
([protocol.md](protocol.md)) as just another client, so Claude Code or a shell can drive the team without
opening Minecraft. Every connection is `ws://127.0.0.1:${AGENTCRAFT_PORT:-7878}` with `hello` -> `snapshot`.

### Bridge CLI (`tools/openclaw-bridge.mjs`)

`ForemanBridge.connect()` opens the socket, sends `{v:1, type:"hello", modVersion:"0.1.0", protocol:1,
client:"openclaw"}` and waits for the `snapshot`. It keeps a local copy of the state (`foreman`, `agents`,
`tasks`, `decisions`, `goals`, `repos`, `feed`) updated from `task.upsert`, `goal.upsert`, `decision.upsert`,
`agent.upsert`, `repo.upsert` and `feed.add`. Requests with an `id` (`oc-N`) are matched to the
`ack { re, ok, result|error }` with a 15 s timeout. Read-only commands just print the snapshot and exit.

| Command | Sends | Receives / uses |
|---|---|---|
| `status` | `hello` only | `snapshot` (foreman backend/auth/cost, agents, tasks, goals, repos) |
| `agents` | `hello` only | `snapshot.agents` |
| `tasks [goalId]` | `hello` only | `snapshot.tasks`, filtered by `goalId` |
| `decisions` | `hello` only | `snapshot.decisions` with `status == open` |
| `repos` | `hello` only | `snapshot.repos` |
| `cost` | `hello` only | `snapshot.foreman.costUsd` |
| `goal "<text>" [--repo <name>]` | `goal.submit {text, repoId?}` | `ack.result.goalId`; `--repo` is resolved against `snapshot.repos` (id or name) |
| `decide <id> <option> [text]` | `decision.answer {decisionId, option, text?}` | `ack` |
| `merge <id>` | `decision.answer` with option `Merge` | `ack` |
| `msg <agent\|all> "<text>"` | `user.message {to, text}` (fire and forget, no `id`) | nothing awaited |
| `diff <worktree>` | `diff.request {requestId, repoId, worktree}` (repo = first in snapshot) | `diff` (`base`, `branch`, `files[].hunks`, `stats`); `null` after 15 s |
| `watch` | `hello` only | prints `feed.add`, `agent.say`, `task.upsert`, `goal.upsert`, open `decision.upsert`; other types by name |
| `repo-add <path>` | `repo.add {path}` | `ack` |

The script also implements `autopilot [--no-merge] [--strict]` and `run "<goal>" [--autopilot]`. They react
to open `decision.upsert` messages by sending `decision.answer` (`Always allow for this agent` for
`permission`; `Merge` for `merge` after checks on the decision context and the `diff`).

```
 Claude Code      openclaw-bridge          Foreman (:7878)            agents
     |  goal "Fix SEO"   |                        |                       |
     |------------------>|  ws connect            |                       |
     |                   |----------------------->|                       |
     |                   |  hello{client:openclaw}|                       |
     |                   |----------------------->|                       |
     |                   |<-----------------------|                       |
     |                   |  snapshot              |                       |
     |                   |  goal.submit{id:oc-1}  |                       |
     |                   |----------------------->|  Marlow plans,        |
     |                   |<-----------------------|  spawns tasks ------->|
     |                   |  ack{re:oc-1,          |                       |
     |  "Goal submitted" |       result:{goalId}} |                       |
     |<------------------|  (process exits)       |                       |
     |                                            |                       |
     |  watch            |  hello -> snapshot     |   work happens        |
     |------------------>|<-----------------------|<----------------------|
     |                   |  goal.upsert / task.upsert / agent.say / feed.add
     |  [12:01] task t3: doing ...                |  decision.upsert(open)|
     |<------------------|<-----------------------|                       |
     |  decide d3 Merge  |  decision.answer{id}   |                       |
     |------------------>|----------------------->|  merge, ack{re, ok}   |
```

Related clients (all under `tools/`):

- `tools/lib/foremanclient.mjs`: reusable `ForemanClient` (`connect` retries until the Foreman is up,
  `send(type, payload)` returns the ack, `waitForState`, `ForemanError`). Default port `AGENTCRAFT_PORT` or 7878.
- `tools/foremancli.mjs`: scripting/QA CLI on top of it (`status`, `wait`, `diff`, `repo-add`,
  `send <type> '<json>'`); prints JSON, uses exit codes, identifies itself as `client: "cli"`.
- `tools/lib/devclient.mjs` and `tools/devcli.mjs`: not the Foreman. They talk to the **DevBridge** inside the
  running game (mod `dev/DevBridge`, `ws://127.0.0.1:${AGENTCRAFT_DEV_PORT:-7879}`) for `state`, `camera`,
  `shot`, `cmd`, `screen`, `key`, `quit` and so on (screenshots/QA).
- `tools/launch-openclaw.mjs`: reads `~/.openclaw-office/config.json` (written by `tools/setup.mjs`) and
  launches the Foreman (with the game via `--game`, or a `--repo` override).

### Arena Bridge (`tools/arena-bridge.mjs`)

A battle royale of N agents debating one topic. The script holds an `ArenaState` (combatants
`gladiator_<i>`, each with `spot` = `arena_spot_<i>`, `score`, `arguments`, status
`fighting | eliminated | champion`, plus `eliminated[]`, `champion`, `round`) and an `ArenaBridge` that talks to
the Foreman as client `arena`.

| Command | Behaviour |
|---|---|
| `start "<topic>" [--agents N]` | creates the state (default 16 fighters, spots `0..N-1`), writes `.arena-state.json` in the cwd and prints how to launch the arena skill (`claude -p "arena --quick N topic"`). The debate itself runs in that skill, not here. |
| `status` | reads `.arena-state.json`: active fighters, eliminated count, champion, round |
| `scoreboard` | ranks combatants by score from `.arena-state.json` |
| `spectate` | connects (`hello`) and prints `agent.say` and `feed.add` from the Foreman |
| `simulate ["topic"]` | fake 16-fighter match, one round per 3 s: random scores, lowest scorer eliminated each round, last one crowned; talks to the Foreman if reachable |
| `eliminate <id>` / `crown <id>` | listed in the usage text, but the command switch has no case for them (they fall through to `Unknown command`) |

The `ArenaBridge` helpers send `user.message {to:"all", text}` (`announce`/`broadcast`, `id` `arena-N`) and the
arena messages `arena.state {topic, round, combatants[], champion?}`, `arena.score {combatantId, score,
argument?}`, `arena.eliminate {combatantId, reason?}` and `arena.crown {combatantId}`.

Current wiring, as the code stands: `arena.*` are declared in `foreman/src/protocol.ts` only as
`ServerMessage` types (`ArenaStateMsg` etc.), not in `ClientMessage`, so the Foreman rejects them with an
`error`, and no class under `mod/` consumes them. What reaches the world today is the speech path: the
Foreman routes `user.message` to agents, and `agent.say` messages are drawn by the mod as speech bubbles
(`mod/src/client/java/dev/agentcraft/client/agents/SpeechBubble.java`). The Coliseum itself
(`hq/ColiseumBuilder.java`) provides the `arena_spot_N` anchors, scoreboard and stands; see the ColiseumBuilder
section.

```
   start "topic" --agents N                 simulate / arena skill
            |                                      |
            v                                      v
     +--------------+   score/argument    +----------------+
     | N combatants |-------------------->| round r        |
     | status:      |                     | scores added   |
     | fighting     |<--------------------| (sendScore)    |
     +--------------+  survivors continue +--------+-------+
            ^                                      |
            |                          lowest scorer eliminated
            |                          (sendEliminate, sendState)
            |                                      v
            |                           +-------------------+
            +---------------------------| eliminated -> the |
              active > 1: next round    | stands            |
                                        +---------+---------+
                                                  | active == 1
                                                  v
                                        +-------------------+
                                        | champion          |
                                        | sendCrown+announce|
                                        +-------------------+
                                                  |
                              final scoreboard printed, .arena-state.json
```

## Theme System & ColiseumBuilder

Both live in `mod/src/main/java/dev/agentcraft/hq/` and are registered in `HqFeature.init()` via
`HqBuilders.register(...)`. Builders implement `HqBuilder` (`id()`, `description()`,
`build(ServerLevel, Anchors.Builder, Options)`) and are run by `/agentcraft hq [builder] [force]`
through `HqFeature.buildAndPublish`.

### Theme System

#### The `Theme` record

`Theme` is a Java `record` of materials only. Its sole behaviour is two lookups:
`Theme.byId(String)` (aliases such as `modern`, `exec`, `brick`, `clean`, `luxury`; unknown ids fall
back to `WARM_STUDIO`) and `Theme.all()`. Its fields, grouped:

| Group | Fields |
|-------|--------|
| identity | `id`, `displayName` |
| walls | `wallPrimary`, `wallFrame`, `wallTrim`, `wallWood`, `framePost`, `frameBeam` |
| floor | `floorMain`, `floorAccent`, `floorTile`, `plinth` |
| roof / ceiling | `roofStairs`, `roofSlab`, `roofFull`, `roofTrim`, `ceilStairs`, `ceilFull` |
| dome | `domeShell`, `domeStairs`, `domeSlab` |
| misc | `glassPane`, `sofa`, `lantern`, `lanternHanging`, `glowPanel` |

Fields are `BlockState` for full blocks and `Block` where the builder must keep the placed block's
properties (stairs, slabs, logs, sofa). The six built-in constants:

| Constant | `id` | Look |
|----------|------|------|
| `WARM_STUDIO` | `warm_studio` | original timber + copper + plaster (default, no swap pass) |
| `MODERN_GLASS` | `modern_glass` | quartz + glass + iron |
| `EXECUTIVE` | `executive` | dark oak + deepslate + gold accents |
| `INDUSTRIAL` | `industrial` | exposed brick + iron + concrete |
| `MINIMAL` | `minimal` | white + light gray + birch |
| `PENTHOUSE` | `penthouse` | dark luxury + gold + crimson wood, soul lanterns |

#### How `ThemedHqBuilder` consumes it

`ThemedHqBuilder` (id `openclaw`) is a decorator around `StudioHqBuilder`: the studio layout is built
unchanged, then materials are swapped in place.

```
  OPENCLAW_THEME env --> Theme.byId() --> Theme (record of BlockStates)
                                              |
  /agentcraft hq openclaw                     v
        |                          ThemedHqBuilder.build()
        v                                     |
  HqFeature.buildAndPublish                   | 1. delegate.build()   (StudioHqBuilder: Plan -> world)
        |                                     |
        '------------------------------------>| 2. applyTheme(level)  (skipped for warm_studio)
                                              |      buildBlockSwapTable()  Block -> Block
                                              |      buildFullSwapTable()   Block -> BlockState
                                              v
        for every (x,y,z) in StudioHqBuilder SITE {-46,60,-36 .. 46,100,54}:
           stairs/slab/log?  -> copyProperties(old, new)  (facing, half, shape, waterlogged)
           planks/panel/glass/lantern? -> level.setBlock(pos, replacement, 2)
                                              |
                                              v
                    report "theme X applied (N blocks)" -> HqFeature.lastReport
```

The two tables map the studio's original blocks (birch/dark-oak planks, mud bricks, plaster and
walnut mod blocks, terracotta tile, glow panel, waxed copper, pale-oak ceiling, glass pane, lantern,
stairs/slabs) onto the theme fields. **What stays fixed:** the functional blocks (monitors, desks,
status lamps, task-board panels, decision podiums, merge stations) are never keys in either table,
so geometry, anchors and interactivity are identical across themes.

#### Selecting a theme

There is no in-game theme command. The theme is read once, in the `ThemedHqBuilder()` constructor,
from the `OPENCLAW_THEME` environment variable (default `warm_studio`). `tools/launch-openclaw.mjs`
sets it from its config (`env.OPENCLAW_THEME = cfg.theme`) before starting the game; the
`ThemedHqBuilder(Theme)` constructor allows programmatic use. Because the choice is made at startup,
switching themes means restarting with a different value and re-running `/agentcraft hq openclaw`.

### ColiseumBuilder

`ColiseumBuilder` (id `coliseum`) is the battle-royale arena and the fallback default builder.
`HqFeature.defaultBuilderId()` picks the default after all builders are registered: `-Dagentcraft.hq.default`,
then env `OPENCLAW_HQ_DEFAULT` (the launcher sets it from the setup wizard's `hqMode`), trimmed and lowercased.
If it names a registered builder (`openclaw`, `coliseum`, `coliseum_ice`, ...) that builder is the default;
if it is unknown (e.g. `coliseum_nether` before it exists) a warning lists the known ids and `coliseum` is used;
blank/absent also means `coliseum`. A fresh HQ world auto-builds the default on `SERVER_STARTED`
(disable with `AGENTCRAFT_HQ_AUTOBUILD=0`). Auto-build only fires on a fresh HQ world (no saved anchors), so
changing the mode for an existing world needs a fresh world or `/agentcraft hq <id>`.

#### Geometry

Constants in `ColiseumBuilder`: centre `CX=CZ=0`; outer wall ellipse `OUTER_RX=35`, `OUTER_RZ=28`;
arena ellipse `ARENA_RX=22`, `ARENA_RZ=17`; `STAGE_R=5`; `GROUND=64`, `FLOOR=65`, `FEET=66`;
4 wall tiers of `TIER_H=5` (`WALL_TOP=86`, `PARAPET=88`); four axial gates of width
`2*GATE_W+1 = 3`; site box `SITE = {-42,60,-35, 42,95,35}`; 100 spots on four `SPOT_RINGS`
(12/20/28/40 spots at radius 7/10/13/16).

#### Build pipeline

`build()` composes everything into a `Plan` (the in-memory desired state of the site box), then
applies it as a diff. Phases run in this order:

```
  Plan p = meadow (grass @64, dirt, stone)
     |
     |- foundation(p)            stone-brick base ellipse
     |- arenaFloor(p)            smooth sandstone + red-sandstone ring
     |- arenaFloorPatterns(p)    sandstone / cut / chiseled mosaic in the floor
     |- seatingBowl(p)           stepped seats between arena edge and wall
     |- outerWalls(p)            4 tiers of chiseled / cut sandstone
     |- arches(p)                arched bays + diorite/quartz columns
     |- gates(p), gatePodiums(p) N/S/E/W openings; podium between two columns
     |- parapet(p)               top rim at PARAPET
     |- championStage(p, a)      raised gilded-blackstone disc, sea-lantern edge ring
     |    '- ColiseumAmbience.stageNoteBlocks(p)   8 note blocks buried in the stage base
     |- arenaSpots / scoreboardWall / eliminatedZone   anchors: 100 agents, board, bench
     |- lighting(p), ruins(p)    lanterns, cracked-brick ruin accents
     |- pillarBanners(p)         banners on the outer pillars
     |- redCarpet(p)             south gate -> stage centre, |x| <= GATE_W
     |- pillarFires(p)           campfires on every FIRE_EVERY-th arch pair
     '- anchors(p, a)
     |
     v
  PlanStore.load(ID) --> p.apply(level, previous, force)   diff: only changed cells are written
  PlanStore.save(ID, SITE, p.cells())                      player edits survive a rebuild
  ColiseumGuards.spawn(level)                              entities, not blocks
  anchors: bounds, ENTRANCE (south, z=OUTER_RZ+2), SPAWN (20 above centre, pitch 60)
```

Top-down sketch (not to scale; the red carpet runs from the south gate to the stage):

```
                         N gate (|x|<=1)
              ,-------------[  ]-------------.
          ,-'   outer wall: 4 tiers, arches    '-.
        ,'  pillars (banners, fires every 4th)     '.
       /   ,------------[  ]------------------.       \
      /   /   seating bowl (stepped)           \       \
     |   |   ,-------------------------.        |       |
 W  [ ]  |  /  arena floor (22 x 17)     \       |      [ ] E
     |   | |   spots: rings r=7,10,13,16  |      |       |
     |   | |        ( STAGE r=5 )          |      |       |
      \   \ \   gold stage + note blocks  /      /       /
       \   `-`-----------[##]-----------'-'      /       /
        `.                [##] red carpet      .'
          `-.             [  ]              .-'
              `-------------[  ]-----------'
                         S gate   <- ENTRANCE anchor
```

#### Gates, guards and portcullis

`ColiseumPortcullis` adds an iron-bars row across each gate passage. The built world keeps the
gates raised; `/agentcraft coliseum gates <raise|lower> [n|s|e|w|all]` toggles them, touching only
open gate cells (air, carpet or its own bars). `ColiseumPortcullis.gates()` exposes the geometry as
`Gate(name, outward, cells)` records. `ColiseumGuards.spawn(level)` places 8 iron-armored armor
stands (2 per gate, tag `agentcraft_coliseum_guard`) and removes stale ones from earlier builds first.

#### Ambience, environment and view

| Class | Role | Trigger |
|-------|------|---------|
| `ColiseumAmbience` | 8 note blocks (bell, chime, harp) hidden in the stage base | placed by the Plan; `/agentcraft coliseum fanfare` plays them as a chord |
| `ColiseumEnvironment` | `apply(level)` runs `time set 18000` + `weather clear` so fires stand out | `HqFeature.buildAndPublish` after a `coliseum` build |
| `ColiseumView` | `spectateFromAbove(player)`: spectator mode, 20 blocks over the centre, pitch 90 | `/agentcraft hq coliseum` run by a player |

Commands that reach the coliseum code:

- `/agentcraft hq` (default builder) or `/agentcraft hq coliseum [force]`: build, publish anchors, set world spawn, apply environment, spectate from above.
- `/agentcraft coliseum gates <raise|lower> [n|s|e|w|all]`: `ColiseumPortcullis`.
- `/agentcraft coliseum fanfare`: `ColiseumAmbience`.
- `/agentcraft spectate`: generic gamemode toggle (`SpectateToggle`).

#### End-to-end flow

```
  /agentcraft hq coliseum
        |
        v
  HqFeature.build --- refusal() guard (HQ world only, never Hardcore)
        |
        v
  buildAndPublish --- PlanStore.invalidateUnless("coliseum")  (drop other builders' records)
        |                 ColiseumBuilder.build --> Plan --> diff --> world blocks
        |                                       '-> ColiseumGuards --> armor stands
        |- Anchors.publish --> layout (100 spots, entrance, spawn) --> clients / Foreman
        |- setworldspawn at the SPAWN anchor
        '- ColiseumEnvironment.apply ; ColiseumView.spectateFromAbove (caller)
```

The anchors published here are what the client and the Foreman use to place agents on the arena
spots. The Theme System and the Coliseum are independent builders sharing only the `Plan`,
`PlanStore` and anchor infrastructure; the Coliseum is not themed.
