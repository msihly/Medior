import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { availableParallelism } from "os";
import { checkFileExists, fileLog, isWithinFolder } from "trabecula/utils/server";
import type { FolderToCollMode, FolderToTagsMode, SortMenuProps } from "medior/components";
import {
  AudioCodec,
  CONSTANTS,
  DEFAULT_HOTKEYS,
  handleErrors,
  Hotkeys,
  ImageExt,
  mergePreset,
  migrateReencodeDimensions,
  NestedKeys,
  SubtitleMode,
  VideoCodec,
  VideoExt,
} from "medior/utils/common";

type DevToolsMode = null | Electron.OpenDevToolsOptions["mode"];

export type AudioSimilarityModel = "ced-base" | "ced-mini" | "ced-small" | "ced-tiny";

export const AUDIO_SIMILARITY_DEVICE_OPTIONS: Array<{
  label: string;
  value: Config["file"]["similarity"]["audio"]["device"];
}> = [
  { label: "CPU", value: "cpu" },
  { label: "DirectML", value: "dml" },
];

export const AUDIO_SIMILARITY_LAYER_OPTIONS: Array<{
  label: string;
  value: Config["file"]["similarity"]["audio"]["layer"];
}> = [
  { label: "Final", value: "final" },
  { label: "Middle", value: "middle" },
];

export const AUDIO_SIMILARITY_MODELS: Array<{
  dimensions: number;
  label: string;
  value: AudioSimilarityModel;
}> = [
  { dimensions: 192, label: "CED-Tiny", value: "ced-tiny" },
  { dimensions: 256, label: "CED-Mini", value: "ced-mini" },
  { dimensions: 384, label: "CED-Small", value: "ced-small" },
  { dimensions: 768, label: "CED-Base", value: "ced-base" },
];

export const DEV_TOOLS_MODES: Array<{ label: string; value: DevToolsMode }> = [
  { label: "Closed", value: null },
  { label: "Bottom", value: "bottom" },
  { label: "Detached", value: "detach" },
  { label: "Left", value: "left" },
  { label: "Right", value: "right" },
  { label: "Undocked", value: "undocked" },
];

export const SIMILARITY_DEVICE_OPTIONS: Array<{
  label: string;
  value: Config["file"]["similarity"]["visual"]["device"];
}> = [
  { label: "CPU", value: "cpu" },
  { label: "CUDA", value: "cuda" },
  { label: "DirectML", value: "dml" },
  { label: "GPU", value: "gpu" },
  { label: "WebGPU", value: "webgpu" },
];

export type ReencodeCandidateType = "gif" | "image" | "video";

export type TranscriptionModel =
  | "onnx-community/whisper-base_timestamped"
  | "onnx-community/whisper-large-v3-turbo_timestamped"
  | "onnx-community/whisper-medium_timestamped"
  | "onnx-community/whisper-small_timestamped"
  | "onnx-community/whisper-tiny_timestamped";

