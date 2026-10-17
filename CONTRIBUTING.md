# Contributing to Coliseum

Thanks for helping out. This guide covers setup, where things live, how to test, and how to send changes.

## Dev setup

You need:

- **Java 25** (Temurin 25: <https://adoptium.net>). Gradle, Minecraft 26.3 and Fabric are downloaded by the wrapper.
- **Node 22+** and git.

```sh
cd foreman && npm install      # orchestrator (TypeScript)
cd ../tools && npm install     # launchers, bridges, QA runner
```

Run the whole thing (Foreman + Fabric dev client):

```powershell
tools\launch.ps1 -Backend sim      # Windows, scripted demo team, no API calls
```

```sh
node tools/unix.mjs launch --backend sim     # macOS / Linux
```

Other useful commands:

```sh
cd foreman && npm run start -- --backend sim --reset   # Foreman alone (see foreman/README.md)
cd foreman && npm run tui                              # terminal fake-mod client
cd mod && ./gradlew build                              # jar -> mod/build/libs/
cd mod && ./gradlew runClient                          # dev client only
```

Mod build details, environment switches and Minecraft 26.3 API notes are in [mod/DEV.md](mod/DEV.md).
Launcher options are in [tools/README.md](tools/README.md).

## Repo layout

| Path | What lives there | Touch it for |
|---|---|---|
| `foreman/` | Node/TypeScript orchestrator, WebSocket protocol (`src/protocol.ts`) | agent logic, tasks, protocol changes |
| `mod/` | Fabric mod (Java 25, `src/main` + `src/client`) | in-game rendering, HQ builds, themes |
| `tools/` | launchers, bridges, DevBridge CLI, QA runner | bridge commands, launch flow, tests of tooling |
| `assets-src/` | source art and generators for textures/models | art assets (see `assets-src/README.md`) |
| `docs/` | spec, protocol, QA guide, images | documentation |

Common changes:

- **New theme:** `mod/src/main/java/dev/agentcraft/hq/Theme.java` and `ThemedHqBuilder.java`; theme choice is also handled in `tools/setup.mjs`.
- **New office bridge command:** `tools/openclaw-bridge.mjs` (arena commands: `tools/arena-bridge.mjs`).
- **Protocol message:** `foreman/src/protocol.ts`, then regenerate the doc (below).

## Running tests

```sh
cd foreman && npm run check    # tsc typecheck + vitest + protocol doc check
cd tools && npm test           # node --test
```

`npm run check` fails if `docs/protocol.md` is stale. After changing the protocol, regenerate it and commit the result:

```sh
cd foreman && npm run gen:protocol-doc
```

For visual changes, follow the screenshot QA guide in [docs/QA.md](docs/QA.md) (`node tools/qa.mjs`, scored against [docs/visual-bar.md](docs/visual-bar.md)).

## Branches, commits and pull requests

- Keep branches small and focused: one feature or fix per branch, branched from `main`.
- Write descriptive commit messages (what changed and why, not just "fix").
- Make sure the tests above pass before opening a PR, and add tests for new behavior.
- Include screenshots (or a short clip) in the PR for any visual change.
- **Never commit secrets:** `~/.openclaw-office/config.json`, API keys, tokens, or `.env` files stay out of the repo.

## Issues and feature requests

Open a GitHub issue. For bugs include your OS, Java and Node versions, the backend used (`sim`, `claude`, `codex`), what you expected, what happened, and relevant logs (`artifacts/logs/`). For feature requests describe the use case first, then the idea.

## License

The project is MIT licensed (see [LICENSE](LICENSE)). By contributing you agree your contributions are released under the same license.
