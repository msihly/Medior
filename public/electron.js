const { app, BrowserWindow, ipcMain } = require("electron");
const remoteMain = require("@electron/remote/main");
const path = require("path");

remoteMain.initialize();

const createMainWindow = () => {
  const window = new BrowserWindow({
    backgroundColor: "#111",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
    },
  });

  remoteMain.enable(window.webContents);

  window.loadURL(
    !app.isPackaged
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  if (!app.isPackaged) window.webContents.openDevTools({ mode: "bottom" });

  ipcMain.on("editFileTags", (_, { fileIds, addedTagIds, removedTagIds }) => {
    window.webContents.send("editFileTags", { fileIds, addedTagIds, removedTagIds });
  });

  ipcMain.on("setFileRating", (_, { fileIds, rating }) => {
    window.webContents.send("setFileRating", { fileIds, rating });
  });
};

app.whenReady().then(createMainWindow);

app.on("window-all-closed", app.quit);
