'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('coliseum', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: cfg => ipcRenderer.invoke('config:save', cfg),
  pickRepo: () => ipcRenderer.invoke('dialog:pickRepo'),
  start: cfg => ipcRenderer.invoke('foreman:start', cfg),
  stop: () => ipcRenderer.invoke('foreman:stop'),
  runState: () => ipcRenderer.invoke('foreman:state'),
  onLog: on('foreman:log'),
  onStatus: on('foreman:status'),
});
