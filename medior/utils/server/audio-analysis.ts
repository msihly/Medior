import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { getConfig, TranscriptionQuantization } from "medior/utils/server/config";

const AUDIO_SAMPLE_RATE = 16_000;
const TRANSCRIPTION_CHUNK_LENGTH = 29;
const TRANSCRIPTION_PROGRESS_INTERVAL = 5_000;
const TRANSCRIPTION_STRIDE_LENGTH = 5;
const WAVEFORM_PEAK_COUNT = 1_000;

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

export interface AudioAnalysis {
  peakDecibels: number;
  transcription?: {
    segments: Array<{ end: number; start: number; text: string }>;
    text: string;
  };
  waveformPeaks?: number[];
}

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

let transcriber: Transcriber;
let transcriberKey = "";
const transcriptionModelOwners = new Set<string>();
let transcriptionQueue = Promise.resolve();
let transformers: TransformersModule;

export const retainTranscriptionModel = (ownerId: string) => {
  transcriptionModelOwners.add(ownerId);
};

export const releaseTranscriptionModel = async (ownerId: string) => {
  if (!transcriptionModelOwners.delete(ownerId)) return;
  if (transcriptionModelOwners.size) return;

  await transcriptionQueue;
  if (transcriptionModelOwners.size || !transcriber) return;

  const loadedTranscriber = transcriber;
  transcriber = undefined;
  transcriberKey = "";
  await loadedTranscriber.dispose();
};

const extractAudio = (filePath: string, signal?: AbortSignal) =>
  new Promise<Float32Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    signal?.throwIfAborted();

    const command = ffmpeg(filePath)
      .noVideo()
      .audioChannels(1)
      .audioCodec("pcm_f32le")
      .audioFrequency(AUDIO_SAMPLE_RATE)
      .format("wav");
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      command.kill("SIGKILL");
      cleanup();
      reject(signal?.reason ?? new Error("Audio analysis cancelled."));
    };
    const stream = command.on("error", (error) => (cleanup(), reject(error))).pipe();

    signal?.addEventListener("abort", abort, { once: true });

    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));

    stream.on("end", () => {
      cleanup();
      if (signal?.aborted) return reject(signal.reason);

      const buffer = Buffer.concat(chunks);

      let dataOffset = 12;

      while (
        dataOffset + 8 <= buffer.length &&
        buffer.toString("ascii", dataOffset, dataOffset + 4) !== "data"
      )
        dataOffset +=
          8 + buffer.readUInt32LE(dataOffset + 4) + (buffer.readUInt32LE(dataOffset + 4) % 2);

      if (dataOffset + 8 > buffer.length)
        return reject(new Error("FFmpeg returned invalid WAV audio"));

      const audioBuffer = buffer.subarray(dataOffset + 8);

      const samples = new Float32Array(
        Math.floor(audioBuffer.length / Float32Array.BYTES_PER_ELEMENT),
      );

      for (let index = 0; index < samples.length; index++)
        samples[index] = audioBuffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);

      resolve(samples);
    });
  });

const getTranscriber = async (onProgress?: ProgressReporter, signal?: AbortSignal) => {
  const config = getConfig().file.transcription;
  const key = `${config.model}:${config.modelCachePath}:${config.quantization}`;

  signal?.throwIfAborted();
  if (transcriber && transcriberKey === key) return transcriber;

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
          return;
        }

        if (status !== "progress" || progress === undefined) return;

        const percent = Math.round(progress);

        if (reportedProgress === percent) return;

        reportedProgress = percent;

        if (percent === 100) onProgress?.("Loading transcription model.");
        else onProgress?.(`Downloading transcription model: ${file}.`, percent);
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

const analyzeSamples = (samples: Float32Array, withWaveform: boolean) => {
  const waveformPeaks = withWaveform
    ? Array.from({ length: Math.min(WAVEFORM_PEAK_COUNT, samples.length) }, () => 0)
    : null;

  let peak = 0;

  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];

    if (waveformPeaks) {
      const waveformIndex = Math.min(
        waveformPeaks.length - 1,
        Math.floor((index / samples.length) * waveformPeaks.length),
      );

      if (Math.abs(sample) > Math.abs(waveformPeaks[waveformIndex]))
        waveformPeaks[waveformIndex] = sample;
    }

    peak = Math.max(peak, Math.abs(sample));
  }

  return {
    peakDecibels: peak ? Math.max(-120, 20 * Math.log10(peak)) : -120,
    waveformPeaks: waveformPeaks ?? undefined,
  };
};

const transcribe = (samples: Float32Array, onProgress?: ProgressReporter, signal?: AbortSignal) => {
  const queued = transcriptionQueue.then(async () => {
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
  });

  transcriptionQueue = queued.then(
    () => undefined,
    () => undefined,
  );

  return queued;
};

export const analyzeAudio = async (
  filePath: string,
  onProgress?: ProgressReporter,
  signal?: AbortSignal,
  options: { withTranscription?: boolean; withWaveform?: boolean } = {},
): Promise<AudioAnalysis> => {
  const config = getConfig().file;
  const withTranscription = options.withTranscription ?? config.transcription.enabled;
  const withWaveform = options.withWaveform ?? config.waveform.enabled;

  onProgress?.("Extracting audio.");
  const samples = await extractAudio(filePath, signal);
  onProgress?.(`Audio duration: ${formatDuration(samples.length / AUDIO_SAMPLE_RATE)}.`);

  onProgress?.(withWaveform ? "Generating waveform." : "Measuring peak volume.");
  const analysis = analyzeSamples(samples, withWaveform);

  if (!withTranscription) return analysis;
  onProgress?.("Transcribing audio.");
  return { ...analysis, transcription: await transcribe(samples, onProgress, signal) };
};
