import { app } from "electron";
import path from "path";
import { ChildProcess, fork } from "child_process";
import { fileLog, setLogsPath } from "medior/utils/server";

type Proc = { name: string; child: ChildProcess };

const start = (configPath: string, logsPath: string, name: string, entry: string): Proc => {
  const child = fork(entry, [], {
    stdio: ["inherit", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      CONFIG_PATH: configPath,
      LOGS_PATH: logsPath,
      IS_PACKAGED: app.isPackaged ? "1" : "0",
      RESOURCES_PATH: process.resourcesPath,
    },
  });

  child.on("exit", (code) => fileLog(`${name} exited: ${code}`, { type: "error" }));
  child.stdout.on("data", (d) => fileLog(`[${name}] ${d}`));
  child.stderr.on("data", (d) => fileLog(`[${name}] [ERROR] ${d}`));

  return { name, child };
};

const waitReady = (proc: Proc, startPayload: Record<string, any> = {}) =>
  new Promise<any>((resolve, reject) => {
    const handler = (msg: any) => {
      if (msg?.type === "error") reject(new Error(msg.error));
      else if (msg?.type === "ready") {
        proc.child.off("message", handler);
        resolve(msg);
      }
    };

    proc.child.on("message", handler);
    proc.child.send({ type: "start", ...startPayload });
  });

export const startServers = async (configPath: string, logsPath: string) => {
  await setLogsPath(logsPath);
  const base = app.isPackaged ? path.join(process.resourcesPath, "medior/server") : __dirname;

  const forkProcess = async (
    label: string,
    fileName: string,
    startPayload?: Record<string, any>,
  ) => {
    return await waitReady(
      start(configPath, logsPath, label, path.resolve(base, `${fileName}.js`)),
      startPayload,
    );
  };

  const { uri } = await forkProcess("DB", "db-process");
  await Promise.all([
    forkProcess("API", "api-process", { uri }),
    forkProcess("SOCKET", "socket-process"),
  ]);

  fileLog("All services started.");
};
