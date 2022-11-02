const { app, BrowserWindow, ipcMain, screen } = require("electron");
const remoteMain = require("@electron/remote/main");
remoteMain.initialize();

const path = require("path");
const fs = require("fs/promises");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { DB_PATH, DB_PORT } = require("./env");

const baseUrl = !app.isPackaged
  ? "http://localhost:3000"
  : `file://${path.join(__dirname, "../build/index.html")}`;

/* ------------------------------- BEGIN - MAIN WINDOW ------------------------------ */
let mainWindow = null;
let mongoServer = null;

const createDbServer = async () => {
  const dbPathExists = await fs.stat(DB_PATH).catch(() => false);
  if (!dbPathExists) await fs.mkdir(DB_PATH, { recursive: true });

  return await MongoMemoryReplSet.create({
    instanceOpts: [
      {
        dbPath: DB_PATH,
        port: DB_PORT,
        storageEngine: "wiredTiger",
      },
    ],
    replSet: { dbName: "media-viewer", name: "rs0" },
  });
};

const createMainWindow = async () => {
  mongoServer = await createDbServer();

  mainWindow = new BrowserWindow({
    backgroundColor: "#111",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
    },
  });

  remoteMain.enable(mainWindow.webContents);
  await mainWindow.loadURL(baseUrl);

  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: "bottom" });

  ipcMain.handle("getDatabaseUri", async () => {
    return mongoServer.getUri();
  });
};

app.whenReady().then(async () => {
  if (!app.isPackaged) {
    const {
      default: installExtension,
      REACT_DEVELOPER_TOOLS,
      REDUX_DEVTOOLS,
    } = require("electron-devtools-installer");

    await installExtension([REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS]).catch((err) =>
      console.error("Error loading extensions:", err)
    );
  }

  return createMainWindow();
});

app.on("window-all-closed", app.quit);
/* ------------------------------- END - MAIN WINDOW ------------------------------ */

/* ------------------------------- BEGIN - CAROUSEL WINDOWS ------------------------------ */
const createCarouselWindow = async ({ fileId, height, selectedFileIds, width }) => {
  console.debug("Creating carousel window...");

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const winWidth = Math.min(width, screenWidth);
  const winHeight = Math.min(height, screenHeight);

  const window = new BrowserWindow({
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
    window.maximize();

  remoteMain.enable(window.webContents);
  // if (!app.isPackaged) window.webContents.openDevTools({ mode: "detach" });

  window.show();

  console.debug("Loading carousel window...");
  await window.loadURL(`${baseUrl}${app.isPackaged ? "#" : "/"}carousel`);
  console.debug("Carousel window loaded.");

  window.webContents.send("init", { fileId, selectedFileIds });

  return window;
};

ipcMain.on("createCarouselWindow", (_, { height, fileId, selectedFileIds, width }) => {
  createCarouselWindow({ height, fileId, selectedFileIds, width });
});
/* ------------------------------- END - CAROUSEL WINDOWS ------------------------------ */
