import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { dayjs, round } from "medior/utils/common";

let logsPath: string;
let logStream: fs.WriteStream | null = null;

export const setLogsPath = async (filePath: string) => {
  logsPath = path.resolve(filePath);
  await fsPromises.mkdir(path.dirname(logsPath), { recursive: true });

  if (logStream) {
    logStream.end();
    logStream = null;
  }

  logStream = fs.createWriteStream(logsPath, { flags: "a", encoding: "utf8" });
  logStream.on("error", (err) => {
    console.error("Log stream error:", err);
    logStream = null;
  });
};
/* ----------------------------------------------------------------------- */

const stringify = (args: any | any[]) => {
  try {
    if (Array.isArray(args)) return args.map((arg) => JSON.stringify(arg, null, 2)).join(" ");
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
};

/* ----------------------------------------------------------------------- */
export const fileLog = async (
  args: any | any[],
  options?: { type: "debug" | "error" | "warn" },
) => {
  try {
    if (!logsPath) {
      // fallback to console if logsPath is missing
      console[options?.type ?? "debug"]("[LOG]", args);
      return;
    }

    if (!logStream) await setLogsPath(logsPath);

    const timestamp = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const logType = (options?.type ?? "debug").toUpperCase();
    const logContent = `[${timestamp}] [${logType}] ${stringify(args)}\n`;

    if (!logStream.write(logContent)) {
      await new Promise<void>((resolve) => logStream!.once("drain", () => resolve()));
    }
  } catch (err) {
    console.error("Failed to log to file:", err);
  }
};

/* ----------------------------------------------------------------------- */

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
