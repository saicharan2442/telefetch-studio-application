const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const getPort = require('get-port');
const fs = require('fs');

const dev = false;
const hostname = 'localhost';

let mainWindow;

async function createWindow() {
  const port = await getPort();
  const nextApp = next({ dev, hostname, port, dir: app.getAppPath() });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();
  
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      icon: path.join(__dirname, 'public', 'favicon.ico')
    });

    mainWindow.loadURL(`http://${hostname}:${port}`);
    
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
}

// Read .env file from the directory where the executable is located
const dotenv = require('dotenv');
const exeDir = path.dirname(app.getPath('exe'));
const envPath = app.isPackaged ? path.join(exeDir, '.env') : path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.log(`No .env file found at ${envPath}`);
  // In production, we could show a dialog to the user indicating they need a .env file.
  if (app.isPackaged) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Missing Configuration', `Please create a .env file next to the executable at: ${envPath}`);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