export type TranscriptionQuantization =
  "bnb4" | "fp16" | "fp32" | "int8" | "q4" | "q4f16" | "q8" | "uint8";

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
      /** Folder for intermediate media files. Empty keeps them beside their storage location. */
      scratchPath: string;
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
    /** Deleted files keep a gzipped copy of their record beside each of their checksums. */
    keepDeletedMetadata: boolean;
    reencode: {
      codec: string;
      /** Files with these tags or their descendants never qualify for Add Re-encodes. */
      excludedDescTagIds: string[];
      imageConcurrency: number;
      imageExt: ImageExt;
      imageJpgQuality: number;
      imageMaxLongEdge: number;
      imageMaxShortEdge: number;
      maxBitrate: number;
      maxFps: number;
      maxLongEdge: number;
      maxShortEdge: number;
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
      /** Longest video, in seconds, that qualifies for Add Re-encodes. Null has no limit. */
      queueMaxDuration: number | null;
      /** Types whose next qualifying batch is queued whenever the re-encode queue runs out. */
      queueTypes: ReencodeCandidateType[];
      videoConcurrency: number;
    };
    remuxTypes: {
      toMp4: Array<Omit<VideoExt, "mp4">>;
    };
    search: Search;
    showFileName: boolean;
    similarity: {
      audio: {
        /** Ten-second chunks per inference batch. */
        batchSize: number;
        device: "cpu" | "dml";
        /** Milliseconds between window starts, rounded to the model's 160 ms steps. */
        hopMs: number;
        /** Model layer whose embeddings are stored; each layer has its own table. */
        layer: "final" | "middle";
        model: AudioSimilarityModel;
        /** Windows quieter than this RMS level, in dB below full scale, are not stored. */
        silenceThresholdDb: number;
        /** Milliseconds each window covers, rounded to the model's 160 ms steps. */
        windowMs: number;
      };
      batchSize?: number;
      /** Threads LanceDB may use for vector search and search index builds. */
      cpuThreads: number;
      defaultLimit: number;
      device?: "cpu" | "cuda" | "dml" | "gpu" | "webgpu";
      dtype?: "fp16" | "fp32" | "q4" | "q8";
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
        inferenceDType: "fp16" | "fp32" | "q4" | "q8";
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
    flattenTo: number;
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
    mediaProgramLanguage: string;
    mediaProgramMedium: string;
    mediaProgramType: string;
    subtitleMode: SubtitleMode;
    useSavedConfigs: boolean;
    withDelimiters: boolean;
    withDiffModel: boolean;
    withDiffParams: boolean;
    withDiffRegEx: boolean;
    withDiffTags: boolean;
    withFileNameToTags: boolean;
    withFlattenTo: boolean;
    withFolderNameRegEx: boolean;
    withMediaPrograms: boolean;
    withNewTagsToRegEx: boolean;
    withSidecar: boolean;
  };
  mediaPrograms: {
    languages: string[];
    manager: {
      search: Search;
    };
    mediums: string[];
    types: string[];
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
      scratchPath: "",
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
    keepDeletedMetadata: false,
    reencode: {
      codec: "libx265",
      excludedDescTagIds: [],
      imageConcurrency: 2,
      imageExt: "jpg",
      imageJpgQuality: 90,
      imageMaxLongEdge: 2560,
      imageMaxShortEdge: 1440,
      maxBitrate: 5000,
      maxFps: 60,
      maxLongEdge: 1920,
      maxShortEdge: 1080,
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
      queueMaxDuration: null,
      queueTypes: [],
      videoConcurrency: 1,
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
      audio: {
        batchSize: 8,
        device: "dml",
        hopMs: 1000,
        layer: "final",
        model: "ced-mini",
        silenceThresholdDb: -50,
        windowMs: 2000,
      },
      cpuThreads: Math.max(1, Math.floor(availableParallelism() / 4)),
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
    flattenTo: null,
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
    mediaProgramLanguage: null,
    mediaProgramMedium: null,
    mediaProgramType: null,
    subtitleMode: "keep",
    useSavedConfigs: true,
    withDelimiters: true,
    withDiffModel: true,
    withDiffParams: false,
    withDiffRegEx: true,
    withDiffTags: true,
    withFileNameToTags: false,
    withFlattenTo: false,
    withFolderNameRegEx: true,
    withMediaPrograms: false,
    withNewTagsToRegEx: true,
    withSidecar: false,
  },
  mediaPrograms: {
    languages: ["English", "Korean", "Japanese", "Chinese", "French", "Spanish", "German"],
    manager: {
      search: {
        pageSize: 50,
        sort: { isDesc: true, key: "dateModified" },
      },
    },
    mediums: ["Animated", "Live-Action"],
    types: ["Show", "Movie", "Podcast", "Livestream"],
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
  // Saved lists replace the defaults; an index merge would restore removed entries. Both sides are
  // copied so the live config never shares arrays with the defaults or the caller.
  config = mergePreset(structuredClone(DEFAULT_CONFIG), structuredClone(value));

  return config;
};

/** Writes a temporary file and renames it over the config, so readers never see a partial file. */
const writeConfig = async (filePath: string, value: Config) => {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });

    throw error;
  }
};

