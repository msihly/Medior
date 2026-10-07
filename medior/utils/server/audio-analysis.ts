import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import os from "os";
import { getConfig } from "medior/utils/server/config";
import { runNativeTask, stopNativeTask } from "medior/utils/server/native-task";
import { workSignal } from "medior/utils/server/work-signal";

const AUDIO_SAMPLE_RATE = 16_000;
const TRANSCRIPTION_CONTEXT_SECONDS = 5;
const TRANSCRIPTION_WINDOW_SECONDS = 300;
const WAVEFORM_PEAK_COUNT = 1000;

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

const extractAudio = (
  filePath: string,
  outputPath: string,
  signal?: AbortSignal,
  onProgress?: ProgressReporter,
) =>
  new Promise<void>((resolve, reject) => {
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
    };

    signal?.addEventListener("abort", abort, { once: true });
    command.on("start", () => {
      if (signal?.aborted) abort();
    });

    command.on("progress", ({ timemark }) => onProgress?.(`Extracting audio: ${timemark}.`));
    command.on("error", (error) => {
      cleanup();
      reject(signal?.aborted ? signal.reason : error);
    });

    command.on("end", () => {
      cleanup();

      if (signal?.aborted) reject(signal.reason);
      else resolve();
    });

    command.output(outputPath).run();
  });

export const analyzeAudio = async (
  filePath: string,
  onProgress?: ProgressReporter,
  signal = workSignal.getStore(),
  options: { withTranscription?: boolean; withWaveform?: boolean } = {},
): Promise<AudioAnalysis> => {
  const config = getConfig().file;
  const withTranscription = options.withTranscription ?? config.transcription.enabled;
  const withWaveform = options.withWaveform ?? config.waveform.enabled;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "medior-audio-"));
  const pcmPath = path.join(directory, "audio.f32le");

  try {
    onProgress?.("Extracting audio.");
    await extractAudio(filePath, pcmPath, signal, onProgress);

    const sampleCount = (await fs.stat(pcmPath)).size / Float32Array.BYTES_PER_ELEMENT;

    if (!Number.isSafeInteger(sampleCount))
      throw new Error("FFmpeg returned incomplete audio samples.");

    const waveformPeaks = withWaveform
      ? Array.from({ length: Math.min(WAVEFORM_PEAK_COUNT, sampleCount) }, () => 0)
      : undefined;

    let peak = 0;
    let pendingSamples = Buffer.alloc(0);
    let sampleIndex = 0;

    onProgress?.(withWaveform ? "Generating waveform." : "Measuring peak volume.");

    for await (const chunk of createReadStream(pcmPath, { highWaterMark: 65536 })) {
      signal?.throwIfAborted();

      const data = pendingSamples.length ? Buffer.concat([pendingSamples, chunk]) : chunk;
      const completeBytes = data.length - (data.length % Float32Array.BYTES_PER_ELEMENT);

      pendingSamples = data.subarray(completeBytes);

      for (let offset = 0; offset < completeBytes; offset += Float32Array.BYTES_PER_ELEMENT) {
        const sample = data.readFloatLE(offset);

        peak = Math.max(peak, Math.abs(sample));

        if (waveformPeaks?.length) {
          const index = Math.min(
            waveformPeaks.length - 1,
            Math.floor((sampleIndex * waveformPeaks.length) / sampleCount),
          );

          if (Math.abs(sample) > Math.abs(waveformPeaks[index])) waveformPeaks[index] = sample;
        }

        sampleIndex++;
      }
    }

    if (pendingSamples.length || sampleIndex !== sampleCount)
      throw new Error("Extracted audio ended unexpectedly.");

    const analysis: AudioAnalysis = {
      peakDecibels: peak ? Math.max(-120, 20 * Math.log10(peak)) : -120,
      waveformPeaks,
    };

    if (withTranscription && sampleCount) {
      const audio = await fs.open(pcmPath, "r");
      const segments: AudioAnalysis["transcription"]["segments"] = [];
      const windowSamples = TRANSCRIPTION_WINDOW_SECONDS * AUDIO_SAMPLE_RATE;
      const contextSamples = TRANSCRIPTION_CONTEXT_SECONDS * AUDIO_SAMPLE_RATE;

      try {
        for (let start = 0; start < sampleCount; start += windowSamples) {
          signal?.throwIfAborted();

          const end = Math.min(sampleCount, start + windowSamples);
          const readStart = Math.max(0, start - contextSamples);
          const readEnd = Math.min(sampleCount, end + contextSamples);
          const data = Buffer.allocUnsafe((readEnd - readStart) * Float32Array.BYTES_PER_ELEMENT);
          let offset = 0;

          while (offset < data.length) {
            signal?.throwIfAborted();

            const { bytesRead } = await audio.read(
              data,
              offset,
              data.length - offset,
              readStart * Float32Array.BYTES_PER_ELEMENT + offset,
            );

            if (!bytesRead) throw new Error("Extracted audio ended unexpectedly.");

            offset += bytesRead;
          }

          const samples = new Float32Array(readEnd - readStart);

          for (let index = 0; index < samples.length; index++)
            samples[index] = data.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);

          const transcription = await runNativeTask<AudioAnalysis["transcription"]>(
            "transcription",
            { config: config.transcription, samples },
            signal,
            (message, progress) =>
              onProgress?.(
                message,
                Math.min(
                  100,
                  ((start + ((end - start) * (progress ?? 0)) / 100) / sampleCount) * 100,
                ),
              ),
          );

          const windowSegments =
            transcription.segments.length || !transcription.text.trim()
              ? transcription.segments
              : [
                  {
                    end: (end - readStart) / AUDIO_SAMPLE_RATE,
                    start: (start - readStart) / AUDIO_SAMPLE_RATE,
                    text: transcription.text,
                  },
                ];

          for (const segment of windowSegments) {
            const segmentStart = segment.start + readStart / AUDIO_SAMPLE_RATE;
            const segmentEnd = segment.end + readStart / AUDIO_SAMPLE_RATE;
            const midpoint = (segmentStart + segmentEnd) / 2;

            if (midpoint >= start / AUDIO_SAMPLE_RATE && midpoint < end / AUDIO_SAMPLE_RATE)
              segments.push({
                end: Math.min(sampleCount / AUDIO_SAMPLE_RATE, segmentEnd),
                start: Math.max(0, segmentStart),
                text: segment.text,
              });
          }
        }
      } finally {
        await audio.close();
      }

      analysis.transcription = {
        segments,
        text: segments
          .map(({ text }) => text)
          .join(" ")
          .trim(),
      };
    }

    return analysis;
  } finally {
    await fs.rm(pcmPath, { force: true });
    await fs.rmdir(directory);
  }
};
