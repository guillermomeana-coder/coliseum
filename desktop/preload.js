'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coliseum', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: cfg => ipcRenderer.invoke('config:save', cfg),
  pickRepo: () => ipcRenderer.invoke('dialog:pickRepo'),
  start: cfg => ipcRenderer.invoke('foreman:start', cfg),
});