export const getAvailableFileStorage = (bytesNeeded: number) =>
  handleErrors(async () => {
    for (const location of config.db.fileStorage.locations) {
      let storagePath = path.resolve(location);

      while (true) {
        try {
          const { bavail, bsize } = await fs.statfs(storagePath);

          if (bavail * bsize > bytesNeeded) return { bytesLeft: bavail * bsize, location };

          break;
        } catch (error) {
          if (error.code !== "ENOENT" || storagePath === path.dirname(storagePath)) throw error;

          storagePath = path.dirname(storagePath);
        }
      }
    }

    throw new Error("No available file storage location found.");
  });

/** Returns the configured scratch folder, or the given storage-side folder when none is set. */
export const getScratchFolder = (storageFolder: string) =>
  getConfig().db.fileStorage.scratchPath || storageFolder;

/** Scratch output that may still be in use: the scratch folder, or storage's own scratch without one. */
export const getIsActiveScratchPath = (filePath: string) => {
  const { scratchPath } = getConfig().db.fileStorage;

  return scratchPath ? isWithinFolder(scratchPath, filePath) : getIsStorageScratchPath(filePath);
};

export const getIsStoragePath = (filePath: string) =>
  getConfig().db.fileStorage.locations.some((location) => isWithinFolder(location, filePath));

/** Scratch output written into storage without a scratch folder: `_tmp` folders and transform temp files. */
export const getIsStorageScratchPath = (filePath: string) =>
  getConfig().db.fileStorage.locations.some(
    (location) =>
      isWithinFolder(path.join(location, "_tmp"), filePath) ||
      (!path.relative(location, path.dirname(filePath)) &&
        path.basename(filePath).startsWith("temp-")),
  );

export const getConfig = () => {
  if (!config) throw new Error("Config not loaded.");

  return config;
};

export const getAudioSimilarityModel = () => {
  const { model } = getConfig().file.similarity.audio;
  const modelDef = AUDIO_SIMILARITY_MODELS.find(({ value }) => value === model);
  if (!modelDef) throw new Error(`Unknown audio similarity model: ${model}.`);
  return modelDef;
};

export const getIsAnimated = (ext?: string | null) =>
  Boolean(ext && ["gif", ...getConfig().file.videoExts].includes(ext.toLowerCase()));

export const getIsImage = (ext?: string | null) =>
  Boolean(ext && getConfig().file.imageExts.includes(ext.toLowerCase() as ImageExt));

export const getIsRemuxable = (ext?: string | null) =>
  Boolean(ext && getConfig().file.remuxTypes.toMp4.includes(ext.toLowerCase()));

export const getIsVideo = (ext?: string | null) =>
  Boolean(ext && getConfig().file.videoExts.includes(ext.toLowerCase() as VideoExt));

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

    const fileText = await fs.readFile(filePath, "utf-8");
    const loadedConfig: Config = JSON.parse(fileText);

    const migratedDimensions = migrateReencodeDimensions(loadedConfig);

    setConfig(loadedConfig);

    if (migratedDimensions) await writeConfig(filePath, config);

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
    config.file.similarity.audio.batchSize = +config.file.similarity.audio.batchSize;
    config.file.similarity.audio.hopMs = +config.file.similarity.audio.hopMs;
    config.file.similarity.audio.silenceThresholdDb =
      +config.file.similarity.audio.silenceThresholdDb;
    config.file.similarity.audio.windowMs = +config.file.similarity.audio.windowMs;
    config.file.similarity.defaultLimit = +config.file.similarity.defaultLimit;
    config.file.similarity.index.ivfPq.maxIterations =
      +config.file.similarity.index.ivfPq.maxIterations;
    config.file.similarity.index.ivfPq.nprobes = +config.file.similarity.index.ivfPq.nprobes;
    config.file.similarity.index.ivfPq.numBits = +config.file.similarity.index.ivfPq.numBits as
      4 | 8;
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
    config.mediaPrograms.manager.search.pageSize = +config.mediaPrograms.manager.search.pageSize;
    config.ports.db = +config.ports.db;
    config.ports.server = +config.ports.server;
    config.ports.socket = +config.ports.socket;
    config.ports.vector = +config.ports.vector;
    config.tags.manager.search.pageSize = +config.tags.manager.search.pageSize;

    return config;
  } catch (err) {
    // Starting on defaults would show an empty library, and saving settings would overwrite the file.
    const message = `The config at ${filePath} could not be loaded: ${err.message}`;
    fileLog(message, { type: "error" });
    throw new Error(message);
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
