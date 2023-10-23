import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import { readFile } from "fs/promises";
import { logToFile, setLogDir } from "./utils";

const baseUrl = !app.isPackaged
  ? "http://localhost:3333"
  : `file://${path.join(__dirname, "..", "index.html")}`;

const folderPath = app.isPackaged ? process.resourcesPath : __dirname;
app.setPath("appData", folderPath);
app.setPath("userData", path.resolve(folderPath, "userData"));
app.setAppLogsPath(path.resolve(folderPath, "logs"));
setLogDir(path.resolve(folderPath, "logs"));

/* ------------------------------- BEGIN - MAIN WINDOW ------------------------------ */
let mainWindow = null;

const createMainWindow = async () => {
  logToFile("debug", "Loading servers...");

  const serverUrl = path.resolve(
    folderPath,
    `${app.isPackaged ? "extraResources\\" : ""}server.js`
  );

  /** Using eval is the only method that works with packaged executable for indeterminable reason. */
  eval(await readFile(serverUrl, { encoding: "utf8" }));

  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#111",
    webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false },
  });

  const remoteMain = await import("@electron/remote/main");
  remoteMain.initialize();
  remoteMain.enable(mainWindow.webContents);
  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: "bottom" });

  logToFile("debug", "Loading main window...");
  await mainWindow.loadURL(baseUrl);
  logToFile("debug", "Main window loaded.");

  mainWindow.on("close", () => {
    carouselWindows.forEach((win) => {
      win.close();
    });
  });
};

app.whenReady().then(async () => {
  return createMainWindow();
});

app.on("window-all-closed", app.quit);
/* ------------------------------- END - MAIN WINDOW ------------------------------ */

/* ------------------------------- BEGIN - CAROUSEL WINDOWS ------------------------------ */
let carouselWindows: BrowserWindow[] = [];

const createCarouselWindow = async ({ fileId, height, selectedFileIds, width }) => {
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

  if (
    (winWidth > screenWidth * 0.8 && winHeight > screenHeight * 0.5) ||
    (winWidth > screenWidth * 0.5 && winHeight > screenHeight * 0.8)
  )
    carouselWindow.maximize();

  const remoteMain = await import("@electron/remote/main");
  remoteMain.enable(carouselWindow.webContents);
  // if (!app.isPackaged) carouselWindow.webContents.openDevTools({ mode: "detach" });

  carouselWindow.show();

  logToFile("debug", "Loading carousel window...");
  await carouselWindow.loadURL(`${baseUrl}${app.isPackaged ? "#" : "/"}carousel`);
  logToFile("debug", "Carousel window loaded.");

  carouselWindow.webContents.send("init", { fileId, selectedFileIds });
  carouselWindows.push(carouselWindow);

  carouselWindow.on("close", () => {
    carouselWindows = carouselWindows.filter((win) => win.id !== carouselWindow.id);
  });

  return carouselWindow;
};

ipcMain.on("createCarouselWindow", (_, args) => {
  createCarouselWindow(args);
});
/* ------------------------------- END - CAROUSEL WINDOWS ------------------------------ */
