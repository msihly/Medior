import { app, BrowserWindow, ipcMain, screen } from "electron";
import { registerMainProcess } from "trabecula/utils/electron";
import { fileLog } from "trabecula/utils/server";
import { SERVER_STAGES } from "medior/server/server";
import { Config, getConfig, loadConfig, saveConfig, setupTRPC } from "medior/utils/server";

const remoteMain = require("@electron/remote/main");

app.on("browser-window-created", (_, window) => {
  const sendWindowState = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed() || window.webContents.isCrashed())
      return;

    window.webContents.send("window-state", {
      isDevToolsOpen: window.webContents.isDevToolsOpened(),
      isMaximized: window.isMaximized(),
    });
  };

  window.on("maximize", sendWindowState);
  window.on("unmaximize", sendWindowState);
  window.webContents.on("devtools-closed", sendWindowState);
  window.webContents.on("devtools-opened", sendWindowState);
  window.webContents.on("did-finish-load", sendWindowState);
  window.webContents.on("render-process-gone", (_, details) => {
    fileLog(`Renderer ${window.id} exited: ${details.reason}, code ${details.exitCode}`, {
      type: "error",
    });
  });
});

const {
  baseUrl,
  configPath,
  getServers,
  isBundled,
  isPackaged,
  isShuttingDown,
  relaunch,
  startServers,
} = registerMainProcess({
  appName: "Medior",
  devPort: 3333,
  mainDir: __dirname,
  resourcesFolder: "medior",
});

type WindowType = "carousel" | "home" | "search";

const lastDisplayIds: Partial<Record<WindowType, number>> = {};

const getLastDisplay = (windowType: WindowType) =>
  screen.getAllDisplays().find((display) => display.id === lastDisplayIds[windowType]) ??
  screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

const trackWindowDisplay = (window: BrowserWindow, windowType: WindowType) => {
  const updateDisplay = () => {
    lastDisplayIds[windowType] = screen.getDisplayMatching(window.getBounds()).id;
  };

  updateDisplay();
  window.on("move", updateDisplay);
};

/* -------------------------------------------------------------------------- */
/*                                   CONFIG                                   */
/* -------------------------------------------------------------------------- */
const broadcastConfig = (config: Config) =>
  BrowserWindow.getAllWindows().forEach((window) =>
    window.webContents.send("config-updated", config),
  );

ipcMain.handle("saveConfig", async (_, config: Config) => {
  try {
    if (isShuttingDown()) throw new Error("Medior is shutting down.");

    const previousConfig = getConfig();

    let restartedServers =
      previousConfig.db.path !== config.db.path ||
      previousConfig.db.vector.path !== config.db.vector.path ||
      previousConfig.file.similarity.cpuThreads !== config.file.similarity.cpuThreads ||
      previousConfig.ports.db !== config.ports.db ||
      previousConfig.ports.server !== config.ports.server ||
      previousConfig.ports.socket !== config.ports.socket ||
      previousConfig.ports.vector !== config.ports.vector;

    await saveConfig(configPath, config);

    if (isShuttingDown()) throw new Error("Medior is shutting down.");

    setupTRPC();

    try {
      if (restartedServers) await getServers().restart();
      else await getServers().reloadConfig();

      broadcastConfig(config);

      return { restartedServers, success: true };
    } catch (error) {
      fileLog(`Failed to apply server config: ${error.message}`, { type: "error" });

      if (!restartedServers && !isShuttingDown()) {
        restartedServers = true;

        try {
          await getServers().restart();
          broadcastConfig(config);

          return { restartedServers, success: true };
        } catch (restartError) {
          fileLog(`Failed to restart servers: ${restartError.message}`, { type: "error" });
          broadcastConfig(config);

          return { error: restartError.message, restartedServers, success: false };
        }
      } else {
        broadcastConfig(config);

        return { error: error.message, restartedServers, success: false };
      }
    }
  } catch (error) {
    fileLog(`Failed to save config: ${error.message}`, { type: "error" });

    return { error: error.message, restartedServers: false, success: false };
  }
});

/* -------------------------------------------------------------------------- */
/*                                 MAIN WINDOW                                */
/* -------------------------------------------------------------------------- */
ipcMain.handle("reload", relaunch);

let mainWindow: BrowserWindow = null;

