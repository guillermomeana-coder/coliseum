# OpenClaw Office

**Your AI development team, working inside a Minecraft office you can walk around in.**

A fork of [AgentCraft](https://github.com/blendi-remade/agentcraft) by [Blendi](https://github.com/blendi-remade), enhanced with:

- **6 Office Themes** -- Warm Studio, Modern Glass, Executive, Industrial, Minimal, Penthouse
- **Coliseum Arena** -- Roman Colosseum-inspired debate arena with 8 podiums and tiered seating
- **OpenClaw Bridge** -- control the team from Claude Code or any CLI without opening Minecraft
- **Smart Autopilot** -- auto-approves permissions, validates merges (CI + size + sensitive files)
- **Setup Wizard** -- interactive config for auth (Claude Login or API key), theme, and repos
- **Bypass Permissions** -- agents work autonomously without stopping to ask
- **Headless Mode** -- run the team without the Minecraft window (`--NoGame`)
- **Multi-repo** -- register multiple repos and target goals to specific projects

## Quick Start

```bash
# 1. Setup (interactive)
node tools/setup.mjs

# 2. Launch (headless — agents work, no game window)
node tools/launch-openclaw.mjs

# 3. Or with Minecraft window
node tools/launch-openclaw.mjs --game

# 4. Control from CLI
node tools/openclaw-bridge.mjs status
node tools/openclaw-bridge.mjs goal "Add dark mode to the settings page"
node tools/openclaw-bridge.mjs watch
```

## The Bridge (CLI Integration)

The OpenClaw Bridge lets you orchestrate the team from any terminal:

```bash
node tools/openclaw-bridge.mjs status                    # team overview + cost
node tools/openclaw-bridge.mjs agents                    # who's doing what
node tools/openclaw-bridge.mjs goal "..." [--repo name]  # submit work (optionally to a specific repo)
node tools/openclaw-bridge.mjs tasks [goalId]            # task board
node tools/openclaw-bridge.mjs decisions                 # pending decisions
node tools/openclaw-bridge.mjs merge <id>                # approve a merge
node tools/openclaw-bridge.mjs diff <worktree>           # review changes
node tools/openclaw-bridge.mjs msg <agent|all> "..."     # message an agent
node tools/openclaw-bridge.mjs repos                     # list registered repos
node tools/openclaw-bridge.mjs cost                      # total API cost
node tools/openclaw-bridge.mjs watch                     # live event stream
node tools/openclaw-bridge.mjs autopilot                 # auto-approve with smart merge criteria
node tools/openclaw-bridge.mjs run "goal" --autopilot    # submit + watch + auto-approve in one
```

## Office Themes

| Theme | Style |
|-------|-------|
| `warm_studio` | Original -- timber frame, copper dome, plaster walls, parquet floors |
| `modern_glass` | Contemporary -- quartz, glass, iron, polished stone |
| `executive` | Premium -- deepslate, dark oak, tinted glass, soul lanterns |
| `industrial` | Loft -- exposed brick, iron, spruce, concrete |
| `minimal` | Clean -- white quartz, birch, light gray, very minimal |
| `penthouse` | Luxury -- blackstone, gilded accents, crimson wood, red sofas |

### Arena Maps

| Map | Style |
|-----|-------|
| `coliseum` | Roman Colosseum -- elliptical amphitheater, sandstone, 8 debate podiums |

Switch in-game: `/agentcraft hq coliseum` or `/agentcraft hq openclaw`

## Arena — Battle Royale Mode

Run a battle royale where 16-100 AI agents debate a topic simultaneously:

```bash
# Start arena
node tools/arena-bridge.mjs start "Best frontend framework for our stack" --agents 16

# Watch live
node tools/arena-bridge.mjs spectate

# Check standings
node tools/arena-bridge.mjs scoreboard
```

In Minecraft: fly above the arena in spectator mode and watch agents argue in real-time with speech bubbles.

Set via `node tools/setup.mjs` or `node tools/setup.mjs --theme executive`.

## Requirements

- **Java 25** ([Eclipse Temurin](https://adoptium.net/))
- **Node.js 22+**
- **Minecraft: Java Edition** (for visual mode; not needed for headless)
- **Claude API key** or **Claude Max subscription**

## Project Structure

```
foreman/        TypeScript backend — manages agents, tasks, decisions, repos
mod/            Fabric mod (Java) — the Minecraft client with HQ, agents, UI
tools/          CLI tools — launcher, bridge, setup wizard, dev utilities
assets-src/     Asset pipeline — block models, textures, skins, UI style tokens
docs/           Protocol spec, console design, QA guides
sandbox/        Demo scaffolding for the sim backend
```

## Configuration

Run `node tools/setup.mjs` to configure interactively, or use flags:

```bash
node tools/setup.mjs --auth api-key --key YOUR_API_KEY_HERE
node tools/setup.mjs --auth claude-login
node tools/setup.mjs --theme modern_glass
```

Config is stored in `~/.openclaw-office/config.json` (never committed).

## License

MIT License. See [LICENSE](./LICENSE) for the full text.

## Credits

Built on [AgentCraft](https://github.com/blendi-remade/agentcraft) by [Blendi](https://github.com/blendi-remade). Enhanced by [OpenClaw](https://github.com/openclaw).
