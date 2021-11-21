const { app, BrowserWindow } = require("electron");
const isDev = require("electron-is-dev");
const {
  default: installExtension,
  REACT_DEVELOPER_TOOLS,
  REDUX_DEVTOOLS,
} = require("electron-devtools-installer");
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
    isDev ? "http://localhost:3000" : `file://${path.join(__dirname, "../build/index.html")}`
  );

  if (isDev) Win.webContents.openDevTools({ mode: "detach" });
};

app.whenReady().then(() => {
  installExtension([REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS])
    .then((name) => console.log("Loaded extension", name))
    .catch((err) => console.error("Error loading extension", err));
  createWindow();
});

app.on("window-all-closed", app.quit);
