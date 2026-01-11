// Electron main: window, IPC for saves (file), load index.html
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    backgroundColor: '#0a0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Simple saves in userData/saves/save.json
const SAVE_DIR = path.join(app.getPath('userData'), 'saves');

ipcMain.handle('save:read', async (_evt, fname) => {
  try {
    if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
    const fp = path.join(SAVE_DIR, fname);
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, 'utf8');
  } catch (e) {
    console.error('save:read', e);
    return null;
  }
});

ipcMain.handle('save:write', async (_evt, fname, data) => {
  try {
    if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
    const fp = path.join(SAVE_DIR, fname);
    fs.writeFileSync(fp, data, 'utf8');
    return true;
  } catch (e) {
    console.error('save:write', e);
    return false;
  }
});
