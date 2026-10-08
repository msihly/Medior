import path from "path";
import type { Config, TranscriptionQuantization } from "medior/utils/server/config";

const AUDIO_SAMPLE_RATE = 16_000;
const TRANSCRIPTION_CHUNK_LENGTH = 29;
const TRANSCRIPTION_PROGRESS_INTERVAL = 5_000;
const TRANSCRIPTION_STRIDE_LENGTH = 5;

const formatDuration = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));

  return [
    Math.floor(totalSeconds / 3600),
    Math.floor((totalSeconds % 3600) / 60),
    totalSeconds % 60,
  ]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
};

interface ModelProgress {
  file?: string;
  progress?: number;
  status: "done" | "download" | "initiate" | "progress" | "ready";
}

interface TranscriptionResult {
  chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
  text: string;
}

interface Transcriber {
  (
    samples: Float32Array,
    options: {
      chunk_length_s: number;
      return_timestamps: true;
      streamer: TranscriptionStreamer;
      stride_length_s: number;
    },
  ): Promise<TranscriptionResult>;
  dispose: () => Promise<void>;
  tokenizer: unknown;
}

type TranscriptionDevice = "cpu" | "dml";

interface TranscriptionStreamer {
  end: () => void;
  put: (value: bigint[][]) => void;
}

interface TransformersModule {
  env: { cacheDir: string };
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
      on_finalize: () => void;
      skip_prompt: true;
      token_callback_function: (tokens: bigint[]) => void;
    },
  ) => TranscriptionStreamer;
}

type ProgressReporter = (message: string, progress?: number) => void;

let transcriptionConfig: Config["file"]["transcription"];
let transcriber: Transcriber;
let transcriberKey = "";
let transformers: TransformersModule;

const getTranscriber = async (onProgress?: ProgressReporter, signal?: AbortSignal) => {
  const config = transcriptionConfig;
  const key = `${config.model}:${config.modelCachePath}:${config.quantization}`;

  signal?.throwIfAborted();

  if (transcriber && transcriberKey === key) return transcriber;

  if (transcriber) {
    await transcriber.dispose();
    transcriber = null;
    transcriberKey = "";
  }

  transformers ??= (await import("@huggingface/transformers")) as unknown as TransformersModule;

  transformers.env.cacheDir = path.resolve(config.modelCachePath);

  let reportedProgress = -1;

  onProgress?.("Preparing transcription model.");

  const loadTranscriber = (device: TranscriptionDevice) =>
    transformers.pipeline("automatic-speech-recognition", config.model, {
      device,
      dtype: config.quantization,

      progress_callback: ({ file, progress, status }) => {
        signal?.throwIfAborted();

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

  try {
    transcriber = await loadTranscriber("dml");
  } catch (error) {
    signal?.throwIfAborted();
    console.warn("Failed to initialize GPU transcription. Falling back to CPU.", error);
    onProgress?.("GPU transcription unavailable. Falling back to CPU.");
    transcriber = await loadTranscriber("cpu");
  }

  transcriberKey = key;

  return transcriber;
};

const transcribe = async (
  samples: Float32Array,
  onProgress?: ProgressReporter,
  signal?: AbortSignal,
) => {
  signal?.throwIfAborted();

  const _transcribe = await getTranscriber(onProgress, signal);

  signal?.throwIfAborted();

  const scriptChunkCount = Math.max(
    1,
    Math.ceil(
      Math.max(samples.length - AUDIO_SAMPLE_RATE * TRANSCRIPTION_CHUNK_LENGTH, 0) /
        (AUDIO_SAMPLE_RATE * (TRANSCRIPTION_CHUNK_LENGTH - 2 * TRANSCRIPTION_STRIDE_LENGTH)),
    ) + 1,
  );

  let completedChunkCount = 0;
  let currentChunkProgress = 0;
  let generatedTokenCount = 0;
  let lastReportedAt = 0;
  let lastReportedProgress = -1;

  const reportTranscriptionProgress = () => {
    const progress = Math.round(
      ((completedChunkCount + currentChunkProgress) / scriptChunkCount) * 100,
    );

    const now = Date.now();

    const isCompleted =
      lastReportedProgress >= 0 &&
      (progress === 100
        ? lastReportedProgress === 100
        : now - lastReportedAt < TRANSCRIPTION_PROGRESS_INTERVAL);

    if (isCompleted) return;

    lastReportedAt = now;
    lastReportedProgress = progress;

    onProgress?.(
      `Transcribing audio: ${formatDuration((samples.length / AUDIO_SAMPLE_RATE) * (progress / 100))} / ${formatDuration(samples.length / AUDIO_SAMPLE_RATE)} (${progress}%, chunk ${Math.min(completedChunkCount + 1, scriptChunkCount)} of ${scriptChunkCount}, ${generatedTokenCount} tokens).`,
      progress,
    );
  };

  reportTranscriptionProgress();

  const streamer = new transformers.WhisperTextStreamer(_transcribe.tokenizer, {
    callback_function: () => undefined,

    on_chunk_end: (time) => {
      signal?.throwIfAborted();

      currentChunkProgress = Math.max(
        currentChunkProgress,
        Math.min(
          time /
            Math.min(
              TRANSCRIPTION_CHUNK_LENGTH,
              samples.length / AUDIO_SAMPLE_RATE -
                completedChunkCount *
                  (TRANSCRIPTION_CHUNK_LENGTH - 2 * TRANSCRIPTION_STRIDE_LENGTH),
            ),
          1,
        ),
      );

      reportTranscriptionProgress();
    },

    on_finalize: () => {
      signal?.throwIfAborted();
      completedChunkCount++;
      currentChunkProgress = 0;
      generatedTokenCount = 0;
      reportTranscriptionProgress();
    },

    skip_prompt: true,

    token_callback_function: (tokens) => {
      signal?.throwIfAborted();
      generatedTokenCount += tokens.length;
      reportTranscriptionProgress();
    },
  });

  const result = await _transcribe(samples, {
    chunk_length_s: TRANSCRIPTION_CHUNK_LENGTH,
    return_timestamps: true,
    streamer: {
      end: () => streamer.end(),

      put: (value) => {
        signal?.throwIfAborted();

        if (value[0]?.length) streamer.put(value);
      },
    },
    stride_length_s: TRANSCRIPTION_STRIDE_LENGTH,
  });

  signal?.throwIfAborted();

  return {
    segments: (result.chunks ?? []).map(({ text, timestamp }) => ({
      end: timestamp[1] ?? timestamp[0],
      start: timestamp[0],
      text: text.trim(),
    })),
    text: result.text.trim(),
  };
};

process.on("disconnect", () => process.exit(1));

process.on(
  "message",
  async ({
    id,
    input,
  }: {
    id: string;
    input: { config: Config["file"]["transcription"]; samples: Float32Array };
  }) => {
    try {
      transcriptionConfig = input.config;

      const data = await transcribe(input.samples, (message, percent) =>
        process.send({ id, progress: { message, percent } }),
      );

      process.send({ data, id });
    } catch (error) {
      process.send({ error: error.message, id });
    }
  },
);
