import fs from "fs/promises";
import path from "path";
import { checkFileExists, fileLog } from "trabecula/utils/server";
import type { FolderToCollMode, FolderToTagsMode, SortMenuProps } from "medior/components";
import {
  AudioCodec,
  CONSTANTS,
  deepMerge,
  DEFAULT_HOTKEYS,
  handleErrors,
  Hotkeys,
  ImageExt,
  NestedKeys,
  VideoCodec,
  VideoExt,
} from "medior/utils/common";
import { trpc } from "medior/utils/server/trpc";

type DevToolsMode = null | Electron.OpenDevToolsOptions["mode"];

export type TranscriptionModel =
  | "onnx-community/whisper-base_timestamped"
  | "onnx-community/whisper-large-v3-turbo_timestamped"
  | "onnx-community/whisper-medium_timestamped"
  | "onnx-community/whisper-small_timestamped"
  | "onnx-community/whisper-tiny_timestamped";

export type TranscriptionQuantization =
  | "bnb4"
  | "fp16"
  | "fp32"
  | "int8"
  | "q4"
  | "q4f16"
  | "q8"
  | "uint8";

const COMMON_TRANSCRIPTION_QUANTIZATIONS: TranscriptionQuantization[] = [
  "bnb4",
  "fp16",
  "fp32",
  "int8",
  "q4",
  "q8",
  "uint8",
];

export const TRANSCRIPTION_MODELS: Array<{
  label: string;
  quantizations: TranscriptionQuantization[];
  value: TranscriptionModel;
}> = [
  {
    label: "Whisper Tiny",
    quantizations: COMMON_TRANSCRIPTION_QUANTIZATIONS,
    value: "onnx-community/whisper-tiny_timestamped",
  },
  {
    label: "Whisper Base",
    quantizations: COMMON_TRANSCRIPTION_QUANTIZATIONS,
    value: "onnx-community/whisper-base_timestamped",
  },
  {
    label: "Whisper Small",
    quantizations: COMMON_TRANSCRIPTION_QUANTIZATIONS,
    value: "onnx-community/whisper-small_timestamped",
  },
  {
    label: "Whisper Medium",
    quantizations: ["fp32", "int8", "uint8"],
    value: "onnx-community/whisper-medium_timestamped",
  },
  {
    label: "Whisper Large V3 Turbo",
    quantizations: [...COMMON_TRANSCRIPTION_QUANTIZATIONS, "q4f16"],
    value: "onnx-community/whisper-large-v3-turbo_timestamped",
  },
];

const TRANSCRIPTION_MODEL_MIGRATIONS: Record<string, TranscriptionModel> = {
  "onnx-community/whisper-base": "onnx-community/whisper-base_timestamped",
  "onnx-community/whisper-large-v3-ONNX": "onnx-community/whisper-large-v3-turbo_timestamped",
  "onnx-community/whisper-large-v3-turbo": "onnx-community/whisper-large-v3-turbo_timestamped",
  "onnx-community/whisper-medium": "onnx-community/whisper-medium_timestamped",
  "onnx-community/whisper-small": "onnx-community/whisper-small_timestamped",
  "onnx-community/whisper-tiny": "onnx-community/whisper-tiny_timestamped",
};

