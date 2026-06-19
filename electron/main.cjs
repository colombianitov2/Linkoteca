const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, session, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

let mainWindow;
let appUrl;
let updaterState = { status: "idle", percent: 0, version: app.getVersion(), latest: app.getVersion() };
let lastUpdateCheck = null;

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

function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
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

function releaseNotesText(notes) {
  if (typeof notes === "string") return notes;
  if (!Array.isArray(notes)) return "";
  return notes.map((item) => typeof item === "string" ? item : item?.note || "").filter(Boolean).join("\n");
}

function configureAutoUpdater() {
  autoUpdater.setFeedURL({ provider: "github", owner: "colombianitov2", repo: "Linkoteca" });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("download-progress", (progress) => {
    updaterState = { ...updaterState, status: "downloading", percent: Math.round(progress.percent || 0) };
  });
  autoUpdater.on("update-downloaded", (info) => {
    updaterState = { ...updaterState, status: "downloaded", percent: 100, latest: info.version };
  });
  autoUpdater.on("error", (error) => {
    updaterState = { ...updaterState, status: "error", error: error.message };
  });
}

const updateController = {
  async check() {
    if (!app.isPackaged) return null;
    updaterState = { status: "checking", percent: 0, version: app.getVersion(), latest: app.getVersion() };
    lastUpdateCheck = await autoUpdater.checkForUpdates();
    const latest = lastUpdateCheck?.updateInfo?.version || app.getVersion();
    const available = Boolean(lastUpdateCheck?.isUpdateAvailable);
    updaterState = {
      status: available ? "update_available" : "current",
      percent: 0,
      version: app.getVersion(),
      latest,
      notes: releaseNotesText(lastUpdateCheck?.updateInfo?.releaseNotes)
    };
    return { ...updaterState, canAutoUpdate: available };
  },
  status() {
    return { ...updaterState };
  },
  async download() {
    if (!app.isPackaged) throw new Error("La actualización automática solo está disponible en la aplicación instalada");
    if (!lastUpdateCheck?.isUpdateAvailable) await this.check();
    if (!lastUpdateCheck?.isUpdateAvailable) return { ...updaterState };
    updaterState = { ...updaterState, status: "downloading", percent: 0 };
    await autoUpdater.downloadUpdate();
    return { ...updaterState };
  },
  install() {
    if (updaterState.status !== "downloaded") throw new Error("La actualización todavía no terminó de descargarse");
    updaterState = { ...updaterState, status: "installing" };
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 500);
    return { ...updaterState };
  }
};

async function startOwnedServer() {
  const port = process.env.LINKOTECA_PORT || await reserveFreePort();
  appUrl = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.LINKOTECA_NO_OPEN = "1";
  process.env.LINKOTECA_HOME = path.join(app.getPath("userData"), "workspace");

  const serverPath = path.join(__dirname, "..", "src", "server.js");
  const serverModule = await import(pathToFileURL(serverPath).href);
  serverModule.registerUpdateController(updateController);
  await waitForServer(`${appUrl}/api/library`);
}

async function createWindow() {
  await session.defaultSession.clearStorageData({ storages: ["cachestorage", "serviceworkers"] });
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: "Linkoteca",
    backgroundColor: "#fbfaf7",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`${appUrl}/?v=24`);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  configureAutoUpdater();
  await startOwnedServer();
  await createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
