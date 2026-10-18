'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const os = require('node:os');
const path = require('node:path');
const config = require('./lib/config');

let win = null;

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
}

function registerIpc() {
  ipcMain.handle('config:load', () => ({
    config: config.loadConfig(),
    themes: config.THEMES,
    authMethods: config.AUTH_METHODS,
    hqModes: config.HQ_MODES,
  }));

  ipcMain.handle('config:save', (_e, cfg) => {
    const errors = config.validateConfig(cfg);
    if (errors.length) return { ok: false, errors };
    return { ok: true, path: config.saveConfig(undefined, cfg) };
  });

  ipcMain.handle('dialog:pickRepo', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  // Stub: T4 wires this to the Foreman launcher.
  ipcMain.handle('foreman:start', () => ({ ok: false, reason: 'not wired' }));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