export const TRANSCRIPTION_QUANTIZATION_OPTIONS: Array<{
  label: string;
  value: TranscriptionQuantization;
}> = [
  { label: "BNB4", value: "bnb4" },
  { label: "FP16", value: "fp16" },
  { label: "FP32", value: "fp32" },
  { label: "INT8", value: "int8" },
  { label: "Q4", value: "q4" },
  { label: "Q4F16", value: "q4f16" },
  { label: "Q8", value: "q8" },
  { label: "UINT8", value: "uint8" },
];

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
    vector: {
      path: string;
    };
  };
  dev: {
    devTools: {
      carousel: DevToolsMode;
      home: DevToolsMode;
      search: DevToolsMode;
    };
  };
  file: {
    audioCodecs: Array<AudioCodec>;
    fileCardFit: "contain" | "cover";
    hideUnratedIcon: boolean;
    imageExts: Array<ImageExt>;
    reencode: {
      codec: string;
      imageExt: ImageExt;
      imageMaxHeight: number;
      imageMaxWidth: number;
      maxBitrate: number;
      maxFps: number;
      maxHeight: number;
      maxWidth: number;
      onComplete: {
        addTagIds: string[];
        removeTagIds: string[];
      };
      onDuplicate: {
        addTagIds: string[];
        removeTagIds: string[];
      };
      onError: {
        addTagIds: string[];
        removeTagIds: string[];
      };
      onSkip: {
        addTagIds: string[];
        removeTagIds: string[];
      };
      override: string[];
    };
    remuxTypes: {
      toMp4: Array<Omit<VideoExt, "mp4">>;
    };
    search: Search;
    showFileName: boolean;
    similarity: {
      batchSize?: number;
      defaultLimit: number;
      device?: "cpu" | "cuda" | "dml" | "gpu" | "webgpu";
      dtype?: "fp32" | "fp16" | "q4" | "q8";
      index: {
        ivfPq: {
          maxIterations: number;
          nprobes: number;
          numBits: 4 | 8;
          numPartitions: number;
          numSubVectors: number;
          refineFactor: number;
          sampleRate: number;
        };
      };
      modelCachePath: string;
      storageDType: "float16" | "float32";
      visual: {
        device: "cpu" | "cuda" | "dml" | "gpu" | "webgpu";
        inferenceBatchSize: number;
        inferenceDType: "fp32" | "fp16" | "q4" | "q8";
      };
      weights: {
        audio: number;
        description: number;
        face: number;
        params: number;
        tags: number;
        transcript: number;
        visual: number;
      };
      writerBatchSize: number;
    };
    splice: {
      onComplete: {
        addTagIds: string[];
        removeTagIds: string[];
      };
    };
    transcription: {
      enabled: boolean;
      model: TranscriptionModel;
      modelCachePath: string;
      quantization: TranscriptionQuantization;
    };
    transforms: {
      search: Search;
    };
    videoCodecs: Array<VideoCodec>;
    videoExts: Array<VideoExt>;
    waveform: {
      enabled: boolean;
    };
  };
  hotkeys: Hotkeys;
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
    manager: {
      search: Search;
    };
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
    vector: number;
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
        pageSize: 50,
        sort: { isDesc: false, key: "custom" },
      },
    },
    manager: {
      search: {
        pageSize: 30,
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
    vector: {
      path: path.resolve("LanceDB"),
    },
  },
  dev: {
    devTools: {
      carousel: null,
      home: "left",
      search: null,
    },
  },
  file: {
    audioCodecs: [...CONSTANTS.AUDIO.CODECS_COMMON],
    fileCardFit: "contain",
    hideUnratedIcon: false,
    imageExts: [...CONSTANTS.IMAGE.EXTS_COMMON],
    reencode: {
      codec: "libx265",
      imageExt: "jpg",
      imageMaxHeight: 1440,
      imageMaxWidth: 2560,
      maxBitrate: 5000,
      maxFps: 60,
      maxHeight: 1080,
      maxWidth: 1920,
      onComplete: {
        addTagIds: [],
        removeTagIds: [],
      },
      onDuplicate: {
        addTagIds: [],
        removeTagIds: [],
      },
      onError: {
        addTagIds: [],
        removeTagIds: [],
      },
      onSkip: {
        addTagIds: [],
        removeTagIds: [],
      },
      override: ["-preset", "slow", "-crf", "26", "-x265-params", "log-level=error"],
    },
    remuxTypes: {
      toMp4: ["ts"],
    },
    search: {
      pageSize: 100,
      sort: { isDesc: true, key: "dateCreated" },
    },
    showFileName: false,
    similarity: {
      defaultLimit: 100,
      index: {
        ivfPq: {
          maxIterations: 20,
          nprobes: 32,
          numBits: 8,
          numPartitions: 0,
          numSubVectors: 0,
          refineFactor: 4,
          sampleRate: 64,
        },
      },
      modelCachePath: path.resolve("ModelCache"),
      storageDType: "float16",
      visual: {
        device: "dml",
        inferenceBatchSize: 16,
        inferenceDType: "fp32",
      },
      weights: {
        audio: 0,
        description: 0,
        face: 0,
        params: 0,
        tags: 0,
        transcript: 0,
        visual: 1,
      },
      writerBatchSize: 5000,
    },
    splice: {
      onComplete: {
        addTagIds: [],
        removeTagIds: [],
      },
    },
    transcription: {
      enabled: false,
      model: "onnx-community/whisper-tiny_timestamped",
      modelCachePath: path.resolve("ModelCache"),
      quantization: "int8",
    },
    transforms: {
      search: {
        pageSize: 20,
        sort: { isDesc: false, key: "dateCreated" },
      },
    },
    videoCodecs: [...CONSTANTS.VIDEO.CODECS_COMMON],
    videoExts: [...CONSTANTS.VIDEO.EXTS_COMMON],
    waveform: {
      enabled: true,
    },
  },
  hotkeys: DEFAULT_HOTKEYS,
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
    manager: {
      search: {
        pageSize: 20,
        sort: { isDesc: true, key: "dateCreated" },
      },
    },
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
    vector: 3336,
  },
  tags: {
    manager: {
      search: {
        pageSize: 50,
        sort: { isDesc: true, key: "dateCreated" },
      },
    },
  },
};

let config: Config;

export const setConfig = (value: Config) => {
  config = deepMerge(DEFAULT_CONFIG, value);
  return config;
};

const writeConfig = (filePath: string, value: Config) =>
  fs.writeFile(filePath, JSON.stringify(value, null, 2));

export const getAvailableFileStorage = (bytesNeeded: number) =>
  handleErrors(async () => {
    for (const location of config.db.fileStorage.locations) {
      const res = await trpc.getDiskStats.mutate({ diskPath: location });
      if (!res.success) throw new Error(res.error);
      if (res.data.free > bytesNeeded) return { bytesLeft: res.data.free, location };
    }
    throw new Error("No available file storage location found.");
  });

