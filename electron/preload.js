// Bridge to renderer: file saves + optional Steam persona
const { contextBridge, ipcRenderer } = require('electron');

let steam = null;
try {
  const Steamworks = require('steamworks.js'); // optional
  steam = Steamworks.init(480); // SpaceWar appId for dev tests
} catch { /* ok, works without Steam */ }

contextBridge.exposeInMainWorld('filesave', {
  read: (name) => ipcRenderer.invoke('save:read', name),
  write: (name, data) => ipcRenderer.invoke('save:write', name, data)
});

contextBridge.exposeInMainWorld('steam', {
  user: () => steam ? steam.utils.getPersonaName() : null
});
