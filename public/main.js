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
    instanceOpts: [{ dbPath: DB_PATH, port: DB_PORT, storageEngine: "wiredTiger" }],
    replSet: { dbName: "media-viewer", name: "rs0" },
  });
};

const createMainWindow = async () => {
  console.debug("Creating Mongo server...");
  mongoServer = await createDbServer();
  console.debug("Mongo server created.");

  mainWindow = new BrowserWindow({
    backgroundColor: "#111",
    webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false },
  });

  remoteMain.enable(mainWindow.webContents);

  ipcMain.handle("getDatabaseUri", async () => mongoServer.getUri());

  console.debug("Loading main window...");
  await mainWindow.loadURL(baseUrl);
  console.debug("Main window loaded.");

  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: "bottom" });

  mainWindow.on("close", () => {
    carouselWindows.forEach((win) => {
      win.close();
    });
  });

  ipcMain.on("createTag", (_, ...args) => {
    mainWindow.webContents.send("createTag", ...args);
  });

  ipcMain.on("editTag", (_, ...args) => {
    mainWindow.webContents.send("editTag", ...args);
  });

  ipcMain.on("editFileTags", (_, ...args) => {
    mainWindow.webContents.send("editFileTags", ...args);
  });

  ipcMain.on("setFileRating", (_, ...args) => {
    mainWindow.webContents.send("setFileRating", ...args);
  });
};

app.whenReady().then(async () => {
  // if (!app.isPackaged) {
  //   const {
  //     default: installExtension,
  //     REACT_DEVELOPER_TOOLS,
  //     REDUX_DEVTOOLS,
  //   } = require("electron-devtools-installer");

  //   await installExtension([REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS]).catch((err) =>
  //     console.error("Error loading extensions:", err)
  //   );
  // }

  return createMainWindow();
});

app.on("carouselWindow-all-closed", app.quit);
/* ------------------------------- END - MAIN WINDOW ------------------------------ */

/* ------------------------------- BEGIN - CAROUSEL WINDOWS ------------------------------ */
let carouselWindows = [];

const createCarouselWindow = async ({ fileId, height, selectedFileIds, width }) => {
  console.debug("Creating carousel window...");

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const winWidth = Math.min(width, screenWidth);
  const winHeight = Math.min(height, screenHeight);

  const carouselWindow = new BrowserWindow({
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

  remoteMain.enable(carouselWindow.webContents);
  // if (!app.isPackaged) carouselWindow.webContents.openDevTools({ mode: "detach" });

  carouselWindow.show();

  console.debug("Loading carousel window...");
  await carouselWindow.loadURL(`${baseUrl}${app.isPackaged ? "#" : "/"}carousel`);
  console.debug("Carousel window loaded.");

  carouselWindow.webContents.send("init", { fileId, selectedFileIds });
  carouselWindows.push(carouselWindow);

  carouselWindow.on("close", () => {
    carouselWindows = carouselWindows.filter((win) => win.id !== carouselWindow.id);
  });

  return carouselWindow;
};

ipcMain.on("createCarouselWindow", (_, { height, fileId, selectedFileIds, width }) => {
  createCarouselWindow({ height, fileId, selectedFileIds, width });
});

ipcMain.on("onFileTagsEdited", () => {
  carouselWindows.forEach((win) => {
    win.webContents.send("onFileTagsEdited");
  });
});

ipcMain.on("onTagPatch", (_, { patches }) => {
  carouselWindows.forEach((win) => {
    win.webContents.send("onTagPatch", { patches });
  });
});
/* ------------------------------- END - CAROUSEL WINDOWS ------------------------------ */
