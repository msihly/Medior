import fs from "fs/promises";
import path from "path";
import { ipcRenderer } from "electron";
import { dayjs } from "./date-and-time";
import { round } from "./math";
import { PromiseQueue } from "./queue";

const logQueue = new PromiseQueue();

let logsPath: string;

export const logToFile = async (type: "debug" | "error" | "warn", ...args: any[]) => {
  try {
    console[type](...args);

    if (!logsPath) await setLogsPath(await ipcRenderer.invoke("getLogsPath"));

    const logContent = `[${dayjs().format(
      "YYYY-MM-DD HH:mm:ss"
    )}] [${type.toUpperCase()}] ${args.join(" ")}\n`;

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
    toFile ? logToFile("debug", str) : console.debug(str);
    perfStart = performance.now();
  };

  const perfLogTotal = (logStr: string) => {
    const str = `${logTag} Total: ${round(performance.now() - funcPerfStart, 0)} ms - ${logStr}`;
    toFile ? logToFile("debug", str) : console.debug(str);
  };

  return { perfLog, perfLogTotal, perfStart };
};

export const setLogsPath = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  logsPath = path.resolve(filePath);
};