const createMainWindow = async () => {
  try {
    if (isShuttingDown()) return;

    fileLog("Creating main window...");

    const display = getLastDisplay("home");

    mainWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      frame: false,
      show: false,
      webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false },
      x: display.workArea.x,
      y: display.workArea.y,
    });

    mainWindow.on("closed", () => app.quit());
    mainWindow.on("close", () =>
      [...carouselWindows, ...searchWindows].forEach((window) => {
        if (!window.isDestroyed()) window.close();
      }),
    );

    remoteMain.initialize();
    remoteMain.enable(mainWindow.webContents);
    registerDevToolsShortcuts(mainWindow);

    mainWindow.maximize();
    mainWindow.show();
    trackWindowDisplay(mainWindow, "home");

    if (!isPackaged) {
      const mode = getConfig().dev.devTools.home;

      if (mode) mainWindow.webContents.openDevTools({ mode });
    }

    fileLog("Loading servers...");
    startServers({ stages: SERVER_STAGES });

    fileLog("Loading main window...");
    await mainWindow.loadURL(baseUrl);
    fileLog("Main window loaded.");
  } catch (err) {
    fileLog(err.message, { type: "error" });
    app.quit();
  }
};

(async () => {
  try {
    await app.whenReady();

    if (isShuttingDown()) return;

    await loadConfig(configPath);

    if (isShuttingDown()) return;

    setupTRPC();
    await createMainWindow();
  } catch (error) {
    fileLog(`Startup failed: ${error.message}`, { type: "error" });
    app.quit();
  }
})();

app.on("window-all-closed", app.quit);

/* -------------------------------------------------------------------------- */
/*                               SEARCH WINDOWS                               */
/* -------------------------------------------------------------------------- */
let searchWindows: BrowserWindow[] = [];

const createSearchWindow = async ({ tagIds }) => {
  if (isShuttingDown()) return;

  try {
    const display = getLastDisplay("search");

    const searchWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      frame: false,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        nodeIntegrationInSubFrames: true,
        webSecurity: false,
      },
      x: display.workArea.x,
      y: display.workArea.y,
    });

    searchWindows.push(searchWindow);
    searchWindow.on("closed", () => {
      searchWindows = searchWindows.filter((window) => window !== searchWindow);
    });

    searchWindow.maximize();
    remoteMain.enable(searchWindow.webContents);
    registerDevToolsShortcuts(searchWindow);
    searchWindow.show();
    trackWindowDisplay(searchWindow, "search");

    if (!isPackaged) {
      const mode = getConfig().dev.devTools.search;

      if (mode) searchWindow.webContents.openDevTools({ mode });
    }

    fileLog("Creating search window...");
    await searchWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}search`);
    fileLog("Search window created.");

    setTimeout(() => {
      if (!searchWindow.isDestroyed() && !searchWindow.webContents.isDestroyed())
        searchWindow.webContents.send("init", { tagIds });
    }, 100);

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

const registerDevToolsShortcuts = (window: BrowserWindow) => {
  window.webContents.on("before-input-event", (event, input) => {
    const isDevToolsShortcut =
      input.type === "keyDown" &&
      (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i"));

    if (!isDevToolsShortcut) return;

    event.preventDefault();
    window.webContents.toggleDevTools();
  });
};

const createCarouselWindow = async ({ fileId, height, selectedFileIds, startTimes, width }) => {
  if (isShuttingDown()) return;

  try {
    fileLog("Creating carousel window...");

    const display = getLastDisplay("carousel");
    const { height: screenHeight, width: screenWidth } = display.workAreaSize;

    const winWidth = Math.min(width, screenWidth);
    const winHeight = Math.min(height, screenHeight);

    const carouselWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      frame: false,
      height: winHeight,
      show: false,
      useContentSize: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        nodeIntegrationInSubFrames: true,
        webSecurity: false,
      },
      width: winWidth,
      x: display.workArea.x,
      y: display.workArea.y,
    });

    carouselWindows.push(carouselWindow);
    carouselWindow.on("closed", () => {
      carouselWindows = carouselWindows.filter((window) => window !== carouselWindow);
    });

    carouselWindow.maximize();
    remoteMain.enable(carouselWindow.webContents);
    registerDevToolsShortcuts(carouselWindow);
    carouselWindow.show();
    trackWindowDisplay(carouselWindow, "carousel");

    if (!isPackaged) {
      const mode = getConfig().dev.devTools.carousel;

      if (mode) carouselWindow.webContents.openDevTools({ mode });
    }

    fileLog("Loading carousel window...");
    await carouselWindow.loadURL(`${baseUrl}${isBundled ? "#" : "/"}carousel`);
    fileLog("Carousel window loaded.");

    setTimeout(() => {
      if (!carouselWindow.isDestroyed() && !carouselWindow.webContents.isDestroyed())
        carouselWindow.webContents.send("init", { fileId, selectedFileIds, startTimes });
    }, 500);

    return carouselWindow;
  } catch (err) {
    fileLog(err.stack, { type: "error" });
  }
};

ipcMain.on("createCarouselWindow", (_, args) => createCarouselWindow(args));
