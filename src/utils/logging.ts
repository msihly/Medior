import fs from "fs/promises";
import path from "path";
import { dayjs } from "./date-and-time";
import { ipcRenderer } from "electron";

let logsPath: string;

export const logToFile = async (type: "debug" | "error" | "warn", ...args: any[]) => {
  try {
    console[type](...args);

    if (!logsPath) await setLogsPath(await ipcRenderer.invoke("getLogsPath"));

    const logContent = `[${dayjs().format(
      "YYYY-MM-DD HH:mm:ss"
    )}] [${type.toUpperCase()}] ${args.join(" ")}\n`;

    await fs.appendFile(logsPath, logContent, { encoding: "utf8" });
  } catch (err) {
    console.error("Failed to log to file:", err);
  }
};

export const setLogsPath = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  logsPath = path.resolve(filePath);
};
