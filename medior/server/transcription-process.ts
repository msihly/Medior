import path from "path";
import type { Config, TranscriptionQuantization } from "medior/utils/server/config";
import { toModelLoadError } from "medior/utils/server/model-downloads";
import { registerNativeWorker } from "medior/utils/server/native-worker";

const AUDIO_SAMPLE_RATE = 16_000;
const TRANSCRIPTION_CHUNK_LENGTH = 29;
const TRANSCRIPTION_PROGRESS_INTERVAL = 5_000;
const TRANSCRIPTION_STRIDE_LENGTH = 5;
/** The start-of-transcript, language, and task tokens that prompt each pass of a multilingual model with timestamps. */
const WHISPER_PROMPT_LENGTH = 3;

interface ModelProgress {
  file?: string;
  progress?: number;
  status: "done" | "download" | "initiate" | "progress" | "ready";
}

interface TranscriptionResult {
  chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
  text: string;
}

/** Where the transcription is in the whole file, in seconds, with the segment it just closed, if any. */
interface TranscriptionProgress {
  duration: number;
  position: number;
  segment?: TranscriptSegment;
}

interface TranscriptSegment {
  end: number;
  start: number;
  text: string;
}

interface Transcriber {
  (
    samples: Float32Array,
    options: {
      chunk_length_s: number;
      language: string;
      max_new_tokens: number;
      return_timestamps: true;
      streamer: TranscriptionStreamer;
      stride_length_s: number;
    },
  ): Promise<TranscriptionResult>;
  dispose: () => Promise<void>;
  model: {
    /** The generation settings a pass uses, from the model's own configuration. */
    _prepare_generation_config: (config: null, kwargs: object) => { max_length: number };
  };
  tokenizer: {
    decode: (tokens: bigint[], options: { skip_special_tokens: boolean }) => string;
    /** The first timestamp token's ID; every ID from it on is a timestamp. */
    timestamp_begin: number;
  };
}

type TranscriptionDevice = "cpu" | "dml";

interface TranscriptionStreamer {
  end: () => void;
  put: (value: bigint[][]) => void;
}

interface TransformersModule {
  env: { allowRemoteModels: boolean; cacheDir: string };
  pipeline: (
    task: "automatic-speech-recognition",
    model: string,
    options: {
      device: TranscriptionDevice;
      dtype: TranscriptionQuantization;
      progress_callback: (progress: ModelProgress) => void;
    },
  ) => Promise<Transcriber>;
  WhisperTextStreamer: new (
    tokenizer: unknown,
    options: {
      callback_function: () => void;
      on_chunk_end: (time: number) => void;
      on_chunk_start: (time: number) => void;
      on_finalize: () => void;
      skip_prompt: true;
      token_callback_function: (tokens: bigint[]) => void;
    },
  ) => TranscriptionStreamer;
}

type ProgressReporter = (
  message: string,
  progress?: number,
  transcription?: TranscriptionProgress,
) => void;

let transcriptionConfig: Config["file"]["transcription"];
let transcriber: Transcriber;
let transcriberKey = "";
let transformers: TransformersModule;

const getTranscriber = async (onProgress?: ProgressReporter) => {
  const config = transcriptionConfig;
  const key = `${config.model}:${config.modelCachePath}:${config.quantization}`;

  if (transcriber && transcriberKey === key) return transcriber;

  if (transcriber) {
    await transcriber.dispose();
    transcriber = null;
    transcriberKey = "";
  }

  // Packaged apps reach node_modules via NODE_PATH, which require follows and import() doesn't.
  transformers ??= require("@huggingface/transformers") as TransformersModule;

  // Models come only from the cache unless Settings allows downloading them from Hugging Face.
  transformers.env.allowRemoteModels = config.modelDownloads;
  transformers.env.cacheDir = path.resolve(config.modelCachePath);

  let reportedProgress = -1;

  onProgress?.("Preparing transcription model.");

  const loadTranscriber = async (device: TranscriptionDevice) => {
    try {
      return await transformers.pipeline("automatic-speech-recognition", config.model, {
        device,
        dtype: config.quantization,
        progress_callback: ({ file, progress, status }) => {
          if (status === "ready") {
            onProgress?.(`Transcription model loaded on ${device === "dml" ? "GPU" : "CPU"}.`);
          } else if (status === "progress" && progress !== undefined) {
            const percent = Math.round(progress);

            if (reportedProgress !== percent) {
              reportedProgress = percent;

              if (percent === 100) onProgress?.("Loading transcription model.");
              else onProgress?.(`Downloading transcription model: ${file}.`, percent);
            }
          }
        },
      });
    } catch (error) {
      throw toModelLoadError(error, {
        isDownloadAllowed: config.modelDownloads,
        modelLabel: "transcription",
        settingsPath: "Settings → Files → Audio Metadata",
      });
    }
  };

  try {
    transcriber = await loadTranscriber("dml");
  } catch (error) {
    console.warn("Failed to initialize GPU transcription. Falling back to CPU.", error);
    onProgress?.("GPU transcription unavailable. Falling back to CPU.");
    transcriber = await loadTranscriber("cpu");
  }

  transcriberKey = key;

  return transcriber;
};

/** Where the samples' transcribed stretch lies in their file, and the file's length, in seconds. */
interface FileSpan {
  duration: number;
  end: number;
  start: number;
}

