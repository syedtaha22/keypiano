'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 560,
    height: 400,
    minWidth: 480,
    minHeight: 340,
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
    if (BrowserWindow.getAllWindows().length === 0) {createWindow();}
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {app.quit();}
});
