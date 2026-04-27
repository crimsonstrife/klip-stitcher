import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initializeAutoUpdates } from './autoUpdate';
import { registerIpcHandlers } from './ipc/handlers';

// Surface fatal errors to stderr and exit with a non-zero code instead of
// the default Electron dialog. Lets CI / smoke tests detect crashes via
// exit code (124 from `timeout` = still alive = good; non-zero quick = crash).
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  app.exit(1);
});

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Diagnostic event handlers — forward renderer-side failures to main stdout
  // so they're visible without DevTools (necessary for CI/automated checks).
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[render-process-gone]', JSON.stringify(details));
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error);
  });
  mainWindow.webContents.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`);
  });
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, code, desc, url) => {
      console.error('[did-fail-load]', code, desc, url);
    },
  );
  mainWindow.webContents.on('did-start-loading', () => console.log('[load] start'));
  mainWindow.webContents.on('did-finish-load', () => console.log('[load] finish'));
  mainWindow.webContents.on('dom-ready', () => console.log('[load] dom-ready'));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  registerIpcHandlers(ipcMain, () => mainWindow);
  createWindow();
  initializeAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
