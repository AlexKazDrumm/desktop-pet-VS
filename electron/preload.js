// Мост в рендер: файл-сейвы + опциональный Steam persona
const { contextBridge, ipcRenderer } = require('electron');

let steam = null;
try {
  const Steamworks = require('steamworks.js'); // не обязателен
  steam = Steamworks.init(480); // SpaceWar appId для дев-тестов
} catch { /* ок, без Steam тоже работаем */ }

contextBridge.exposeInMainWorld('filesave', {
  read: (name) => ipcRenderer.invoke('save:read', name),
  write: (name, data) => ipcRenderer.invoke('save:write', name, data)
});

contextBridge.exposeInMainWorld('steam', {
  user: () => steam ? steam.utils.getPersonaName() : null
});
