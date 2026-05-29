import { app } from "electron";
import path from "path";
import { ChildProcess, fork } from "child_process";
import { fileLog, setLogsPath } from "trabecula/utils/server";

type Proc = { name: string; child: ChildProcess };

const MAX_RESTARTS = 5;
const BASE_RESTART_DELAY_MS = 2000;

class ManagedProc {
  private restartCount = 0;
  private proc: Proc;

  constructor(
    private readonly label: string,
    private readonly fileName: string,
    private readonly getPayload: () => Record<string, any>,
    private readonly base: string,
    private readonly configPath: string,
    private readonly logsPath: string,
  ) {}

  async spawn(): Promise<any> {
    const entry = path.resolve(this.base, `${this.fileName}.js`);
    const child = fork(entry, [], {
      stdio: ["inherit", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        CONFIG_PATH: this.configPath,
        LOGS_PATH: this.logsPath,
        IS_PACKAGED: app.isPackaged ? "1" : "0",
        RESOURCES_PATH: process.resourcesPath,
        NODE_PATH: app.isPackaged
          ? path.join(process.resourcesPath, "app.asar", "node_modules")
          : path.resolve("node_modules"),
      },
    });

    child.stdout?.on("data", (d) => fileLog(`[${this.label}] ${d}`));
    child.stderr?.on("data", (d) => fileLog(`[${this.label}] [ERROR] ${d}`));
    child.on("exit", (code) => this.onExit(code));

    this.proc = { name: this.label, child };
    return await this.waitReady();
  }

  private waitReady(): Promise<any> {
    return new Promise((resolve, reject) => {
      const handler = (msg: any) => {
        if (msg?.type === "error") reject(new Error(msg.error));
        else if (msg?.type === "ready") {
          this.proc.child.off("message", handler);
          resolve(msg);
        }
      };
      this.proc.child.on("message", handler);
      this.proc.child.send({ type: "start", ...this.getPayload() });
    });
  }

  private onExit(code: number | null) {
    fileLog(`${this.label} exited with code ${code}`, { type: "error" });

    if (this.restartCount >= MAX_RESTARTS) {
      fileLog(`${this.label} hit max restarts (${MAX_RESTARTS}). Giving up.`, { type: "error" });
      return;
    }

    const delay = BASE_RESTART_DELAY_MS * Math.pow(2, this.restartCount);
    this.restartCount++;
    fileLog(
      `Restarting ${this.label} in ${delay}ms (attempt ${this.restartCount}/${MAX_RESTARTS})...`,
      { type: "error" },
    );

    setTimeout(async () => {
      try {
        await this.spawn();
        this.restartCount = 0;
        fileLog(`${this.label} restarted successfully.`);
      } catch (err: any) {
        fileLog(`${this.label} failed to restart: ${err.message}`, { type: "error" });
      }
    }, delay);
  }
}

export const startServers = async (configPath: string, logsPath: string) => {
  await setLogsPath(logsPath);

  const base = app.isPackaged
    ? path.join(process.resourcesPath, "extraResources/medior/server")
    : __dirname;

  const makeProc = (
    label: string,
    fileName: string,
    getPayload: () => Record<string, any> = () => ({}),
  ) => new ManagedProc(label, fileName, getPayload, base, configPath, logsPath);

  const { uri } = await makeProc("DB", "db-process").spawn();

  await Promise.all([
    makeProc("API", "api-process", () => ({ uri })).spawn(),
    makeProc("SOCKET", "socket-process").spawn(),
  ]);

  fileLog("All services started.");
};
