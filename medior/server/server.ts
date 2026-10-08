import { app } from "electron";
import path from "path";
import { ChildProcess, fork, ForkOptions } from "child_process";
import { randomUUID } from "crypto";
import { availableParallelism } from "os";
import { fileLog } from "trabecula/utils/server";
import type { ServerProcessMessage } from "medior/server/process-lifecycle";
import { CONSTANTS } from "medior/utils/common";
import { getConfig } from "medior/utils/server/config";

export type ServerProcessState = "failed" | "ready" | "restarting" | "starting";

export interface ServerProcessStatus {
  isConfigRestart?: boolean;
  label: string;
  message?: string;
  restartCount: number;
  state: ServerProcessState;
}

const BASE_RESTART_DELAY_MS = 2000;
const FILE_IO_THREAD_POOL_SIZE = Math.max(
  1,
  Math.min(CONSTANTS.FILE.IO_CONCURRENCY, availableParallelism()),
);
const MAX_RESTARTS = 5;
const READY_TIMEOUT_MS = 30000;
const START_TIMEOUT_MS = 6 * 60 * 1000;

class ManagedProc {
  private intentionalStop = false;
  private message: string = null;
  private proc: ChildProcess = null;
  private rejectStartup: (error: Error) => void = null;
  private resolveStartup: (message: ServerProcessMessage) => void = null;
  private restartCount = 0;
  private restartTimer: NodeJS.Timeout = null;
  private startup: Promise<ServerProcessMessage> = null;
  private state: ServerProcessState = "starting";

  constructor(
    private readonly label: string,
    private readonly fileName: string,
    private readonly getPayload: () => Pick<ServerProcessMessage, "uri">,
    private readonly base: string,
    private readonly configPath: string,
    private readonly logsPath: string,
    private readonly onStatusChange: () => void,
    private readonly getEnv?: () => Record<string, string>,
  ) {}

  getStatus(): ServerProcessStatus {
    return {
      label: this.label,
      message: this.message,
      restartCount: this.restartCount,
      state: this.state,
    };
  }

  private handleExit(child: ChildProcess, code: number | null) {
    if (this.proc !== child) return;

    this.proc = null;

    if (this.intentionalStop) return;

    fileLog(`${this.label} exited with code ${code}`, { type: "error" });
    this.scheduleRestart();
  }

  prepareStop() {
    this.rejectStartup?.(new Error(`${this.label} startup was stopped.`));
    this.rejectStartup = null;
    this.resolveStartup = null;
    this.startup = null;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.intentionalStop = true;
  }

  async reloadConfig() {
    await this.sendAndWait({ type: "reload-config" }, "config-reloaded");
  }

  private scheduleRestart() {
    if (this.intentionalStop || this.restartTimer) return;

    if (this.restartCount >= MAX_RESTARTS) {
      this.setState("failed");
      this.rejectStartup?.(new Error(`${this.label} failed after ${MAX_RESTARTS} restarts.`));
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

  private sendAndWait(
    message: ServerProcessMessage,
    successType: ServerProcessMessage["type"],
    timeoutMs = READY_TIMEOUT_MS,
  ): Promise<ServerProcessMessage> {
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

      const handleMessage = (response: ServerProcessMessage) => {
        if (response?.requestId !== requestId) return;

        if (response.type === "error") {
          cleanup();
          reject(new Error(response.error));
        } else if (response.type === successType) {
          cleanup();
          resolve(response);
        }
      };

      const timeout = setInterval(() => {
        if (message.type === "start") {
          fileLog(
            `${this.label} is still starting: ${this.message ?? "waiting for the service to report progress"}`,
          );
        } else {
          cleanup();
          reject(new Error(`${this.label} process response timed out; process retained.`));
        }
      }, timeoutMs);

      child.on("error", handleError);
      child.on("exit", handleExit);
      child.on("message", handleMessage);

      child.send({ ...message, requestId }, (error) => {
        if (error) handleError(error);
      });
    });
  }

  private setState(state: ServerProcessState) {
    this.state = state;
    this.onStatusChange();
  }