export const getConfig = (debugLoc?: string) => {
  if (!config) throw new Error(`Config not loaded. ${debugLoc}`);
  return config;
};

export const getIsAnimated = (ext: string) =>
  ["gif", ...getConfig().file.videoExts].includes(ext.toLowerCase());

export const getIsImage = (ext: string) =>
  getConfig().file.imageExts.includes(ext.toLowerCase() as ImageExt);

export const getIsRemuxable = (ext: string) =>
  getConfig().file.remuxTypes.toMp4.includes(ext.toLowerCase());

export const getIsVideo = (ext: string) =>
  getConfig().file.videoExts.includes(ext.toLowerCase() as VideoExt);

export const loadConfig = async (filePath: string) => {
  try {
    if (!filePath) throw new Error("No config path provided.");

    fileLog(`Loading config from ${filePath}...`);

    if (!(await checkFileExists(filePath))) {
      fileLog(`Config file not found at ${filePath}. Initializing with defaults.`);
      await writeConfig(filePath, DEFAULT_CONFIG);
      setConfig(DEFAULT_CONFIG);
      return config;
    }

    const loadedConfig = JSON.parse(await fs.readFile(filePath, "utf-8")) as Config;

    setConfig(loadedConfig);

    const migratedTranscriptionModel =
      TRANSCRIPTION_MODEL_MIGRATIONS[config.file.transcription.model];
    if (migratedTranscriptionModel) {
      config.file.transcription.model = migratedTranscriptionModel;
      await writeConfig(filePath, config);
    }

    const loadedSimilarity = (loadedConfig.file?.similarity ?? {}) as Config["file"]["similarity"];
    if (loadedSimilarity.batchSize && !loadedSimilarity.visual?.inferenceBatchSize)
      config.file.similarity.visual.inferenceBatchSize = +loadedSimilarity.batchSize;
    if (loadedSimilarity.device && !loadedSimilarity.visual?.device)
      config.file.similarity.visual.device = loadedSimilarity.device;
    if (loadedSimilarity.dtype && !loadedSimilarity.visual?.inferenceDType)
      config.file.similarity.visual.inferenceDType = loadedSimilarity.dtype;

    config.collection.editor.fileSearch.pageSize = +config.collection.editor.fileSearch.pageSize;
    config.collection.editor.search.pageSize = +config.collection.editor.search.pageSize;
    config.collection.manager.search.pageSize = +config.collection.manager.search.pageSize;
    config.db.fileStorage.threshold = +config.db.fileStorage.threshold;
    config.file.similarity.defaultLimit = +config.file.similarity.defaultLimit;
    config.file.similarity.index.ivfPq.maxIterations =
      +config.file.similarity.index.ivfPq.maxIterations;
    config.file.similarity.index.ivfPq.nprobes = +config.file.similarity.index.ivfPq.nprobes;
    config.file.similarity.index.ivfPq.numBits = +config.file.similarity.index.ivfPq.numBits as
      | 4
      | 8;
    config.file.similarity.index.ivfPq.numPartitions =
      +config.file.similarity.index.ivfPq.numPartitions;
    config.file.similarity.index.ivfPq.numSubVectors =
      +config.file.similarity.index.ivfPq.numSubVectors;
    config.file.similarity.index.ivfPq.refineFactor =
      +config.file.similarity.index.ivfPq.refineFactor;
    config.file.similarity.index.ivfPq.sampleRate = +config.file.similarity.index.ivfPq.sampleRate;
    config.file.similarity.visual.inferenceBatchSize =
      +config.file.similarity.visual.inferenceBatchSize;
    config.file.similarity.weights.audio = +config.file.similarity.weights.audio;
    config.file.similarity.weights.description = +config.file.similarity.weights.description;
    config.file.similarity.weights.face = +config.file.similarity.weights.face;
    config.file.similarity.weights.params = +config.file.similarity.weights.params;
    config.file.similarity.weights.tags = +config.file.similarity.weights.tags;
    config.file.similarity.weights.transcript = +config.file.similarity.weights.transcript;
    config.file.similarity.weights.visual = +config.file.similarity.weights.visual;
    config.file.similarity.writerBatchSize = +config.file.similarity.writerBatchSize;
    config.file.search.pageSize = +config.file.search.pageSize;
    config.file.transforms.search.pageSize = +config.file.transforms.search.pageSize;
    config.ports.db = +config.ports.db;
    config.ports.server = +config.ports.server;
    config.ports.socket = +config.ports.socket;
    config.ports.vector = +config.ports.vector;
    config.tags.manager.search.pageSize = +config.tags.manager.search.pageSize;

    return config;
  } catch (err) {
    fileLog(`Failed to load config: ${err}`, { type: "error" });
    setConfig(DEFAULT_CONFIG);
    return config;
  }
};

export const saveConfig = async (configPath: string, value: Config) => {
  try {
    if (!configPath) throw new Error("No config path provided.");
    fileLog(`Saving config to ${configPath}...`);
    await writeConfig(configPath, setConfig(value));
  } catch (err) {
    fileLog(`Failed to save config: ${err}`, { type: "error" });
    throw err;
  }
};
