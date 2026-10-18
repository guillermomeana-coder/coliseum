'use strict';
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('./lib/config');
const { Launcher, resolvePaths } = require('./lib/launcher');
const { StatusWatcher } = require('./lib/tray-status');
const { LogBuffer } = require('./lib/log-buffer');

const OFFLINE = { tooltip: 'Coliseum — Foreman offline', level: 'offline', menuItems: [{ label: 'Foreman offline' }] };

let win = null;
let tray = null;
let watcher = null;
let launcher = null;
let quitting = false;
let cleanedUp = false;
let lastSummary = OFFLINE;
const logs = new LogBuffer(200);

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function getLauncher() {
  if (launcher) return launcher;
  const paths = resolvePaths({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appDir: __dirname });
  // Packaged builds have no system node: run children through Electron itself as node.
  launcher = new Launcher({
    paths,
    execPath: app.isPackaged ? process.execPath : (process.env.COLISEUM_NODE || 'node'),
    useElectronNode: app.isPackaged,
  });
  launcher.on('log', (line, source) => send('foreman:log', logs.push(line, source)));
  launcher.on('status', (s) => {
    send('foreman:status', s);
    if (s === 'stopped' || s === 'crashed') setWatcher(null);
    updateTray();
  });
  return launcher;
}

function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 680,
    title: 'Coliseum',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => {
    // Keep Foreman running in the tray when the window is closed.
    if (!quitting && launcher && launcher.isRunning()) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
}

function trayIcon(level) {
  const file = path.join(__dirname, 'assets', `tray-${level}.png`);
  return fs.existsSync(file) ? nativeImage.createFromPath(file) : nativeImage.createEmpty();
}

function updateTray() {
  if (!tray) return;
  const running = launcher && launcher.isRunning();
  tray.setImage(trayIcon(lastSummary.level));
  tray.setToolTip(lastSummary.tooltip);
  tray.setContextMenu(Menu.buildFromTemplate([
    ...lastSummary.menuItems.map((m) => ({ label: m.label, enabled: false })),
    { type: 'separator' },
    { label: 'Show window', click: showWindow },
    running
      ? { label: 'Stop Foreman', click: () => getLauncher().stop() }
      : { label: 'Start Foreman', click: () => startForeman().catch(() => {}) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

/** (Re)creates the Foreman status watcher; port null = stop watching. */
function setWatcher(port) {
  if (watcher) { watcher.close(); watcher.removeAllListeners(); watcher = null; }
  if (port == null) {
    lastSummary = OFFLINE;
    updateTray();
    return;
  }
  watcher = new StatusWatcher({ port });
  watcher.on('update', (s) => { lastSummary = s; updateTray(); });
  watcher.start().catch(() => {});
}

async function startForeman(cfg) {
  const conf = cfg || config.loadConfig();
  const errors = config.validateConfig(conf);
  if (errors.length) return { ok: false, errors };
  logs.clear();
  await getLauncher().start({ config: conf });
  setWatcher(Number(conf.port || process.env.AGENTCRAFT_PORT || 7878));
  updateTray();
  return { ok: true };
}

function registerIpc() {
  ipcMain.handle('config:load', () => {
    const cfg = config.loadConfig();
    const exists = fs.existsSync(config.resolveReadPath());
    return {
      config: cfg,
      valid: exists && config.validateConfig(cfg).length === 0,
      themes: config.THEMES,
      authMethods: config.AUTH_METHODS,
      hqModes: config.HQ_MODES,
    };
  });

  ipcMain.handle('config:save', (_e, cfg) => {
    const errors = config.validateConfig(cfg);
    if (errors.length) return { ok: false, errors };
    return { ok: true, path: config.saveConfig(undefined, cfg) };
  });

  ipcMain.handle('dialog:pickRepo', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  ipcMain.handle('foreman:start', async (_e, cfg) => {
    try {
      return await startForeman(cfg);
    } catch (err) {
      return { ok: false, errors: [err.message] };
    }
  });

  ipcMain.handle('foreman:stop', async () => { await getLauncher().stop(); return { ok: true }; });

  ipcMain.handle('foreman:state', () => ({ status: launcher ? launcher.status : 'stopped', logs: logs.lines() }));
}

function waitStopped(l, ms) {
  return new Promise((resolve) => {
    if (!l.children.size) return resolve();
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); l.removeListener('exit', check); resolve(); }
    function check() { if (!l.children.size) done(); }
    l.on('exit', check);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    registerIpc();
    tray = new Tray(trayIcon('offline'));
    tray.on('click', showWindow);
    updateTray();
    createWindow();
    app.on('activate', showWindow);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (e) => {
    quitting = true;
    if (cleanedUp) return;
    e.preventDefault();
    cleanedUp = true;
    if (watcher) watcher.close();
    const l = launcher;
    Promise.resolve(l ? l.stop() : null)
      .then(() => (l ? waitStopped(l, 4000) : null))
      .catch(() => {})
      .finally(() => { if (tray) tray.destroy(); app.quit(); });
  });
}
