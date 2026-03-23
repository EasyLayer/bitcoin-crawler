import { config } from 'dotenv';
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from '../src/model';
import { GetBalanceQueryHandler } from '../src/query';

// Load .env from the project root.
// app.getAppPath() always returns the folder containing package.json —
// safe regardless of process.cwd() which varies by how Electron is launched.
config({ path: join(app.getAppPath(), '.env') });

// Tracks whether bootstrap() has fully completed.
// Renderer polls this via window.crawlerAPI.isReady() before sending queries.
let crawlerReady = false;

app.whenReady().then(async () => {
  // 1. Create the window FIRST so WebContents exists when
  //    ElectronIpcMainService initializes inside bootstrap().
  createWindow();

  // 2. Expose a ready-check channel so the renderer can poll until
  //    bootstrap is done before sending the first query.
  ipcMain.handle('crawler:ready', () => crawlerReady);

  // 3. Start the crawler after the window is open.
  bootstrap({
    Models: [AddressUtxoWatcher],
    QueryHandlers: [GetBalanceQueryHandler],
  })
    .then(() => {
      crawlerReady = true;
      console.log('[main] crawler ready');
    })
    .catch((err) => {
      console.error('[main] crawler failed to start:', err);
    });

  app.on('activate', () => {
    // On macOS re-create a window when the dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // esbuild outputs main.js and preload.js into the same folder: dist/electron/
      // so __dirname === dir of main.js and preload.js is right next to it
      preload: join(__dirname, 'preload.js'),
    },
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // In production load the static built renderer
    win.loadFile(join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
  }

  // Closing the window quits the whole app (including on macOS)
  win.on('close', () => {
    app.quit();
  });

  // Log preload errors to the main process console for easier debugging
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[main] preload error:', preloadPath, error);
  });
}

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
});