  private async spawn(): Promise<ServerProcessMessage> {
    if (this.intentionalStop) throw new Error(`${this.label} is stopping.`);

    this.message = null;
    this.setState(this.restartCount ? "restarting" : "starting");

    const options: ForkOptions & { windowsHide: boolean } = {
      // Isolate terminal signals while keeping descendants inside the owner's Windows job.
      detached: true,
      env: {
        ...process.env,
        CONFIG_PATH: this.configPath,
        IS_PACKAGED: app.isPackaged ? "1" : "0",
        LOGS_PATH: this.logsPath,
        NODE_PATH: app.isPackaged
          ? path.join(process.resourcesPath, "app.asar", "node_modules")
          : path.resolve("node_modules"),
        RESOURCES_PATH: process.resourcesPath,
        ...this.getEnv?.(),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    };

    const child = fork(path.resolve(this.base, `${this.fileName}.js`), [], options);

    this.proc = child;
    child.stdout?.on("data", (data) => fileLog(`[${this.label}] ${data}`));

    child.stderr?.on("data", (data) => {
      const output = String(data).replace(/\\"/g, '"');
      const isDebug = output.includes("MongoMS:") && !/"s"\s*:\s*"[EF]"|Error:/.test(output);

      fileLog(`[${this.label}] ${data}`, { type: isDebug ? "debug" : "error" });
    });

    child.on("error", (error) => {
      fileLog(`${this.label}: ${error.message}`, { type: "error" });

      if (!child.pid) this.handleExit(child, 1);
    });

    child.on("message", (message: ServerProcessMessage) => {
      if (this.proc === child) {
        if (message?.type === "startup-progress" && !this.intentionalStop) {
          this.message = message.message;
          this.onStatusChange();
        } else if (message?.type === "error" || message?.type === "shutdown-error") {
          this.message = message.error?.split(/\r?\n/)[0];

          if (message.type === "shutdown-error") {
            this.setState("failed");
            this.rejectStartup?.(new Error(message.error));
          } else {
            this.onStatusChange();
          }
        }
      }
    });

    child.once("exit", (code) => this.handleExit(child, code));

    const message = await this.sendAndWait(
      { type: "start", ...this.getPayload() },
      "ready",
      START_TIMEOUT_MS,
    );

    this.restartCount = 0;
    this.message = null;
    this.setState("ready");
    this.resolveStartup?.(message);

    return message;
  }

  start(): Promise<ServerProcessMessage> {
    if (this.startup) return this.startup;

    this.intentionalStop = false;

    this.startup = new Promise((resolve, reject) => {
      this.rejectStartup = reject;
      this.resolveStartup = resolve;
    });

    this.spawn().catch((error) => {
      fileLog(`${this.label} failed to start: ${error.message}`, { type: "error" });

      if (!this.proc) this.scheduleRestart();
    });

    return this.startup;
  }

  async stop() {
    this.prepareStop();

    const child = this.proc;

    if (!child || child.exitCode !== null || child.signalCode !== null) return;

    // Client work is already journalled. Terminating its owner also stops native descendants.
    if (this.label !== "Database") {
      await new Promise<void>((resolve, reject) => {
        child.once("exit", () => resolve());
        child.once("error", reject);

        if (!child.kill()) reject(new Error(`Could not terminate ${this.label}.`));
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        const requestId = randomUUID();

        const warning = setInterval(
          () => fileLog(`Waiting for ${this.label} to shut down cleanly...`),
          30000,
        );

        const cleanup = () => {
          clearInterval(warning);
          child.off("exit", onExit);
          child.off("message", onMessage);
        };

        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
          cleanup();

          if (code === 0) resolve();
          else
            reject(
              new Error(`${this.label} exited during shutdown (code: ${code}, signal: ${signal}).`),
            );
        };

        const fail = (error: Error) => {
          cleanup();
          reject(error);
        };

        const onMessage = (message: ServerProcessMessage) => {
          if (
            message?.type === "shutdown-error" ||
            (message?.requestId === requestId && message.type === "error")
          ) {
            fail(new Error(message.error));
          }
        };

        child.once("exit", onExit);
        child.on("message", onMessage);

        if (!child.connected) {
          fail(new Error(`${this.label} IPC is disconnected during shutdown.`));

          return;
        }

        child.send({ requestId, type: "stop" }, (error) => {
          if (error) fail(error);
        });
      });
    }
  }
}

export class ServerManager {
  private api: ManagedProc;
  private configRestartCount = 0;
  private db: ManagedProc;
  private isStopping = false;
  private lifecycleRevision = 0;
  private socket: ManagedProc;
  private uri: string;
  private vector: ManagedProc;

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
      () => ({ UV_THREADPOOL_SIZE: String(FILE_IO_THREAD_POOL_SIZE) }),
    );