const transcribe = async (
  samples: Float32Array,
  fileSpan: FileSpan,
  onProgress?: ProgressReporter,
) => {
  const _transcribe = await getTranscriber(onProgress);

  const scriptChunkCount = Math.max(
    1,
    Math.ceil(
      Math.max(samples.length - AUDIO_SAMPLE_RATE * TRANSCRIPTION_CHUNK_LENGTH, 0) /
        (AUDIO_SAMPLE_RATE * (TRANSCRIPTION_CHUNK_LENGTH - 2 * TRANSCRIPTION_STRIDE_LENGTH)),
    ) + 1,
  );

  const audioSeconds = samples.length / AUDIO_SAMPLE_RATE;
  const { tokenizer } = _transcribe;

  let completedChunkCount = 0;
  let currentChunkProgress = 0;
  let lastReportedAt = 0;
  let lastReportedProgress = -1;
  /** The open segment's start in its chunk and its text tokens, or null between segments. */
  let openSegment: { start: number; tokens: bigint[] } = null;

  /** Where the chunk being transcribed starts in the samples, and how long it runs, in seconds. */
  const getChunk = () => {
    const offset =
      completedChunkCount * (TRANSCRIPTION_CHUNK_LENGTH - 2 * TRANSCRIPTION_STRIDE_LENGTH);

    return { length: Math.min(TRANSCRIPTION_CHUNK_LENGTH, audioSeconds - offset), offset };
  };

  /** Sends the position in the whole file every few seconds and once done, and a finished segment at once. */
  const reportTranscriptionProgress = (segment?: TranscriptSegment) => {
    const progress = Math.min(
      100,
      Math.round(((completedChunkCount + currentChunkProgress) / scriptChunkCount) * 100),
    );

    const now = Date.now();

    const isRedundant =
      !segment &&
      lastReportedProgress >= 0 &&
      (progress === 100
        ? lastReportedProgress === 100
        : now - lastReportedAt < TRANSCRIPTION_PROGRESS_INTERVAL);

    if (isRedundant) return;

    lastReportedAt = now;
    lastReportedProgress = progress;

    const position = fileSpan.start + ((fileSpan.end - fileSpan.start) * progress) / 100;

    onProgress?.("Transcribing audio.", (position / fileSpan.duration) * 100, {
      duration: fileSpan.duration,
      position,
      segment,
    });
  };

  /**
   * Timestamps alternate between opening and closing a segment within a chunk.
   * The streamer's own alternation carries across chunks, so a chunk ending inside a segment throws it off; both of its timestamp callbacks only mark a timestamp here.
   * A closed segment is sent unless its middle lies in a stride the neighboring chunk also transcribes, which the merged result settles.
   */
  const handleTimestamp = (time: number) => {
    const chunk = getChunk();

    currentChunkProgress = Math.max(currentChunkProgress, Math.min(time / chunk.length, 1));

    if (!openSegment) openSegment = { start: time, tokens: [] };
    else {
      const midpoint = (openSegment.start + time) / 2;
      const text = tokenizer.decode(openSegment.tokens, { skip_special_tokens: true }).trim();
      const isInStride =
        (completedChunkCount > 0 && midpoint < TRANSCRIPTION_STRIDE_LENGTH) ||
        (chunk.offset + TRANSCRIPTION_CHUNK_LENGTH < audioSeconds &&
          midpoint >= chunk.length - TRANSCRIPTION_STRIDE_LENGTH);

      reportTranscriptionProgress(
        text && !isInStride
          ? { end: chunk.offset + time, start: chunk.offset + openSegment.start, text }
          : undefined,
      );

      openSegment = null;
    }
  };

  reportTranscriptionProgress();

  const streamer = new transformers.WhisperTextStreamer(tokenizer, {
    callback_function: () => undefined,
    on_chunk_end: handleTimestamp,
    on_chunk_start: handleTimestamp,
    on_finalize: () => {
      completedChunkCount++;
      currentChunkProgress = 0;
      // A segment the chunk ended inside is left for the merged result.
      openSegment = null;
      reportTranscriptionProgress();
    },
    skip_prompt: true,
    token_callback_function: (tokens) => {
      // Timestamp tokens arrive here too, after their callback, and hold no text.
      if (openSegment && Number(tokens[0]) < tokenizer.timestamp_begin)
        openSegment.tokens.push(...tokens);

      reportTranscriptionProgress();
    },
  });

  // The pipeline splits the audio into overlapping chunks and merges them, so each chunk is generated in one pass with the token budget the model gives a pass.
  // Without a token limit, Whisper's generate instead seeks through each chunk's padded 30 seconds in repeated passes, and a pass whose last segment ends at 0.00 never advances.
  const { max_length } = _transcribe.model._prepare_generation_config(null, {});

  const result = await _transcribe(samples, {
    chunk_length_s: TRANSCRIPTION_CHUNK_LENGTH,
    // English is what Whisper uses without a language, which it otherwise warns about on every pass.
    language: "en",
    max_new_tokens: max_length - WHISPER_PROMPT_LENGTH,
    return_timestamps: true,
    streamer: {
      end: () => streamer.end(),
      put: (value) => {
        if (value[0]?.length) streamer.put(value);
      },
    },
    stride_length_s: TRANSCRIPTION_STRIDE_LENGTH,
  });

  return {
    segments: (result.chunks ?? []).map(({ text, timestamp }) => ({
      end: timestamp[1] ?? timestamp[0],
      start: timestamp[0],
      text: text.trim(),
    })),
    text: result.text.trim(),
  };
};

registerNativeWorker(
  async (
    input: { config: Config["file"]["transcription"]; fileSpan: FileSpan; samples: Float32Array },
    onProgress: ProgressReporter,
  ) => {
    transcriptionConfig = input.config;

    return transcribe(input.samples, input.fileSpan, onProgress);
  },
);
