const { app, BrowserWindow } = require("electron");
const path = require("path");

const createWindow = () => {
  const Win = new BrowserWindow({
    backgroundColor: "#111",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
    },
  });

  Win.loadURL(
    !app.isPackaged
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../build/index.html")}`
  );

  if (!app.isPackaged) Win.webContents.openDevTools({ mode: "bottom" });
};

app.whenReady().then(createWindow);

app.on("window-all-closed", app.quit);
