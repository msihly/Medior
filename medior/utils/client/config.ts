import { ipcRenderer } from "electron";
import fs from "fs/promises";
import path from "path";
import { FolderToCollMode, FolderToTagsMode, SortMenuProps } from "medior/components";
import {
  deepMerge,
  handleErrors,
  IMAGE_EXTS_COMMON,
  ImageExt,
  NestedKeys,
  VIDEO_CODECS_COMMON,
  VIDEO_EXTS_COMMON,
  VideoCodec,
  VideoExt,
} from "medior/utils/common";
import { checkFileExists, fileLog, trpc } from "medior/utils/server";

type DevToolsMode = null | Electron.OpenDevToolsOptions["mode"];

type Search = {
  pageSize: number;
  sort: SortMenuProps["value"];
};

export interface Config {
  collection: {
    editor: {
      fileSearch: Search;
      search: Search;
    };
    manager: {
      search: Search;
    };
  };
  db: {
    fileStorage: {
      locations: string[];
      threshold: number;
    };
    path: string;
  };
  dev: {
    devTools: {
      carousel: DevToolsMode;
      home: DevToolsMode;
      search: DevToolsMode;
    };
  };
  file: {
    fileCardFit: "contain" | "cover";
    hideUnratedIcon: boolean;
    imageExts: Array<ImageExt | string>;
    reencode: {
      codec: string;
      maxBitrate: number;
      maxHeight: number;
      maxWidth: number;
      override: string[];
    };
    remuxTypes: {
      toMp4: Array<Omit<VideoExt, "mp4"> | string>;
    };
    search: Search;
    videoCodecs: Array<VideoCodec | string>;
    videoExts: Array<VideoExt | string>;
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
    manager: {
      search: Search;
    };
  };
}

export type ConfigKey = NestedKeys<Config>;

export const DEFAULT_CONFIG: Config = {
  collection: {
    editor: {
      fileSearch: {
        pageSize: 20,
        sort: { isDesc: true, key: "dateCreated" },
      },
      search: {
        pageSize: 100,
        sort: { isDesc: false, key: "custom" },
      },
    },
    manager: {
      search: {
        pageSize: 100,
        sort: { isDesc: true, key: "dateCreated" },
      },
    },
  },
  db: {
    fileStorage: {
      locations: [path.resolve("FileStorage")],
      threshold: 0.99,
    },
    path: path.resolve("MongoDB"),
  },
  dev: {
    devTools: {
      carousel: null,
      home: "left",
      search: null,
    },
  },
  file: {
    fileCardFit: "contain",
    imageExts: [...IMAGE_EXTS_COMMON],
    hideUnratedIcon: false,
    reencode: {
      codec: "hevc_nvenc",
      maxBitrate: 5000,
      maxHeight: 1080,
      maxWidth: 1920,
      override: [],
    },
    remuxTypes: {
      toMp4: ["ts"],
    },
    search: {
      pageSize: 100,
      sort: { isDesc: true, key: "dateCreated" },
    },
    videoCodecs: [...VIDEO_CODECS_COMMON],
    videoExts: [...VIDEO_EXTS_COMMON],
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
    manager: {
      search: {
        pageSize: 200,
        sort: { isDesc: true, key: "dateCreated" },
      },
    },
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

export const getIsAnimated = (ext: string) =>
  ["gif", ...getConfig().file.videoExts].includes(ext.toLowerCase());

export const getIsImage = (ext: string) => getConfig().file.imageExts.includes(ext.toLowerCase());

export const getIsRemuxable = (ext: string) =>
  getConfig().file.remuxTypes.toMp4.includes(ext.toLowerCase());

export const getIsVideo = (ext: string) => getConfig().file.videoExts.includes(ext.toLowerCase());

export const loadConfig = async (configPath?: string) => {
  try {
    const filePath = configPath ?? (await ipcRenderer.invoke("getConfigPath"));
    fileLog(`Loading config from ${filePath}...`);

    if (!(await checkFileExists(filePath))) {
      fileLog(`Config file not found at ${filePath}. Initializing with defaults.`);
      await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      config = DEFAULT_CONFIG;
      return config;
    }

    const loadedConfig = JSON.parse(await fs.readFile(filePath, "utf-8")) as Config;

    config = deepMerge(DEFAULT_CONFIG, loadedConfig);
    config.collection.editor.fileSearch.pageSize = +config.collection.editor.fileSearch.pageSize;
    config.collection.editor.search.pageSize = +config.collection.editor.search.pageSize;
    config.collection.manager.search.pageSize = +config.collection.manager.search.pageSize;
    config.db.fileStorage.threshold = +config.db.fileStorage.threshold;
    config.file.search.pageSize = +config.file.search.pageSize;
    config.ports.db = +config.ports.db;
    config.ports.server = +config.ports.server;
    config.ports.socket = +config.ports.socket;
    config.tags.manager.search.pageSize = +config.tags.manager.search.pageSize;

    return config;
  } catch (err) {
    fileLog(`Failed to load config: ${err}`, { type: "error" });
    config = DEFAULT_CONFIG;
    return config;
  }
};

export const saveConfig = async (config: Config) => {
  try {
    const filePath = await ipcRenderer.invoke("getConfigPath");
    const newConfig = JSON.stringify({ ...DEFAULT_CONFIG, ...config }, null, 2);
    fileLog(`Saving config to ${filePath}...`);
    await fs.writeFile(filePath, newConfig);
    await ipcRenderer.invoke("reloadConfig");
  } catch (err) {
    fileLog(`Failed to save config: ${err}`, { type: "error" });
  }
};
