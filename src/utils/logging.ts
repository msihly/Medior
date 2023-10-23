import path from "path";
import electronLog from "electron-log";
import { dayjs } from "./date-and-time";

const logger = electronLog.create("logger");

export const logToFile = (type: "debug" | "error" | "log" | "warn", ...args: any[]) => {
  console[type](...args);
  logger[type](...args);
};

export const setLogDir = (dir: string) => {
  logger.transports.file.resolvePath = () =>
    path.resolve(dir, "logs", `${dayjs().format("YYYY-MM-DD")}.log`);
};
