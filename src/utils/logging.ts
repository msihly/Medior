import electronLog from "electron-log";

export const logToFile = (type: "debug" | "error" | "log" | "warn", ...args: string[]) => {
  console[type](...args);
  electronLog[type](...args);
};
