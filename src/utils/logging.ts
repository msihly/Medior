import electronLog from "electron-log";

export const logToFile = (type: "debug" | "error" | "log" | "warn", ...args: any[]) => {
  console[type](...args);
  electronLog[type](...args);
};
