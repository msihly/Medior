import fs from "fs/promises";
import path from "path";
import { ipcRenderer } from "electron";
import { FolderToCollMode, FolderToTagsMode, SortMenuProps } from "medior/components";
import {
  ImageType,
  NestedKeys,
  VideoType,
  checkFileExists,
  deepMerge,
  handleErrors,
  logToFile,
  trpc,
} from ".";

export interface Config {
  collection: {
    editorPageSize: number;
    editorSearchSort: SortMenuProps["value"];
    managerSearchSort: SortMenuProps["value"];
    searchFileCount: number;
  };
  db: {
    fileStorage: {
      locations: string[];
      threshold: number;
    };
    path: string;
  };
  file: {
    fileCardFit: "contain" | "cover";
    hideUnratedIcon: boolean;
    imageTypes: ImageType[];
    searchFileCount: number;
    searchSort: SortMenuProps["value"];
    videoTypes: VideoType[];
  };
  imports: {
    deleteOnImport: boolean;
    folderDelimiter: string;
    folderToCollMode: FolderToCollMode;
    folderToTagsMode: FolderToTagsMode;
    ignorePrevDeleted: boolean;
    labelDiff: string;
    labelDiffModel: string;
    labelDiffOriginal: string;
    labelDiffUpscaled: string;
    withDelimiters: boolean;
    withDiffModel: boolean;
    withDiffParams: boolean;
    withDiffRegEx: boolean;
    withDiffTags: boolean;
    withFileNameToTags: boolean;
    withFolderNameRegEx: boolean;
    withNewTagsToRegEx: boolean;
  };
  ports: {
    db: number;
    server: number;
    socket: number;
  };
  tags: {
    managerSearchSort: SortMenuProps["value"];
    searchTagCount: number;
  };
}

export type ConfigKey = NestedKeys<Config>;

export const DEFAULT_CONFIG: Config = {
  collection: {
    editorPageSize: 50,
    editorSearchSort: { isDesc: true, key: "dateCreated" },
    managerSearchSort: { isDesc: true, key: "dateModified" },
    searchFileCount: 20,
  },
  db: {
    fileStorage: {
      locations: [path.resolve("FileStorage")],
      threshold: 0.9,
    },
    path: path.resolve("MongoDB"),
  },
  file: {
    fileCardFit: "contain",
    imageTypes: ["gif", "heic", "jfif", "jif", "jiff", "jpeg", "jpg", "png", "webp"],
    hideUnratedIcon: false,
    searchFileCount: 100,
    searchSort: { isDesc: true, key: "dateCreated" },
    videoTypes: ["3gp", "avi", "f4v", "flv", "m4v", "mkv", "mov", "mp4", "ts", "webm", "wmv"],
  },
  imports: {
    deleteOnImport: true,
    folderDelimiter: ";;",
    folderToCollMode: "none",
    folderToTagsMode: "none",
    ignorePrevDeleted: true,
    labelDiff: "Diffusion",
    labelDiffModel: "Diffusion Model",
    labelDiffOriginal: "Diff: Original",
    labelDiffUpscaled: "Diff: Upscaled",
    withDelimiters: true,
    withDiffModel: true,
    withDiffRegEx: true,
    withDiffParams: false,
    withDiffTags: true,
    withFileNameToTags: false,
    withFolderNameRegEx: true,
    withNewTagsToRegEx: true,
  },
  ports: {
    db: 27070,
    server: 3334,
    socket: 3335,
  },
  tags: {
    managerSearchSort: { isDesc: true, key: "dateCreated" },
    searchTagCount: 200,
  },
};

let config: Config;

export const getAvailableFileStorage = (bytesNeeded: number) =>
  handleErrors(async () => {
    for (const location of config.db.fileStorage.locations) {
      const res = await trpc.getDiskStats.mutate({ diskPath: location });
      if (!res.success) throw new Error(res.error);
      if (res.data.free > bytesNeeded) return location;
    }
    throw new Error("No available file storage location found.");
  });

export const getConfig = (debugLoc?: string) => {
  if (!config) throw new Error(`Config not loaded. ${debugLoc}`);
  return config;
};

export const loadConfig = async (configPath?: string) => {
  try {
    const filePath = configPath ?? (await ipcRenderer.invoke("getConfigPath"));
    logToFile("debug", `Loading config from ${filePath}...`);

    if (!(await checkFileExists(filePath))) {
      logToFile("debug", `Config file not found at ${filePath}. Initializing with defaults.`);
      await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      config = DEFAULT_CONFIG;
      return config;
    }

    const loadedConfig = JSON.parse(await fs.readFile(filePath, "utf-8")) as Config;

    config = deepMerge(DEFAULT_CONFIG, loadedConfig);
    config.collection.editorPageSize = +config.collection.editorPageSize;
    config.collection.searchFileCount = +config.collection.searchFileCount;
    config.db.fileStorage.threshold = +config.db.fileStorage.threshold;
    config.file.searchFileCount = +config.file.searchFileCount;
    config.ports.db = +config.ports.db;
    config.ports.server = +config.ports.server;
    config.ports.socket = +config.ports.socket;
    config.tags.searchTagCount = +config.tags.searchTagCount;

    return config;
  } catch (err) {
    logToFile("error", "Failed to load config:", err);
    config = DEFAULT_CONFIG;
    return config;
  }
};

export const saveConfig = async (config: Config) => {
  try {
    const filePath = await ipcRenderer.invoke("getConfigPath");
    const newConfig = JSON.stringify({ ...DEFAULT_CONFIG, ...config }, null, 2);
    logToFile("debug", `Saving config to ${filePath}...`);
    await fs.writeFile(filePath, newConfig);
    await ipcRenderer.invoke("reloadConfig");
  } catch (err) {
    logToFile("error", "Failed to save config:", err);
  }
};