    this.db = new ManagedProc(
      "Database",
      "db-process",
      () => ({}),
      base,
      configPath,
      logsPath,
      this.notifyStatusChange,
      () => ({ DEBUG_COLORS: "0" }),
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

    this.vector = new ManagedProc(
      "Vector",
      "vector-process",
      () => ({ uri: this.uri }),
      base,
      configPath,
      logsPath,
      this.notifyStatusChange,
      () => {
        // LanceDB sizes its compute (Lance), data-parallel (Rayon), and async (Tokio) pools from
        // these at load; unset, each claims every core during index builds and vector search.
        const threads = String(getConfig().file.similarity.cpuThreads);

        return {
          LANCE_CPU_THREADS: threads,
          RAYON_NUM_THREADS: threads,
          TOKIO_WORKER_THREADS: threads,
          UV_THREADPOOL_SIZE: String(FILE_IO_THREAD_POOL_SIZE),
        };
      },
    );
  }

  getStatuses() {
    return [this.api, this.db, this.socket, this.vector].map((serverProcess) => ({
      ...serverProcess.getStatus(),
      isConfigRestart: this.configRestartCount > 0,
    }));
  }

  async reloadConfig() {
    await Promise.all([
      this.api.reloadConfig(),
      this.db.reloadConfig(),
      this.socket.reloadConfig(),
      this.vector.reloadConfig(),
    ]);
  }

  async restart() {
    this.configRestartCount++;
    this.notifyStatusChange();

    try {
      const stopping = this.stop();
      const revision = this.lifecycleRevision;

      await stopping;

      if (revision !== this.lifecycleRevision)
        throw new Error("Restart cancelled by a later lifecycle request.");

      await this.start();
    } finally {
      this.configRestartCount--;
      this.notifyStatusChange();
    }
  }

  async start() {
    const revision = ++this.lifecycleRevision;

    this.isStopping = false;

    const { uri } = await this.db.start();

    if (this.isStopping || revision !== this.lifecycleRevision)
      throw new Error("Startup cancelled by a later lifecycle request.");

    this.uri = uri;
    await this.vector.start();

    if (this.isStopping || revision !== this.lifecycleRevision)
      throw new Error("Startup cancelled by a later lifecycle request.");

    await Promise.all([this.api.start(), this.socket.start()]);

    if (this.isStopping || revision !== this.lifecycleRevision)
      throw new Error("Startup cancelled by a later lifecycle request.");

    fileLog("All services started.");
  }

  async stop() {
    const revision = ++this.lifecycleRevision;

    this.isStopping = true;

    for (const worker of [this.api, this.db, this.socket, this.vector]) worker.prepareStop();

    const errors: unknown[] = [];

    const clients = await Promise.allSettled([
      this.api.stop(),
      this.vector.stop(),
      this.socket.stop(),
    ]);

    for (const result of clients) {
      if (result.status === "rejected") errors.push(result.reason);
    }

    if (revision !== this.lifecycleRevision) return;

    try {
      await this.db.stop();
    } catch (error) {
      errors.push(error);
    }

    if (errors.length)
      throw new AggregateError(errors, "One or more services failed to shut down.");
  }

  private notifyStatusChange = () => this.onStatusChange(this.getStatuses());
}
