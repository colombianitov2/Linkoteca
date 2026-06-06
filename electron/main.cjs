const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, shell } = require("electron");

const port = process.env.LINKOTECA_PORT || "4387";
const appUrl = `http://localhost:${port}`;

let mainWindow;

function requestOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitForServer(url, timeoutMs = 18000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await requestOk(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("No pude iniciar el servidor interno de Linkoteca.");
}

async function ensureServer() {
  if (await requestOk(`${appUrl}/api/library`)) return;

  process.env.PORT = port;
  process.env.LINKOTECA_NO_OPEN = "1";
  process.env.LINKOTECA_HOME = path.join(app.getPath("userData"), "workspace");

  const serverPath = path.join(__dirname, "..", "src", "server.js");
  await import(pathToFileURL(serverPath).href);
  await waitForServer(`${appUrl}/api/library`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: "Linkoteca",
    backgroundColor: "#fbfaf7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(appUrl);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await ensureServer();
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
