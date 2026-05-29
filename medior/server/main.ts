import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import { startServers } from "medior/server/server";
import { dayjs } from "medior/utils/common";
import { getConfig, loadConfig, setupTRPC } from "medior/utils/server";
const remoteMain = require("@electron/remote/main");

/* -------------------------------------------------------------------------- */
/*                                   CONFIG                                   */
/* -------------------------------------------------------------------------- */
const isPackaged = app.isPackaged;
const isBundled = isPackaged || !!process.env.BUILD_DEV;

const rootDir = path.resolve(__dirname, "..", "..");
const baseUrl = isBundled
  ? `file://${path.resolve(rootDir, "..", isPackaged ? "" : "build", "index.html")}`
  : `http://localhost:3333${!!process.env.HMR ? "/index.hmr.html" : ""}`;

const folderPath = isPackaged ? process.resourcesPath : rootDir;
const configPath = path.resolve(folderPath, "..", "config.json");
ipcMain.handle("getConfigPath", () => configPath);

const logsDir = path.resolve(folderPath, "..", "logs", dayjs().format("YYYY-MM-DD"));
process.env.LOGS_PATH = path.resolve(logsDir, `${dayjs().format("HH[h]mm[m]ss[s]")}.log`);
setLogsPath(process.env.LOGS_PATH);

app.setAppLogsPath(logsDir);
app.setPath("appData", folderPath);
app.setPath("userData", path.resolve(folderPath, "userData"));

/* -------------------------------------------------------------------------- */
/*                                 MAIN WINDOW                                */
/* -------------------------------------------------------------------------- */
ipcMain.handle("reload", () => {
  app.relaunch();
  app.exit(0);
});

let mainWindow = null;

const createMainWindow = async () => {
  try {
    fileLog("Loading servers...");
    await startServers(configPath, process.env.LOGS_PATH);

    fileLog("Creating main window...");
    mainWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      show: false,
      webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false },
    });

    remoteMain.initialize();
    remoteMain.enable(mainWindow.webContents);

    mainWindow.maximize();
    mainWindow.show();
    if (!isPackaged) {
      const mode = getConfig().dev.devTools.home;
      if (mode) mainWindow.webContents.openDevTools({ mode });
    }

    fileLog("Loading main window...");
    await mainWindow.loadURL(baseUrl);
    fileLog("Main window loaded.");

    mainWindow.on("close", () =>
      [...carouselWindows, ...searchWindows].forEach((win) => win.close()),
    );
  } catch (err) {
    fileLog(err.stack, { type: "error" });
  }
};

app.whenReady().then(async () => {
  await loadConfig(configPath);
  setupTRPC();
  return createMainWindow();
});

app.on("window-all-closed", app.quit);

/* -------------------------------------------------------------------------- */
/*                               SEARCH WINDOWS                               */
/* -------------------------------------------------------------------------- */
let searchWindows: BrowserWindow[] = [];

const createSearchWindow = async ({ tagIds }) => {
  try {
    const searchWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        nodeIntegrationInSubFrames: true,
        webSecurity: false,
      },
    });

    searchWindow.maximize();
    remoteMain.enable(searchWindow.webContents);
    searchWindow.show();

    if (!isPackaged) {
      const mode = getConfig().dev.devTools.search;
      if (mode) searchWindow.webContents.openDevTools({ mode });
    }

    fileLog("Creating search window...");
    await searchWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}search`);
    fileLog("Search window created.");

    setTimeout(() => searchWindow.webContents.send("init", { tagIds }), 100);
    searchWindows.push(searchWindow);

    searchWindow.on("close", () => {
      searchWindows = searchWindows.filter((win) => win.id !== searchWindow.id);
    });

    return searchWindow;
  } catch (err) {
    fileLog(err.stack, { type: "error" });
  }
};

ipcMain.on("createSearchWindow", (_, args) => createSearchWindow(args));

/* -------------------------------------------------------------------------- */
/*                              CAROUSEL WINDOWS                              */
/* -------------------------------------------------------------------------- */
let carouselWindows: BrowserWindow[] = [];

const createCarouselWindow = async ({ fileId, height, selectedFileIds, width }) => {
  try {
    fileLog("Creating carousel window...");

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const winWidth = Math.min(width, screenWidth);
    const winHeight = Math.min(height, screenHeight);

    const carouselWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      width: winWidth,
      height: winHeight,
      show: false,
      useContentSize: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        nodeIntegrationInSubFrames: true,
        webSecurity: false,
      },
    });

    carouselWindow.maximize();
    remoteMain.enable(carouselWindow.webContents);
    carouselWindow.show();

    if (!isPackaged) {
      const mode = getConfig().dev.devTools.carousel;
      if (mode) carouselWindow.webContents.openDevTools({ mode });
    }

    fileLog("Loading carousel window...");
    await carouselWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}carousel`);
    fileLog("Carousel window loaded.");

    setTimeout(() => carouselWindow.webContents.send("init", { fileId, selectedFileIds }), 500);
    carouselWindows.push(carouselWindow);

    carouselWindow.on("close", () => {
      carouselWindows = carouselWindows.filter((win) => win.id !== carouselWindow.id);
    });

    return carouselWindow;
  } catch (err) {
    fileLog(err.stack, { type: "error" });
  }
};

ipcMain.on("createCarouselWindow", (_, args) => createCarouselWindow(args));
