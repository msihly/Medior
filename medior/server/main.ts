import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import path from "path";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import {
  ownProcessTree,
  PROCESS_SHUTDOWN_TIMEOUT_MS,
  releaseProcessTreeForRelaunch,
} from "medior/server/process-job";
import type { ServerProcessMessage } from "medior/server/process-lifecycle";
import { ServerManager, ServerProcessStatus } from "medior/server/server";
import { dayjs } from "medior/utils/common";
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

try {
  ownProcessTree();
} catch (error) {
  console.error("Process ownership could not be established:", error);
  app.exit(1);
}

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
const isPackaged = app.isPackaged;
const isBundled = isPackaged || !!process.env.BUILD_DEV;

const rootDir = path.resolve(__dirname, "..", "..");

const baseUrl = isBundled
  ? `file://${path.resolve(rootDir, "..", isPackaged ? "" : "build", "index.html")}`
  : `http://localhost:3333${!!process.env.HMR ? "/index.hmr.html" : ""}`;

const folderPath = isPackaged ? process.resourcesPath : rootDir;
const configPath = path.resolve(folderPath, "..", "config.json");
ipcMain.handle("getConfigPath", () => configPath);

let relaunchAfterShutdown = false;
let servers: ServerManager = null;
let shutdown: Promise<void> = null;
let shutdownComplete = false;

if (!app.requestSingleInstanceLock()) {
  console.error(
    "Medior is already running or still shutting down. This launch cannot start services.",
  );

  dialog.showErrorBox(
    "Medior is already running",
    "Another Medior instance still holds the application lock. It may be waiting for active work to finish shutting down. This launch has not started any services.",
  );

  app.exit(1);
}

app.on("before-quit", (event) => {
  if (shutdownComplete) return;

  event.preventDefault();

  shutdown ??= (async () => {
    const deadline = setTimeout(() => {
      fileLog("Shutdown deadline exceeded; terminating the owned process tree.", { type: "error" });
      app.exit(1);
    }, PROCESS_SHUTDOWN_TIMEOUT_MS);

    try {
      await servers?.stop();

      if (relaunchAfterShutdown) {
        if (process.connected)
          await new Promise<void>((resolve, reject) =>
            process.send({ type: "relaunch" }, (error) => (error ? reject(error) : resolve())),
          );
        else {
          releaseProcessTreeForRelaunch();
          app.relaunch();
        }
      }

      shutdownComplete = true;
      app.exit(0);
    } finally {
      clearTimeout(deadline);
    }
  })().catch((error) => {
    fileLog(`Shutdown failed: ${error.message}`, { type: "error" });
    app.exit(1);
  });
});

process.on("SIGINT", () => app.quit());
process.on("SIGTERM", () => app.quit());
process.on("disconnect", () => app.quit());

process.on("message", (message: ServerProcessMessage) => {
  if (message?.type === "stop") app.quit();
});

ipcMain.handle("getServerStatuses", () => servers?.getStatuses() ?? []);

const broadcastConfig = (config: Config) =>
  BrowserWindow.getAllWindows().forEach((window) =>
    window.webContents.send("config-updated", config),
  );

const broadcastServerStatuses = (statuses: ServerProcessStatus[]) =>
  BrowserWindow.getAllWindows().forEach((window) =>
    window.webContents.send("server-status-changed", statuses),
  );

