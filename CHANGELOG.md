# Changelog

All notable changes to this project are documented here, in the style of
[Keep a Changelog](https://keepachangelog.com). Newest version first.

> The repository has no git tags. Versions below were **reconstructed from the
> commit history** and group related work into logical releases; they do not
> correspond to published tags. `t<N>` refers to the internal task numbers used
> in commit messages.

## [Unreleased]

### Added
- Desktop app packaging: electron-builder config producing `coliseum.exe` (portable) and an NSIS installer, resource preparation script and `docs/desktop.md` (t52).

## [Foreman 1.0.0]

### Changed
- Bumped `foreman` package version from 0.1.0 to 1.0.0 (t45).

## [2.0.0] - Coliseum rename

### Added
- Root `package.json` with `setup`, `launch`, `bridge` and `arena` npm scripts (t38).
- `COLISEUM_*` environment variables for the launcher and setup wizard (t37).
- Guillermo added as project author.

### Changed
- Project renamed from OpenClaw to Coliseum across the builders, themes and text (t35, t36).
- Themed HQ builder id is now `coliseum_office`; launcher and setup use it (t35, t37).
- Legacy `OPENCLAW_HQ_DEFAULT` is still honoured and maps `coliseum_office` to `openclaw` (t37).

## [1.4.0] - Coliseum details, palettes and docs

### Added
- Sandstone patterns on the arena floor (t7).
- Banners on the outer wall pillars (t8).
- Podiums with polished diorite columns at each gate (t9).
- Spectator view from above the arena centre (t10).
- `/agentcraft spectate` toggle command (t11).
- Clear weather and midnight time set when the Coliseum is built (t12).
- Fire on top of every 4th outer-wall pillar (t13).
- Red carpet from the south gate to the champion stage (t14, t16).
- Triggerable note blocks under the champion stage (t17).
- Iron-bar portcullis at the 4 gates, with a raise/lower command (t18).
- Iron-armored armor-stand guards at each gate (t19).
- `ThemedColiseumBuilder` wrapper and palette infrastructure (t26).
- `coliseum_nether` and `coliseum_ice` palettes (t27, t28).
- Launcher passes the HQ mode to the mod, which picks its default builder from it (t29, t30).
- `--hq-mode` option documented in the setup wizard usage header (t32).

### Fixed
- Main build broken by a duplicate `redCarpet` in `ColiseumBuilder` (t22).

### Documentation
- `CONTRIBUTING.md` (t21).
- README: Features, per-mode quickstarts, screenshots, contributing section (t20).
- `ARCHITECTURE.md`: overview, Foreman, mod, protocol (t23), Bridge CLI and Arena Bridge (t24), Theme System and ColiseumBuilder (t25).
- README documents Coliseum variants and `--hq-mode` (t33).

## [1.3.0] - Coliseum and battle royale arena

### Added
- `ColiseumBuilder` v1: circular debate arena with 8 podiums, tiered seating, pillars and a gate.
- `ColiseumBuilder` v2: Roman Colosseum-inspired elliptical arena with a sandstone/diorite palette and 4 axial gates.
- Battle royale arena with 100 spots.
- Arena bridge CLI.
- Arena protocol events: score, eliminate and crown, integrated with the Foreman.
- Scoreboard wall (`TaskBoardBlock`) in the Coliseum.
- Arena simulate mode: fake battle royale for visual testing without AI.
- Setup wizard HQ mode selection (Office vs Coliseum).

### Changed
- Theme swapping now covers every themed block.

## [1.2.0] - Themes and multi-repo

### Added
- 6 office themes.
- Multi-repo bridge support.
- `repos` and `cost` commands.

### Documentation
- Improved docs.

## [1.1.0] - Autopilot

### Added
- Autopilot mode and the `run` command.
- Smart autopilot safety checks before auto-merge: CI status, diff size limits and sensitive file detection.

### Changed
- Stairs and slabs swap with the theme according to state.

## [1.0.0] - Initial release

### Added
- OpenClaw Office: an AI dev team working in a Minecraft office.
