const { app, BrowserWindow, ipcMain, screen } = require("electron");
const remoteMain = require("@electron/remote/main");
remoteMain.initialize();

const baseUrl = !app.isPackaged
  ? "http://localhost:3000"
  : `file://${require("path").join(__dirname, "../build/index.html")}`;

/* ------------------------------- BEGIN - MAIN WINDOW ------------------------------ */
let mainWindow = null;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    backgroundColor: "#111",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
    },
  });

  remoteMain.enable(mainWindow.webContents);

  mainWindow.loadURL(baseUrl);

  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: "bottom" });

  ipcMain.on("editFileTags", (_, { fileIds, addedTagIds, removedTagIds }) => {
    mainWindow.webContents.send("editFileTags", { fileIds, addedTagIds, removedTagIds });
  });

  ipcMain.on("setFileRating", (_, { fileIds, rating }) => {
    mainWindow.webContents.send("setFileRating", { fileIds, rating });
  });
};

app.whenReady().then(createMainWindow);

app.on("window-all-closed", app.quit);
/* ------------------------------- END - MAIN WINDOW ------------------------------ */

/* ------------------------------- BEGIN - CAROUSEL WINDOWS ------------------------------ */
const createCarouselWindow = async (width, height) => {
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

  return window;
};

ipcMain.on("createCarouselWindow", (_, { width, height }) => {
  createCarouselWindow(width, height);
});
/* ------------------------------- END - CAROUSEL WINDOWS ------------------------------ */
