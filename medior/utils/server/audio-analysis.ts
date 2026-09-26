import ffmpeg from "fluent-ffmpeg";
import { getConfig } from "medior/utils/server/config";
import { runNativeTask, stopNativeTask } from "medior/utils/server/native-task";
import { workSignal } from "medior/utils/server/work-signal";

const AUDIO_SAMPLE_RATE = 16_000;
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

type ProgressReporter = (message: string, progress?: number) => void;

const transcriptionModelOwners = new Map<string, AbortSignal>();

export const retainTranscriptionModel = (ownerId: string, signal = workSignal.getStore()) => {
  transcriptionModelOwners.set(ownerId, signal);
};

export const releaseTranscriptionModel = async (ownerId: string) => {
  if (!transcriptionModelOwners.has(ownerId)) return;

  stopNativeTask("transcription", transcriptionModelOwners.get(ownerId));
  transcriptionModelOwners.delete(ownerId);
};

const extractAudio = (filePath: string, signal?: AbortSignal, onProgress?: ProgressReporter) =>
  new Promise<Float32Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    signal?.throwIfAborted();

    const command = ffmpeg(filePath)
      .noVideo()
      .audioChannels(1)
      .audioCodec("pcm_f32le")
      .audioFrequency(AUDIO_SAMPLE_RATE)
      .format("f32le");

    const cleanup = () => signal?.removeEventListener("abort", abort);

    const abort = () => {
      command.kill("SIGKILL");
      cleanup();
      reject(signal?.reason ?? new Error("Audio analysis cancelled."));
    };

    command.on("progress", ({ timemark }) => {
      onProgress?.(`Extracting audio: ${timemark}.`);
    });

    command.on("start", () => {
      if (signal?.aborted) abort();
    });

    command.on("error", (error) => {
      cleanup();
      reject(error);
    });

    command.on("end", async () => {
      try {
        signal?.throwIfAborted();

        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length % Float32Array.BYTES_PER_ELEMENT !== 0)
          throw new Error("FFmpeg returned incomplete float audio samples");

        const samples = new Float32Array(audioBuffer.length / Float32Array.BYTES_PER_ELEMENT);

        for (let index = 0; index < samples.length; index++) {
          if (index % 65536 === 0) {
            await new Promise<void>((resolve) => setImmediate(resolve));
            signal?.throwIfAborted();
          }

          samples[index] = audioBuffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
        }

        resolve(samples);
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    });

    signal?.addEventListener("abort", abort, { once: true });

    const stream = command.pipe();
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.on("error", (error) => {
      command.kill("SIGKILL");
      cleanup();
      reject(error);
    });
  });

const analyzeSamples = async (
  samples: Float32Array,
  withWaveform: boolean,
  signal?: AbortSignal,
) => {
  const waveformPeaks = withWaveform
    ? Array.from({ length: Math.min(WAVEFORM_PEAK_COUNT, samples.length) }, () => 0)
    : null;

  let peak = 0;

  for (let index = 0; index < samples.length; index++) {
    if (index % 65536 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      signal?.throwIfAborted();
    }

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

export const analyzeAudio = async (
  filePath: string,
  onProgress?: ProgressReporter,
  signal = workSignal.getStore(),
  options: { withTranscription?: boolean; withWaveform?: boolean } = {},
): Promise<AudioAnalysis> => {
  const config = getConfig().file;
  const withTranscription = options.withTranscription ?? config.transcription.enabled;
  const withWaveform = options.withWaveform ?? config.waveform.enabled;

  onProgress?.("Extracting audio.");

  const samples = await extractAudio(filePath, signal, onProgress);

  onProgress?.(`Audio duration: ${formatDuration(samples.length / AUDIO_SAMPLE_RATE)}.`);

  onProgress?.(withWaveform ? "Generating waveform." : "Measuring peak volume.");

  const analysis = await analyzeSamples(samples, withWaveform, signal);

  if (!withTranscription || !samples.length) return analysis;

  onProgress?.("Transcribing audio.");

  return {
    ...analysis,
    transcription: await runNativeTask<AudioAnalysis["transcription"]>(
      "transcription",
      { config: config.transcription, samples },
      signal ?? workSignal.getStore(),
      onProgress,
    ),
  };
};