ipcMain.handle("saveConfig", async (_, config: Config) => {
  try {
    if (shutdown) throw new Error("Medior is shutting down.");

    const previousConfig = getConfig();

    let restartedServers =
      previousConfig.db.path !== config.db.path ||
      previousConfig.ports.db !== config.ports.db ||
      previousConfig.ports.server !== config.ports.server ||
      previousConfig.ports.socket !== config.ports.socket;

    await saveConfig(configPath, config);

    if (shutdown) throw new Error("Medior is shutting down.");

    setupTRPC();

    try {
      if (restartedServers) await servers.restart();
      else await servers.reloadConfig();

      broadcastConfig(config);

      return { restartedServers, success: true };
    } catch (error) {
      fileLog(`Failed to apply server config: ${error.message}`, { type: "error" });

      if (!restartedServers && !shutdown) {
        restartedServers = true;

        try {
          await servers.restart();
          broadcastConfig(config);

          return { restartedServers, success: true };
        } catch (restartError) {
          fileLog(`Failed to restart servers: ${restartError.message}`, { type: "error" });
          broadcastConfig(config);

          return { error: restartError.message, restartedServers, success: false };
        }
      }

      broadcastConfig(config);

      return { error: error.message, restartedServers, success: false };
    }
  } catch (error) {
    fileLog(`Failed to save config: ${error.message}`, { type: "error" });

    return { error: error.message, restartedServers: false, success: false };
  }
});

const logsDir = path.resolve(folderPath, "..", "logs", dayjs().format("YYYY-MM-DD"));
process.env.LOGS_PATH = path.resolve(logsDir, `${dayjs().format("HH[h]mm[m]ss[s]")}.log`);
setLogsPath(process.env.LOGS_PATH);

app.setAppLogsPath(logsDir);
app.setPath("appData", folderPath);
app.setPath("userData", path.resolve(folderPath, "userData"));

/* -------------------------------------------------------------------------- */
/*                                 MAIN WINDOW                                */
/* -------------------------------------------------------------------------- */
ipcMain.handle("reload", () => {
  relaunchAfterShutdown = true;
  app.quit();
});

let mainWindow: BrowserWindow = null;

const createMainWindow = async () => {
  try {
    fileLog("Loading servers...");

    servers = new ServerManager(
      app.isPackaged ? path.join(process.resourcesPath, "extraResources/medior/server") : __dirname,
      configPath,
      process.env.LOGS_PATH,
      broadcastServerStatuses,
    );

    if (shutdown) return;

    fileLog("Creating main window...");

    const display = getLastDisplay("home");

    mainWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      frame: false,
      x: display.workArea.x,
      y: display.workArea.y,
      show: false,
      webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false },
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

    fileLog("Loading main window...");
    void servers.start().catch((error) => {
      fileLog(`Server startup failed: ${error.message}`, { type: "error" });
    });
    await mainWindow.loadURL(baseUrl);
    fileLog("Main window loaded.");
  } catch (err) {
    fileLog(err.message, { type: "error" });
    app.quit();
  }
};

app
  .whenReady()
  .then(async () => {
    if (shutdown) return;

    await loadConfig(configPath);

    if (shutdown) return;

    setupTRPC();

    return createMainWindow();
  })
  .catch((error) => {
    fileLog(`Startup failed: ${error.message}`, { type: "error" });
    app.quit();
  });

app.on("window-all-closed", app.quit);

/* -------------------------------------------------------------------------- */
/*                               SEARCH WINDOWS                               */
/* -------------------------------------------------------------------------- */
let searchWindows: BrowserWindow[] = [];

const createSearchWindow = async ({ tagIds }) => {
  if (shutdown) return;

  try {
    const display = getLastDisplay("search");

    const searchWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      frame: false,
      x: display.workArea.x,
      y: display.workArea.y,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        nodeIntegrationInSubFrames: true,
        webSecurity: false,
      },
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

const createCarouselWindow = async ({ fileId, height, selectedFileIds, width }) => {
  if (shutdown) return;

  try {
    fileLog("Creating carousel window...");

    const display = getLastDisplay("carousel");
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;

    const winWidth = Math.min(width, screenWidth);
    const winHeight = Math.min(height, screenHeight);

    const carouselWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#111",
      frame: false,
      x: display.workArea.x,
      y: display.workArea.y,
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
        carouselWindow.webContents.send("init", { fileId, selectedFileIds });
    }, 500);

    return carouselWindow;
  } catch (err) {
    fileLog(err.stack, { type: "error" });
  }
};

ipcMain.on("createCarouselWindow", (_, args) => createCarouselWindow(args));
