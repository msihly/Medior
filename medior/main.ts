import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import { dayjs, loadConfig, logToFile, setLogsPath, setupTRPC } from "./utils";
import { startServers } from "./server.js";

const isPackaged = app.isPackaged;
const isBundled = isPackaged || !!process.env.BUILD_DEV;

const baseUrl = isBundled
  ? `file://${path.join(__dirname, "..", isPackaged ? "" : "build", "index.html")}`
  : `http://localhost:3333${!!process.env.HMR ? "/index.hmr.html" : ""}`;

const folderPath = isPackaged ? process.resourcesPath : __dirname;
app.setPath("appData", folderPath);
app.setPath("userData", path.resolve(folderPath, "userData"));

const logsDir = path.resolve(folderPath, "..", "logs", dayjs().format("YYYY-MM-DD"));
const logsPath = path.resolve(logsDir, `${dayjs().format("HH[h]mm[m]ss[s]")}.log`);
app.setAppLogsPath(logsDir);
ipcMain.handle("getLogsPath", () => logsPath);

const configPath = path.resolve(folderPath, "..", "config.json");
ipcMain.handle("getConfigPath", () => configPath);
ipcMain.handle("reloadConfig", () => loadConfig(configPath));

/* ------------------------------- BEGIN - MAIN WINDOW ------------------------------ */
let mainWindow = null;

const createMainWindow = async () => {
  logToFile("debug", "Loading servers...");
  await startServers();

  logToFile("debug", "Creating main window...");
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#111",
    show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false },
  });

  mainWindow.maximize();

  const remoteMain = await import("@electron/remote/main");
  remoteMain.initialize();
  remoteMain.enable(mainWindow.webContents);

  mainWindow.show();
  if (!isPackaged) mainWindow.webContents.openDevTools({ mode: "left" });

  logToFile("debug", "Loading main window...");
  await mainWindow.loadURL(baseUrl);
  logToFile("debug", "Main window loaded.");

  mainWindow.on("close", () =>
    [...carouselWindows, ...searchWindows].forEach((win) => win.close())
  );
};

app.whenReady().then(async () => {
  await setLogsPath(logsPath);
  await loadConfig(configPath);
  setupTRPC();
  return createMainWindow();
});

app.on("window-all-closed", app.quit);
/* ------------------------------- END - MAIN WINDOW ------------------------------ */

/* ------------------------------- BEGIN - SEARCH WINDOWS ------------------------------ */
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

    const remoteMain = await import("@electron/remote/main");
    remoteMain.enable(searchWindow.webContents);

    searchWindow.show();
    if (!isPackaged) searchWindow.webContents.openDevTools({ mode: "left" });

    logToFile("debug", "Creating search window...");
    await searchWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}search`);
    logToFile("debug", "Search window created.");

    setTimeout(() => searchWindow.webContents.send("init", { tagIds }), 100);
    searchWindows.push(searchWindow);

    searchWindow.on("close", () => {
      searchWindows = searchWindows.filter((win) => win.id !== searchWindow.id);
    });

    return searchWindow;
  } catch (err) {
    logToFile("error", JSON.stringify(err, null, 2));
  }
};

ipcMain.on("createSearchWindow", (_, args) => createSearchWindow(args));
/* ------------------------------- END - SEARCH WINDOWS ------------------------------ */

/* ------------------------------- BEGIN - CAROUSEL WINDOWS ------------------------------ */
let carouselWindows: BrowserWindow[] = [];

const createCarouselWindow = async ({ fileId, height, selectedFileIds, width }) => {
  try {
    logToFile("debug", "Creating carousel window...");

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

    const remoteMain = await import("@electron/remote/main");
    remoteMain.enable(carouselWindow.webContents);

    carouselWindow.show();

    if (!isPackaged) carouselWindow.webContents.openDevTools({ mode: "left" });

    logToFile("debug", "Loading carousel window...");
    await carouselWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}carousel`);
    logToFile("debug", "Carousel window loaded.");

    setTimeout(() => carouselWindow.webContents.send("init", { fileId, selectedFileIds }), 100);
    carouselWindows.push(carouselWindow);

    carouselWindow.on("close", () => {
      carouselWindows = carouselWindows.filter((win) => win.id !== carouselWindow.id);
    });

    return carouselWindow;
  } catch (err) {
    logToFile("error", JSON.stringify(err, null, 2));
  }
};

ipcMain.on("createCarouselWindow", (_, args) => createCarouselWindow(args));
/* ------------------------------- END - CAROUSEL WINDOWS ------------------------------ */
