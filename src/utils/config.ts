import fs from "fs/promises";
import path from "path";
import { ipcRenderer } from "electron";
import { FolderToCollMode, FolderToTagsMode, SortMenuProps } from "components";
import { ImageType, VideoType, checkFileExists, logToFile } from ".";

export interface Config {
  collection: {
    editorPageSize: number;
    editorSearchSort: SortMenuProps["value"];
    managerSearchSort: SortMenuProps["value"];
    searchFileCount: number;
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
  mongo: {
    dbPath: string;
    outputDir: string;
  };
  ports: {
    db: number;
    server: number;
    socket: number;
  };
  tags: {
    managerSearchSort: SortMenuProps["value"];
  };
}

export const DEFAULT_CONFIG: Config = {
  collection: {
    editorPageSize: 50,
    editorSearchSort: { isDesc: true, key: "dateCreated" },
    managerSearchSort: { isDesc: true, key: "dateModified" },
    searchFileCount: 20,
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
  mongo: {
    dbPath: path.resolve("MongoDB"),
    outputDir: path.resolve("FileStorage"),
  },
  ports: {
    db: 27070,
    server: 3334,
    socket: 3335,
  },
  tags: {
    managerSearchSort: { isDesc: true, key: "dateCreated" },
  },
};

let config: Config;

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

    config = {
      collection: {
        editorPageSize:
          +loadedConfig.collection?.editorPageSize || DEFAULT_CONFIG.collection.editorPageSize,
        editorSearchSort:
          loadedConfig.collection?.editorSearchSort || DEFAULT_CONFIG.collection.editorSearchSort,
        managerSearchSort:
          loadedConfig.collection?.managerSearchSort || DEFAULT_CONFIG.collection.managerSearchSort,
        searchFileCount:
          +loadedConfig.collection?.searchFileCount || DEFAULT_CONFIG.collection.searchFileCount,
      },
      file: {
        fileCardFit: loadedConfig.file?.fileCardFit || DEFAULT_CONFIG.file.fileCardFit,
        imageTypes: loadedConfig.file?.imageTypes || DEFAULT_CONFIG.file.imageTypes,
        hideUnratedIcon: loadedConfig.file?.hideUnratedIcon || DEFAULT_CONFIG.file.hideUnratedIcon,
        searchFileCount: +loadedConfig.file?.searchFileCount || DEFAULT_CONFIG.file.searchFileCount,
        searchSort: loadedConfig.file?.searchSort || DEFAULT_CONFIG.file.searchSort,
        videoTypes: loadedConfig.file?.videoTypes || DEFAULT_CONFIG.file.videoTypes,
      },
      imports: {
        deleteOnImport:
          loadedConfig.imports?.deleteOnImport || DEFAULT_CONFIG.imports.deleteOnImport,
        folderDelimiter:
          loadedConfig.imports?.folderDelimiter || DEFAULT_CONFIG.imports.folderDelimiter,
        folderToCollMode:
          loadedConfig.imports?.folderToCollMode || DEFAULT_CONFIG.imports.folderToCollMode,
        folderToTagsMode:
          loadedConfig.imports?.folderToTagsMode || DEFAULT_CONFIG.imports.folderToTagsMode,
        ignorePrevDeleted:
          loadedConfig.imports?.ignorePrevDeleted || DEFAULT_CONFIG.imports.ignorePrevDeleted,
        labelDiff: loadedConfig.imports?.labelDiff || DEFAULT_CONFIG.imports.labelDiff,
        labelDiffModel:
          loadedConfig.imports?.labelDiffModel || DEFAULT_CONFIG.imports.labelDiffModel,
        labelDiffOriginal:
          loadedConfig.imports?.labelDiffOriginal || DEFAULT_CONFIG.imports.labelDiffOriginal,
        labelDiffUpscaled:
          loadedConfig.imports?.labelDiffUpscaled || DEFAULT_CONFIG.imports.labelDiffUpscaled,
        withDelimiters:
          loadedConfig.imports?.withDelimiters || DEFAULT_CONFIG.imports.withDelimiters,
        withDiffModel: loadedConfig.imports?.withDiffModel || DEFAULT_CONFIG.imports.withDiffModel,
        withDiffParams:
          loadedConfig.imports?.withDiffParams || DEFAULT_CONFIG.imports.withDiffParams,
        withDiffRegEx: loadedConfig.imports?.withDiffRegEx || DEFAULT_CONFIG.imports.withDiffRegEx,
        withDiffTags: loadedConfig.imports?.withDiffTags || DEFAULT_CONFIG.imports.withDiffTags,
        withFileNameToTags:
          loadedConfig.imports?.withFileNameToTags || DEFAULT_CONFIG.imports.withFileNameToTags,
        withFolderNameRegEx:
          loadedConfig.imports?.withFolderNameRegEx || DEFAULT_CONFIG.imports.withFolderNameRegEx,
        withNewTagsToRegEx:
          loadedConfig.imports?.withNewTagsToRegEx || DEFAULT_CONFIG.imports.withNewTagsToRegEx,
      },
      mongo: {
        dbPath: loadedConfig.mongo?.dbPath || DEFAULT_CONFIG.mongo.dbPath,
        outputDir: loadedConfig.mongo?.outputDir || DEFAULT_CONFIG.mongo.outputDir,
      },
      ports: {
        db: +loadedConfig.ports?.db || DEFAULT_CONFIG.ports.db,
        server: +loadedConfig.ports?.server || DEFAULT_CONFIG.ports.server,
        socket: +loadedConfig.ports?.socket || DEFAULT_CONFIG.ports.socket,
      },
      tags: {
        managerSearchSort:
          loadedConfig.tags?.managerSearchSort || DEFAULT_CONFIG.tags.managerSearchSort,
      },
    };

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
  } catch (err) {
    logToFile("error", "Failed to save config:", err);
  }
};
