import { ipcRenderer } from "electron";
import fs from "fs/promises";
import path from "path";
import { dayjs, PromiseQueue, round } from "medior/utils/common";

const logQueue = new PromiseQueue();
let logsPath: string;

export const getLogsPath = () => logsPath;

export const setLogsPath = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  logsPath = path.resolve(filePath);
};

/* ----------------------------------------------------------------------- */
const stringify = (args: any | any[]) => {
  if (Array.isArray(args)) return args.map((arg) => JSON.stringify(arg, null, 2)).join(" ");
  return JSON.stringify(args, null, 2);
};

export const fileLog = async (
  args: any | any[],
  options?: { type: "debug" | "error" | "warn" },
) => {
  try {
    if (!logsPath) await setLogsPath(await ipcRenderer.invoke("getLogsPath"));
    await fs.mkdir(path.dirname(logsPath), { recursive: true });

    const timestamp = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const logType = (options?.type ?? "debug").toUpperCase();
    const logContent = `[${timestamp}] [${logType}] ${stringify(args)}\n`;

    logQueue.add(() => fs.appendFile(logsPath, logContent, { encoding: "utf8" }));
  } catch (err) {
    console.error("Failed to log to file:", err);
  }
};

export const makePerfLog = (logTag: string, toFile = false) => {
  const funcPerfStart = performance.now();
  let perfStart = performance.now();

  const perfLog = (logStr: string) => {
    const str = `${logTag} ${round(performance.now() - perfStart, 0)} ms - ${logStr}`;
    toFile ? fileLog(str) : console.debug(str);
    perfStart = performance.now();
  };

  const perfLogTotal = (logStr: string) => {
    const str = `${logTag} Total: ${round(performance.now() - funcPerfStart, 0)} ms - ${logStr}`;
    toFile ? fileLog(str) : console.debug(str);
  };

  return { perfLog, perfLogTotal, perfStart };
};
