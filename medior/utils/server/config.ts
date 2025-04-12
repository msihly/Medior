import fs from "fs/promises";
import path from "path";
import { deepMerge, NestedKeys } from "medior/utils/common/miscellaneous";
import { checkFileExists, fileLog } from "medior/utils/server";

export interface Config {
  db: {
    fileStorage: {
      locations: string[];
      threshold: number;
    };
    path: string;
  };
  downloadFolder: string;
  tokens: {
    debrid?: string;
    goFile?: string;
  };
  zip: {
    path: string;
  };
}

export type ConfigKey = NestedKeys<Config>;

export const DEFAULT_CONFIG: Config = {
  db: {
    fileStorage: {
      locations: [path.resolve("FileStorage")],
      threshold: 0.99,
    },
    path: path.resolve("MongoDB/data"),
  },
  downloadFolder: path.resolve("Downloads"),
  tokens: {},
  zip: { path: null },
};

let config: Config;

export const getConfig = (debugLoc?: string) => {
  if (!config) throw new Error(`Config not loaded. ${debugLoc}`);
  return config;
};

export const loadConfig = async (configPath?: string) => {
  try {
    const filePath =
      configPath ??
      ((await (await import("electron")).ipcRenderer.invoke("getConfigPath")) as string);
    fileLog(`Loading config from ${filePath}...`);

    if (!(await checkFileExists(filePath))) {
      fileLog(`Config file not found at ${filePath}. Initializing with defaults.`);
      await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      config = DEFAULT_CONFIG;
      return config;
    }

    const loadedConfig = JSON.parse(await fs.readFile(filePath, "utf-8")) as Config;

    config = deepMerge(DEFAULT_CONFIG, loadedConfig);
    config.db.fileStorage.threshold = +config.db.fileStorage.threshold;

    return config;
  } catch (err) {
    fileLog(`Failed to load config: ${err.message}`, { type: "error" });
    config = DEFAULT_CONFIG;
    return config;
  }
};
