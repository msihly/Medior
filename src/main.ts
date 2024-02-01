import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import { readFile } from "fs/promises";
import { dayjs, logToFile, setLogsPath } from "./utils";

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

/* ------------------------------- BEGIN - MAIN WINDOW ------------------------------ */
let mainWindow = null;

const createMainWindow = async () => {
  logToFile("debug", "Loading servers...");

  const serverUrl = path.resolve(folderPath, `${isPackaged ? "extraResources\\" : ""}server.js`);

  /** Using eval is the only method that works with packaged executable for indeterminable reason. */
  eval(await readFile(serverUrl, { encoding: "utf8" }));

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
  return createMainWindow();
});

app.on("window-all-closed", app.quit);
/* ------------------------------- END - MAIN WINDOW ------------------------------ */

/* ------------------------------- BEGIN - SEARCH WINDOWS ------------------------------ */
let searchWindows: BrowserWindow[] = [];

const createSearchWindow = async () => {
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

    logToFile("debug", "Creating search window...");
    await searchWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}search`);
    logToFile("debug", "Search window created.");

    searchWindows.push(searchWindow);

    searchWindow.on("close", () => {
      searchWindows = searchWindows.filter((win) => win.id !== searchWindow.id);
    });

    return searchWindow;
  } catch (err) {
    logToFile("error", JSON.stringify(err, null, 2));
  }
};

ipcMain.on("createSearchWindow", () => createSearchWindow());
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

    /** Use dimensions of file as window size, or maximize if too large */
    if (
      (winWidth > screenWidth * 0.8 && winHeight > screenHeight * 0.5) ||
      (winWidth > screenWidth * 0.5 && winHeight > screenHeight * 0.8)
    )
      carouselWindow.maximize();

    const remoteMain = await import("@electron/remote/main");
    remoteMain.enable(carouselWindow.webContents);

    carouselWindow.show();

    logToFile("debug", "Loading carousel window...");
    await carouselWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}carousel`);
    logToFile("debug", "Carousel window loaded.");

    carouselWindow.webContents.send("init", { fileId, selectedFileIds });
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
