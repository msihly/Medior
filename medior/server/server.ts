import { app } from "electron";
import path from "path";
import { ChildProcess, fork } from "child_process";
import { randomUUID } from "crypto";
import { fileLog, setLogsPath } from "trabecula/utils/server";

export type ServerProcessState = "failed" | "ready" | "restarting" | "starting";

export interface ServerProcessStatus {
  isConfigRestart?: boolean;
  label: string;
  restartCount: number;
  state: ServerProcessState;
}

const BASE_RESTART_DELAY_MS = 2000;
const MAX_RESTARTS = 5;
const READY_TIMEOUT_MS = 30000;

class ManagedProc {
  private intentionalStop = false;
  private proc: ChildProcess = null;
  private restartCount = 0;
  private restartTimer: NodeJS.Timeout = null;
  private state: ServerProcessState = "starting";

  constructor(
    private readonly label: string,
    private readonly fileName: string,
    private readonly getPayload: () => Record<string, any>,
    private readonly base: string,
    private readonly configPath: string,
    private readonly logsPath: string,
    private readonly onStatusChange: () => void,
  ) {}

  getStatus(): ServerProcessStatus {
    return { label: this.label, restartCount: this.restartCount, state: this.state };
  }

  async reloadConfig() {
    await this.sendAndWait({ type: "reload-config" }, "config-reloaded");
  }

  async spawn(): Promise<any> {
    this.intentionalStop = false;
    this.setState(this.restartCount ? "restarting" : "starting");

    const child = fork(path.resolve(this.base, `${this.fileName}.js`), [], {
      stdio: ["inherit", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        CONFIG_PATH: this.configPath,
        IS_PACKAGED: app.isPackaged ? "1" : "0",
        LOGS_PATH: this.logsPath,
        NODE_PATH: app.isPackaged
          ? path.join(process.resourcesPath, "app.asar", "node_modules")
          : path.resolve("node_modules"),
        RESOURCES_PATH: process.resourcesPath,
      },
    });

    this.proc = child;
    child.stdout?.on("data", (data) => fileLog(`[${this.label}] ${data}`));
    child.stderr?.on("data", (data) =>
      fileLog(`[${this.label}] [ERROR] ${data}`, { type: "error" }),
    );
    child.once("exit", (code) => this.handleExit(child, code));

    const message = await this.sendAndWait({ type: "start", ...this.getPayload() }, "ready");
    this.restartCount = 0;
    this.setState("ready");
    return message;
  }

  async stop() {
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.intentionalStop = true;

    const child = this.proc;
    if (!child) return;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill();
    });
  }

  private handleExit(child: ChildProcess, code: number | null) {
    if (this.proc !== child) return;
    this.proc = null;

    if (this.intentionalStop) {
      this.intentionalStop = false;
      return;
    }

    fileLog(`${this.label} exited with code ${code}`, { type: "error" });
    this.scheduleRestart();
  }

  private scheduleRestart() {
    if (this.restartTimer) return;
    if (this.restartCount >= MAX_RESTARTS) {
      this.setState("failed");
      fileLog(`${this.label} hit max restarts (${MAX_RESTARTS}). Giving up.`, { type: "error" });
      return;
    }

    const delay = BASE_RESTART_DELAY_MS * 2 ** this.restartCount;
    this.restartCount++;
    this.setState("restarting");
    fileLog(
      `Restarting ${this.label} in ${delay}ms (attempt ${this.restartCount}/${MAX_RESTARTS})...`,
      { type: "error" },
    );

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      try {
        await this.spawn();
        fileLog(`${this.label} restarted successfully.`);
      } catch (error) {
        fileLog(`${this.label} failed to restart: ${error.message}`, { type: "error" });
        if (!this.proc) this.scheduleRestart();
      }
    }, delay);
  }

  private setState(state: ServerProcessState) {
    this.state = state;
    this.onStatusChange();
  }

  private sendAndWait(message: Record<string, any>, successType: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = this.proc;
      if (!child?.connected) return reject(new Error(`${this.label} process is unavailable.`));

      const requestId = randomUUID();

      const cleanup = () => {
        clearTimeout(timeout);
        child.off("error", handleError);
        child.off("exit", handleExit);
        child.off("message", handleMessage);
      };

      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const handleExit = () => {
        cleanup();
        reject(new Error(`${this.label} process exited before responding.`));
      };

      const handleMessage = (response: any) => {
        if (response?.requestId !== requestId) return;
        if (response.type === "error") {
          cleanup();
          reject(new Error(response.error));
        } else if (response.type === successType) {
          cleanup();
          resolve(response);
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        child.kill();
        reject(new Error(`${this.label} process timed out.`));
      }, READY_TIMEOUT_MS);

      child.on("error", handleError);
      child.on("exit", handleExit);
      child.on("message", handleMessage);
      child.send({ ...message, requestId }, (error) => {
        if (error) handleError(error);
      });
    });
  }
}

export class ServerManager {
  private api: ManagedProc;
  private db: ManagedProc;
  private isConfigRestart = false;
  private socket: ManagedProc;
  private uri: string;

  constructor(
    base: string,
    configPath: string,
    logsPath: string,
    private readonly onStatusChange: (statuses: ServerProcessStatus[]) => void,
  ) {
    this.api = new ManagedProc(
      "API",
      "api-process",
      () => ({ uri: this.uri }),
      base,
      configPath,
      logsPath,
      this.notifyStatusChange,
    );
    this.db = new ManagedProc(
      "Database",
      "db-process",
      () => ({}),
      base,
      configPath,
      logsPath,
      this.notifyStatusChange,
    );
    this.socket = new ManagedProc(
      "Socket",
      "socket-process",
      () => ({}),
      base,
      configPath,
      logsPath,
      this.notifyStatusChange,
    );
  }

  getStatuses() {
    return [this.api, this.db, this.socket].map((serverProcess) => ({
      ...serverProcess.getStatus(),
      isConfigRestart: this.isConfigRestart,
    }));
  }

  async reloadConfig() {
    await Promise.all([
      this.api.reloadConfig(),
      this.db.reloadConfig(),
      this.socket.reloadConfig(),
    ]);
  }

  async restart() {
    this.isConfigRestart = true;
    this.notifyStatusChange();
    try {
      await Promise.all([this.api.stop(), this.socket.stop()]);
      await this.db.stop();
      await this.start();
    } finally {
      this.isConfigRestart = false;
      this.notifyStatusChange();
    }
  }

  async start() {
    const { uri } = await this.db.spawn();
    this.uri = uri;
    await Promise.all([this.api.spawn(), this.socket.spawn()]);
    fileLog("All services started.");
  }

  private notifyStatusChange = () => this.onStatusChange(this.getStatuses());
}

export const startServers = async (
  configPath: string,
  logsPath: string,
  onStatusChange: (statuses: ServerProcessStatus[]) => void,
) => {
  await setLogsPath(logsPath);

  const manager = new ServerManager(
    app.isPackaged ? path.join(process.resourcesPath, "extraResources/medior/server") : __dirname,
    configPath,
    logsPath,
    onStatusChange,
  );

  await manager.start();
  return manager;
};
