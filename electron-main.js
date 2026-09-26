const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const net = require('net');

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const dev = false;
const hostname = 'localhost';

let mainWindow;

async function createWindow() {
  const port = await getAvailablePort();
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

// Try to read .env file from inside the app package first (if baked in via GitHub Secrets)
const dotenv = require('dotenv');
const exeDir = path.dirname(app.getPath('exe'));
const internalEnvPath = path.join(__dirname, '.env');
const externalEnvPath = path.join(exeDir, '.env');

if (fs.existsSync(internalEnvPath)) {
  dotenv.config({ path: internalEnvPath });
} else if (app.isPackaged && fs.existsSync(externalEnvPath)) {
  dotenv.config({ path: externalEnvPath });
} else {
  console.log(`No .env file found at ${internalEnvPath} or ${externalEnvPath}`);
  if (app.isPackaged) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Missing Configuration', `Please create a .env file next to the executable at: ${externalEnvPath}`);
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
