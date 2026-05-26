'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    title: 'KeyPiano',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.setMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); }
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update ready',
    message: 'A new version of KeyPiano has been downloaded. Restart to apply it.',
    buttons: ['Restart now', 'Later'],
  }).then(({ response }) => {
    if (response === 0) { autoUpdater.quitAndInstall(); }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {app.quit();}
});
