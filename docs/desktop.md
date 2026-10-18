# Coliseum desktop app

An Electron app (`desktop/`) with a setup wizard, a Foreman + bridge launcher and a tray status icon. It packages into a single Windows executable, `coliseum.exe`.

## Run in development

```
cd desktop
npm install
npm start
```

In dev the app uses the repo root (`desktop/..`) for `foreman/` and `tools/`, so install their dependencies first (`cd foreman && npm ci`, `cd tools && npm ci`).

Tests (plain Node, no Electron): `node --test desktop/test/`.

## Build

```
cd desktop
npm run dist     # electron-builder --win portable nsis
npm run pack     # electron-builder --win --dir (unpacked app, fast check)
```

`predist` / `prepack` run `scripts/prepare-resources.mjs`, which runs `npm ci --omit=dev` in `foreman/` and `tools/` when their `node_modules` is missing, then adds `tsx` back into `foreman/` (it is a devDependency there, but Foreman is started with `node --import tsx` at runtime). If `node_modules` already exists it is shipped as is, so for a lean build delete it first and let the script reinstall.

### Output

All build output goes to `desktop/dist/` (git-ignored):

| File | What |
| --- | --- |
| `coliseum.exe` | Portable build, no install |
| `coliseum-setup-<version>.exe` | NSIS installer |
| `win-unpacked/` | Unpacked app (from `npm run pack`) |

The icon is a placeholder at `desktop/assets/icon.ico`; replace it with a real multi-size `.ico` (256x256 minimum).

## Packaged layout

```
resources/
  app.asar                  desktop main.js, lib/, renderer/, assets/
  app-root/
    foreman/                src/, package.json, node_modules/ (incl. tsx)
    tools/                  bridge.mjs, setup.mjs, lib/, package.json, node_modules/
```

`desktop/lib/launcher.js` (`resolvePaths`) resolves `<resourcesPath>/app-root/{foreman,tools}` when packaged. Tests and logs are excluded from the copy.

## Bundled Node

No separate Node install is needed. Foreman and the bridge are started as child processes of the app's own executable (`process.execPath`) with `ELECTRON_RUN_AS_NODE=1`, which makes Electron behave as a plain Node runtime. Foreman's TypeScript runs through `--import tsx`. The bundled Node version is whatever the Electron release ships; Electron 44 ships Node 24, which satisfies Foreman's `>=22` requirement. If you bump Electron, keep it on a release whose Node is still >=22.

Java 25 and Minecraft are still required on the host for visual mode; see `node tools/doctor.mjs`.

## Troubleshooting

- **`npm run dist` fails downloading Electron/NSIS tools:** needs network access the first time; electron-builder caches in `%LOCALAPPDATA%\electron-builder\Cache`. Corporate proxies need `HTTPS_PROXY`.
- **"Cannot create symbolic link" while extracting winCodeSign:** enable Windows Developer Mode or run the shell as administrator, then retry. For a quick unsigned check without it: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win --dir -c.win.signAndEditExecutable=false` (skips icon/metadata embedding in the exe).
- **Packaged app: Foreman does not start:** confirm `resources/app-root/foreman/node_modules/tsx` exists. If you installed with plain `npm ci --omit=dev` by hand, tsx is missing; run `scripts/prepare-resources.mjs` after deleting `foreman/node_modules`.
- **Bridge cannot find `ws`/`pngjs`:** `tools/node_modules` was not installed before packaging.
- **Antivirus/SmartScreen warns on `coliseum.exe`:** the build is unsigned.
- **Huge installer:** `foreman/node_modules` was a full dev install; delete it and rebuild.
