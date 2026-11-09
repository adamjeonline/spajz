// Based on Boxshelf by sassiestrhihno (https://github.com/sassiestrhihno/boxshelf-source, GPL-3.0): this file is the same as Boxshelf's
// preload-wum.js apart from the app's name (Špajz).
// Bridge for the hidden Wii U manual renderer window (renderer/wiiu-manual.html)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wum', {
  onModel: cb => ipcRenderer.on('wum:model', (e, m) => cb(m)), // every job sent: the background helper windows are reused
  done: (err, pages) => ipcRenderer.send('wum:done', err, pages)
});
