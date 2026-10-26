import fs, { FileHandle } from "fs/promises";
import path from "path";
import { execFile, spawn } from "child_process";
import os from "os";
import { checkFileExists } from "trabecula/utils/server";
import { Fmt, round } from "medior/utils/common";
import { getAudioSimilarityModel, getConfig } from "medior/utils/server/config";
import { getFfmpegPath, getFfprobePath } from "medior/utils/server/ffmpeg";
import { runNativeTask, stopNativeTask } from "medior/utils/server/native-task";
import { workSignal } from "medior/utils/server/work-signal";

/** The name of errors for audio too corrupted to decode, past ffmpeg's decode error limit. */
export const AUDIO_DECODE_ERROR = "AudioDecodeError";
const AUDIO_SAMPLE_RATE = 16_000;
/** The exported model returns one embedding token per 0.16 seconds, 2,560 samples at 16 kHz. */
const AUDIO_TOKEN_SAMPLES = 2_560;
const AUDIO_TOKEN_SECONDS = AUDIO_TOKEN_SAMPLES / AUDIO_SAMPLE_RATE;
/** The exported model takes up to 62 tokens of samples at once; whole tokens keep chunks aligned. */
const AUDIO_CHUNK_SAMPLES = 62 * AUDIO_TOKEN_SAMPLES;
/** Larger media files are left for ffmpeg to read itself. */
const MAX_CACHED_MEDIA_BYTES = 512 * 1024 * 1024;
/**
 * Media files above this rate, about 16 Mbps, are left for ffmpeg to read itself. The cutoff is an
 * unmeasured estimate.
 */
const MAX_CACHED_MEDIA_BYTES_PER_SECOND = 2 * 1024 * 1024;
/** Cached bytes that ffmpeg may still be decoding, past which the drive waits before reading on. */
const MAX_DECODING_CACHE_BYTES = 1024 * 1024 * 1024;
/** Distinct ffmpeg messages kept for an error message, past which the rest are only counted. */
const MAX_FFMPEG_MESSAGES = 20;
/** Decoded audio past this size, about nine minutes, moves from memory to a temporary file. */
const MAX_IN_MEMORY_AUDIO_BYTES = 32 * 1024 * 1024;
const MEDIA_CACHE_READ_BYTES = 8 * 1024 * 1024;
/** A file's first read is small, so it times how long the drive takes to reach the file. */
const MEDIA_FIRST_READ_BYTES = 64 * 1024;
/** Samples read at a time while measuring the peak volume and waveform. */
const PEAK_SCAN_SAMPLES = 1_048_576;
const TRANSCRIPTION_CONTEXT_SECONDS = 5;
const TRANSCRIPTION_WINDOW_SECONDS = 300;
const WAVEFORM_PEAK_COUNT = 1000;

export interface AudioVectorWindow {
  end: number;
  start: number;
  vector: number[];
}

interface AudioTokens {
  dimensions: number;
  /** Time spent waiting on the model, including passing chunks to and from its process. */
  inferenceMs: number;
  /** Mean squared sample of each token, for measuring loudness. */
  meanSquares: Float32Array;
  tokenCount: number;
  /** Token embeddings, `dimensions` values per token. */
  tokens: Float32Array;
}

export interface AudioAnalysis {
  audioWindows?: AudioVectorWindow[];
  /** Time spent waiting on the transcription and audio similarity models. */
  inferenceMs: number;
  /** Audio windows left out because their samples or embeddings held NaN or infinity. */
  invalidAudioWindowCount?: number;
  peakDecibels?: number;
  transcription?: {
    segments: Array<{ end: number; start: number; text: string }>;
    text: string;
  };
  waveformPeaks?: number[];
}

export interface AudioAnalysisOptions {
  withAudioVectors?: boolean;
  /** Measures the peak volume, which a waveform measures anyway. */
  withPeakVolume?: boolean;
  withTranscription?: boolean;
  withWaveform?: boolean;
}

/** A file's decoded 16 kHz mono samples, held in memory or, for long audio, a temporary file. */
export interface DecodedAudio {
  /** Deletes the temporary file holding long audio. */
  close: () => Promise<void>;
  /** Seconds of decoded audio. */
  duration: number;
  /** Time ffmpeg spent extracting the audio. */
  extractMs: number;
  /** A copy of a range of samples. */
  read: (start: number, end: number) => Promise<Float32Array>;
  /** Bytes read into the system file cache before ffmpeg ran. */
  readBytes: number;
  /** Time from opening the file to its first bytes arriving, the open included. */
  readFirstByteMs: number;
  /** Time spent reading the file into the system file cache before ffmpeg ran. */
  readMs: number;
  /** Time spent opening the file and reading its size. */
  readOpenMs: number;
  sampleCount: number;
}

interface ProbedAudioStream {
  channel_layout?: string;
  channels?: number;
  codec_name?: string;
  index: number;
  profile?: string;
  sample_rate?: string;
}

interface DecodeOptions {
  /** Seconds of audio to decode at most. */
  maxDuration?: number;
  onProgress?: ProgressReporter;
  range?: { end: number; start: number };
  signal?: AbortSignal;
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

/** Copies ffmpeg's little-endian floats as is, so it assumes a little-endian machine. */
const joinSamples = (chunks: Buffer[], sampleCount: number) => {
  const samples = new Float32Array(sampleCount);
  const bytes = new Uint8Array(samples.buffer);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return samples;
};

const readSamples = async (audio: FileHandle, start: number, end: number) => {
  const samples = new Float32Array(end - start);
  const bytes = new Uint8Array(samples.buffer);
  let offset = 0;

  while (offset < bytes.length) {
    const { bytesRead } = await audio.read(
      bytes,
      offset,
      bytes.length - offset,
      start * Float32Array.BYTES_PER_ELEMENT + offset,
    );
    if (!bytesRead) throw new Error("Extracted audio ended unexpectedly.");

    offset += bytesRead;
  }

  return samples;
};

/**
 * Collects ffmpeg's error output as distinct messages in the order they first appeared, without the
 * memory addresses in their prefixes, so errors repeated for every packet can't push out the first.
 * The decode error rate is kept apart, since ffmpeg reports it last.
 */
const makeFfmpegLog = () => {
  const messages = new Map<string, number>();
  let errorRate: { limit: number; rate: number } = null;
  let lastMessage: string = null;
  let otherCount = 0;
  let pending = "";
  let streamId: string = null;

  const countMessage = (message: string, times: number) => {
    if (messages.has(message)) messages.set(message, messages.get(message) + times);
    else if (messages.size < MAX_FFMPEG_MESSAGES) messages.set(message, times);
    else otherCount += times;
  };

  const addLine = (line: string) => {
    streamId ??= line.match(/\[aist#(\d+:\d+)\//)?.[1] ?? null;

    const message = line
      .replace(/\[[^\]]* @ [0-9a-f]+\]\s*/gi, "")
      .trim()
      .replace(/\.$/, "");
    if (!message) return;

    const rate = message.match(/^Decode error rate ([\d.]+) exceeds maximum ([\d.]+)/);
    const repeated = message.match(/^Last message repeated (\d+) times/);

    if (rate) errorRate = { limit: Number(rate[2]), rate: Number(rate[1]) };
    else if (repeated && lastMessage) countMessage(lastMessage, Number(repeated[1]));
    else {
      // Messages differing only in their numbers, such as band counts, are counted together.
      lastMessage = message.replace(/\d+/g, "#");
      countMessage(lastMessage, 1);
    }
  };

  return {
    finish: () => {
      addLine(pending);
      pending = "";

      return { errorRate, messages, otherCount, streamId };
    },
    write: (data: string) => {
      const lines = (pending + data).split(/\r?\n/);
      pending = lines.pop();

      for (const line of lines) addLine(line);
    },
  };
};

/** The file's audio streams for an error message, or none when ffprobe can't read them. */
const probeAudioStreams = (filePath: string, signal?: AbortSignal) =>
  new Promise<ProbedAudioStream[]>((resolve) => {
    execFile(
      getFfprobePath(),
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=channel_layout,channels,codec_name,index,profile,sample_rate",
        filePath,
      ],
      { signal, windowsHide: true },
      (error, stdout) => {
        try {
          resolve(error ? [] : (JSON.parse(stdout).streams ?? []));
        } catch {
          resolve([]);
        }
      },
    );
  });

/** Names the stream that failed, how much of it failed, and what ffmpeg reported, first to last. */
const describeDecodeFailure = async (
  filePath: string,
  {
    errorRate,
    messages,
    otherCount,
    streamId,
  }: ReturnType<ReturnType<typeof makeFfmpegLog>["finish"]>,
  code: number,
  signal?: AbortSignal,
) => {
  if (!messages.size && !errorRate) return `FFmpeg exited with code ${code}.`;

  const audioStreams = await probeAudioStreams(filePath, signal);
  const stream = audioStreams.find(({ index }) => `0:${index}` === streamId);

  const streamDetails = stream
    ? ` (${[
        [stream.codec_name, stream.profile].filter(Boolean).join(" "),
        stream.channel_layout ?? (stream.channels ? `${stream.channels} channels` : null),
        stream.sample_rate ? `${Fmt.commas(Number(stream.sample_rate))} Hz` : null,
        audioStreams.length > 1 ? `one of ${audioStreams.length} audio streams` : null,
      ]
        .filter(Boolean)
        .join(", ")})`
    : "";

  const failedShare = errorRate
    ? ` ${Math.round(errorRate.rate * 100)}% of its frames failed, over ffmpeg's ${Math.round(errorRate.limit * 100)}% limit.`
    : "";

  const reported = [...messages].map(([message, count]) =>
    count > 1 ? `${message} (×${Fmt.commas(count)})` : message,
  );

  if (otherCount) reported.push(`${Fmt.commas(otherCount)} more messages`);

  return `Could not decode ${streamId ? `audio stream ${streamId}` : "the audio"}${streamDetails}.${failedShare}${reported.length ? ` FFmpeg reported: ${reported.join("; ")}.` : ""}`;
};

/**
 * Decodes a file's audio to 16 kHz mono samples piped straight from ffmpeg. Long audio moves to a
 * temporary file once it outgrows memory.
 */
const decodeAudio = async (
  filePath: string,
  { maxDuration, onProgress, range, signal }: DecodeOptions = {},
): Promise<DecodedAudio> => {
  signal?.throwIfAborted();
  onProgress?.("Extracting audio.");

  const startedAt = Date.now();
  const args = ["-v", "error", "-nostdin"];
  // A range always ends, even an empty one, and a maximum can shorten it further.
  const outputSeconds = range
    ? Math.min(range.end - range.start, maxDuration ?? Infinity)
    : maxDuration;

  if (range) args.push("-ss", String(range.start));

  // aresample=async=1 decodes audio to the length its timestamps cover. Some files hold far more
  // encoded audio than that, which otherwise decodes in full and passes -t, since -t follows
  // timestamps; on a file with consistent timestamps, the output was checked to be unchanged.
  args.push(
    "-i",
    filePath,
    "-vn",
    "-ac",
    "1",
    "-af",
    "aresample=async=1",
    "-c:a",
    "pcm_f32le",
    "-ar",
    String(AUDIO_SAMPLE_RATE),
  );

  if (outputSeconds !== undefined) args.push("-t", String(outputSeconds));

  args.push("-f", "f32le", "pipe:1");

  const ffmpeg = spawn(getFfmpegPath(), args, {
    signal,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const exit = new Promise<{ code?: number; error?: Error }>((resolve) => {
    ffmpeg.once("close", (code) => resolve({ code }));
    ffmpeg.on("error", (error) => resolve({ error }));
  });

  const chunks: Buffer[] = [];
  const log = makeFfmpegLog();
  let byteCount = 0;
  let lastProgressAt = startedAt;
  let spill: { directory: string; file?: FileHandle } = null;

  const removeSpill = async () => {
    await spill?.file?.close();
    if (spill) await fs.rm(spill.directory, { force: true, recursive: true });
  };

  // Decoded as a stream, so characters split across chunks stay whole.
  ffmpeg.stderr.setEncoding("utf8");
  ffmpeg.stderr.on("data", log.write);

  try {
    for await (const chunk of ffmpeg.stdout) {
      chunks.push(chunk);
      byteCount += chunk.length;

      if (!spill && byteCount > MAX_IN_MEMORY_AUDIO_BYTES) {
        spill = { directory: await fs.mkdtemp(path.join(os.tmpdir(), "medior-audio-")) };
        spill.file = await fs.open(path.join(spill.directory, "audio.f32le"), "w+");
      }

      if (spill) {
        for (const buffered of chunks.splice(0)) await spill.file.appendFile(buffered);
      }

      // At most twice a second.
      if (onProgress && Date.now() - lastProgressAt >= 500) {
        lastProgressAt = Date.now();
        onProgress(
          `Extracting audio: ${Fmt.duration(byteCount / Float32Array.BYTES_PER_ELEMENT / AUDIO_SAMPLE_RATE)}.`,
        );
      }
    }

    const { code, error } = await exit;
    signal?.throwIfAborted();
    if (error) throw error;

    if (code !== 0) {
      const ffmpegLog = log.finish();
      const decodeError = new Error(await describeDecodeFailure(filePath, ffmpegLog, code, signal));

      // Audio ffmpeg read but gave up decoding is corrupted, unlike a file it couldn't open.
      if (ffmpegLog.errorRate) decodeError.name = AUDIO_DECODE_ERROR;

      throw decodeError;
    }

    if (byteCount % Float32Array.BYTES_PER_ELEMENT)
      throw new Error("FFmpeg returned incomplete audio samples.");
  } catch (error) {
    ffmpeg.kill();
    await removeSpill();

    throw signal?.aborted ? signal.reason : error;
  }

  const sampleCount = byteCount / Float32Array.BYTES_PER_ELEMENT;
  const samples = spill ? null : joinSamples(chunks, sampleCount);

  return {
    close: removeSpill,
    duration: sampleCount / AUDIO_SAMPLE_RATE,
    extractMs: Date.now() - startedAt,
    read: async (start, end) =>
      spill ? readSamples(spill.file, start, end) : samples.slice(start, end),
    readBytes: 0,
    readFirstByteMs: 0,
    readMs: 0,
    readOpenMs: 0,
    sampleCount,
  };
};

/**
 * Reads a media file through once, sequentially, so ffmpeg can then read it from the system file
 * cache. Returns nothing, reading nothing, for files over the size or rate limits, which ffmpeg
 * reads itself.
 */
const cacheMediaFile = async (
  filePath: string,
  buffer: Buffer,
  duration?: number,
  signal?: AbortSignal,
) => {
  const startedAt = Date.now();
  const file = await fs.open(filePath, "r");

  try {
    const { size } = await file.stat();
    const openMs = Date.now() - startedAt;
    if (
      size > MAX_CACHED_MEDIA_BYTES ||
      (duration > 0 && size / duration > MAX_CACHED_MEDIA_BYTES_PER_SECOND)
    )
      return null;

    await file.read(buffer, 0, MEDIA_FIRST_READ_BYTES, null);
    const firstByteMs = Date.now() - startedAt;

    while ((await file.read(buffer, 0, buffer.length, null)).bytesRead) signal?.throwIfAborted();

    return { bytes: size, firstByteMs, ms: Date.now() - startedAt, openMs };
  } finally {
    await file.close();
  }
};

/**
 * Decodes files' audio in the order they are given, reading one file from the drive at a time. Each
 * file is read into the system file cache first, then released to ffmpeg while the next file is
 * read; a file left uncached keeps the drive until ffmpeg exits.
 */
export const makeOrderedAudioDecoder = (signal?: AbortSignal) => {
  // Drive turns never overlap, so they share one read buffer and only one ever waits for decodes.
  const buffer = Buffer.allocUnsafe(MEDIA_CACHE_READ_BYTES);
  let decodingCacheBytes = 0;
  let driveQueue: Promise<void> = Promise.resolve();
  let wakeDrive: () => void = null;

  return async (
    filePath: string,
    { duration, maxDuration }: Pick<DecodeOptions, "maxDuration"> & { duration?: number } = {},
  ): Promise<DecodedAudio> => {
    const previousRead = driveQueue;
    let cached: Awaited<ReturnType<typeof cacheMediaFile>> = null;
    let releaseDrive: () => void;

    driveQueue = new Promise((resolve) => {
      releaseDrive = resolve;
    });

    try {
      await previousRead;

      while (decodingCacheBytes > MAX_DECODING_CACHE_BYTES)
        await new Promise<void>((resolve) => {
          wakeDrive = resolve;
        });

      signal?.throwIfAborted();
      cached = await cacheMediaFile(filePath, buffer, duration, signal);

      if (cached) {
        decodingCacheBytes += cached.bytes;
        releaseDrive();
      }

      return {
        ...(await decodeAudio(filePath, { maxDuration, signal })),
        readBytes: cached?.bytes ?? 0,
        readFirstByteMs: cached?.firstByteMs ?? 0,
        readMs: cached?.ms ?? 0,
        readOpenMs: cached?.openMs ?? 0,
      };
    } finally {
      if (cached) {
        decodingCacheBytes -= cached.bytes;
        wakeDrive?.();
      }

      releaseDrive();
    }
  };
};

/** The exported model's path, once it is known to exist. */
export const assertAudioSimilarityModel = async () => {
  const { audio, modelCachePath } = getConfig().file.similarity;
  const modelPath = path.resolve(modelCachePath, "medior-audio", `${audio.model}.onnx`);

  if (!(await checkFileExists(modelPath)))
    throw new Error(
      `The ${getAudioSimilarityModel().label} audio model is missing from ${modelPath}. Export it with scripts/export-ced-onnx.py.`,
    );

  return modelPath;
};

/** Window length and spacing in whole tokens, the units stored windows are pooled from. */
export const getAudioWindowTokens = () => {
  const { hopMs, windowMs } = getConfig().file.similarity.audio;

  return {
    hopTokens: Math.max(1, Math.round(hopMs / 1000 / AUDIO_TOKEN_SECONDS)),
    windowTokens: Math.max(1, Math.round(windowMs / 1000 / AUDIO_TOKEN_SECONDS)),
  };
};

/**
 * The most windows audio of the given length can store. A chunk of n samples gives the exported
 * model floor(n / 160) + 1 spectrogram frames and CED patches 16 frames per token, so the audio has
 * at most one token per 2,560 samples, rounded up; windows then start every hop up to the last.
 */
export const getMaxAudioWindowCount = (seconds: number) => {
  const { hopTokens, windowTokens } = getAudioWindowTokens();
  const tokenCount = Math.max(1, Math.ceil((seconds * AUDIO_SAMPLE_RATE) / AUDIO_TOKEN_SAMPLES));
  const lastStart = Math.max(0, tokenCount - windowTokens);

  return Math.ceil(lastStart / hopTokens) + 1;
};

/** Embeds 16 kHz samples in chunks of up to ten seconds, keeping every 0.16-second token. */
const embedAudioTokens = async (
  readChunk: (start: number, end: number) => Promise<Float32Array>,
  sampleCount: number,
  signal?: AbortSignal,
  onProgress?: ProgressReporter,
): Promise<AudioTokens> => {
  const config = getConfig().file.similarity.audio;
  const model = getAudioSimilarityModel();
  const modelPath = await assertAudioSimilarityModel();

  const maxTokenCount = Math.ceil(sampleCount / AUDIO_TOKEN_SAMPLES) + 1;
  const meanSquares = new Float32Array(maxTokenCount);
  const tokens = new Float32Array(maxTokenCount * model.dimensions);
  let batch: Float32Array[] = [];
  let embeddedSampleCount = 0;
  let inferenceMs = 0;
  let tokenCount = 0;

  const embedBatch = async () => {
    const inferenceStart = Date.now();
    const output = await runNativeTask<{ data: Float32Array; dims: number[] }>(
      "audio",
      { chunks: batch, config, modelPath },
      signal,
    );

    inferenceMs += Date.now() - inferenceStart;

    const [batchSize, chunkTokenCount, dimensions] = output.dims;
    if (batchSize !== batch.length || dimensions !== model.dimensions)
      throw new Error(
        `Unexpected audio embedding shape ${output.dims.join("x")}; ${model.label} embeddings have ${model.dimensions} dimensions. Export the model again.`,
      );

    for (const [chunkIndex, chunk] of batch.entries()) {
      for (let token = 0; token < chunkTokenCount; token++) {
        const outputOffset = (chunkIndex * chunkTokenCount + token) * dimensions;
        const sampleStart = Math.min(chunk.length, token * AUDIO_TOKEN_SAMPLES);
        const sampleEnd = Math.min(chunk.length, sampleStart + AUDIO_TOKEN_SAMPLES);
        let sum = 0;

        for (let index = sampleStart; index < sampleEnd; index++) sum += chunk[index] ** 2;

        meanSquares[tokenCount] = sampleEnd > sampleStart ? sum / (sampleEnd - sampleStart) : 0;
        tokens.set(
          output.data.subarray(outputOffset, outputOffset + dimensions),
          tokenCount * dimensions,
        );

        tokenCount++;
      }

      embeddedSampleCount += chunk.length;
    }

    batch = [];
    onProgress?.(
      `Generating audio similarity vectors: ${Math.min(100, Math.round((embeddedSampleCount / sampleCount) * 100))}%.`,
    );
  };

  for (let start = 0; start < sampleCount; start += AUDIO_CHUNK_SAMPLES) {
    signal?.throwIfAborted();

    const end = Math.min(sampleCount, start + AUDIO_CHUNK_SAMPLES);

    // Only a clip shorter than one token is padded with silence; a shorter tail is dropped.
    if (start > 0 && end - start < AUDIO_TOKEN_SAMPLES) break;

    let chunk = await readChunk(start, end);

    if (chunk.length < AUDIO_TOKEN_SAMPLES) {
      const padded = new Float32Array(AUDIO_TOKEN_SAMPLES);

      padded.set(chunk);
      chunk = padded;
    }

    // Batched chunks share one length, so the shorter last chunk runs on its own.
    if (batch.length && (batch.length >= config.batchSize || chunk.length !== batch[0].length))
      await embedBatch();

    batch.push(chunk);
  }

  if (batch.length) await embedBatch();

  return {
    dimensions: model.dimensions,
    inferenceMs,
    meanSquares: meanSquares.subarray(0, tokenCount),
    tokenCount,
    tokens: tokens.subarray(0, tokenCount * model.dimensions),
  };
};

/**
 * The normalized mean of a range of token embeddings, or null when they hold NaN or infinity. The
 * exported model's spectrogram takes its maximum over each whole chunk, so one non-finite sample
 * makes every token of that chunk non-finite.
 */
const poolAudioTokens = ({ dimensions, tokens }: AudioTokens, start: number, end: number) => {
  const vector = Array.from({ length: dimensions }, () => 0);

  for (let token = start; token < end; token++) {
    for (let index = 0; index < dimensions; index++)
      vector[index] += tokens[token * dimensions + index];
  }

  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || !norm) return null;

  return vector.map((value) => value / norm);
};

/**
 * Pools tokens into overlapping windows, leaving out those quieter than the silence threshold and
 * counting those left out because their samples or embeddings held NaN or infinity.
 */
const makeAudioWindows = (embedded: AudioTokens) => {
  const windows: AudioVectorWindow[] = [];
  let invalidWindowCount = 0;

  if (!embedded.tokenCount) return { invalidWindowCount, windows };

  const { silenceThresholdDb } = getConfig().file.similarity.audio;
  const { hopTokens, windowTokens } = getAudioWindowTokens();
  const lastStart = Math.max(0, embedded.tokenCount - windowTokens);
  const starts: number[] = [];

  for (let start = 0; start < lastStart; start += hopTokens) starts.push(start);

  // The last window ends with the audio, so its final moments are always covered.
  starts.push(lastStart);

  for (const start of starts) {
    const end = Math.min(embedded.tokenCount, start + windowTokens);
    let meanSquare = 0;

    for (let token = start; token < end; token++)
      meanSquare += embedded.meanSquares[token] / (end - start);

    const vector = Number.isFinite(meanSquare) ? poolAudioTokens(embedded, start, end) : null;

    if (!vector) invalidWindowCount++;
    else if (10 * Math.log10(meanSquare) >= silenceThresholdDb)
      windows.push({
        end: round(end * AUDIO_TOKEN_SECONDS, 3),
        start: round(start * AUDIO_TOKEN_SECONDS, 3),
        vector,
      });
  }

  return { invalidWindowCount, windows };
};

/** Measures decoded audio and, as asked, transcribes and embeds it. The caller closes the audio. */
export const analyzeDecodedAudio = async (
  audio: DecodedAudio,
  onProgress?: ProgressReporter,
  signal = workSignal.getStore(),
  options: AudioAnalysisOptions = {},
): Promise<AudioAnalysis> => {
  const config = getConfig().file;
  const withAudioVectors = options.withAudioVectors ?? false;
  const withPeakVolume = options.withPeakVolume ?? true;
  const withTranscription = options.withTranscription ?? config.transcription.enabled;
  const withWaveform = options.withWaveform ?? config.waveform.enabled;
  const { sampleCount } = audio;

  const waveformPeaks = withWaveform
    ? Array.from({ length: Math.min(WAVEFORM_PEAK_COUNT, sampleCount) }, () => 0)
    : undefined;

  const analysis: AudioAnalysis = { inferenceMs: 0, waveformPeaks };

  if (withPeakVolume || withWaveform) {
    let peak = 0;

    onProgress?.(withWaveform ? "Generating waveform." : "Measuring peak volume.");

    for (let start = 0; start < sampleCount; start += PEAK_SCAN_SAMPLES) {
      signal?.throwIfAborted();

      const samples = await audio.read(start, Math.min(sampleCount, start + PEAK_SCAN_SAMPLES));

      for (let offset = 0; offset < samples.length; offset++) {
        const sample = samples[offset];

        peak = Math.max(peak, Math.abs(sample));

        if (waveformPeaks?.length) {
          const index = Math.min(
            waveformPeaks.length - 1,
            Math.floor(((start + offset) * waveformPeaks.length) / sampleCount),
          );

          if (Math.abs(sample) > Math.abs(waveformPeaks[index])) waveformPeaks[index] = sample;
        }
      }
    }

    analysis.peakDecibels = peak ? Math.max(-120, 20 * Math.log10(peak)) : -120;
  }

  if (withTranscription && sampleCount) {
    const segments: AudioAnalysis["transcription"]["segments"] = [];
    const windowSamples = TRANSCRIPTION_WINDOW_SECONDS * AUDIO_SAMPLE_RATE;
    const contextSamples = TRANSCRIPTION_CONTEXT_SECONDS * AUDIO_SAMPLE_RATE;

    for (let start = 0; start < sampleCount; start += windowSamples) {
      signal?.throwIfAborted();

      const end = Math.min(sampleCount, start + windowSamples);
      const readStart = Math.max(0, start - contextSamples);
      const readEnd = Math.min(sampleCount, end + contextSamples);
      const samples = await audio.read(readStart, readEnd);

      const transcriptionStart = Date.now();
      const transcription = await runNativeTask<AudioAnalysis["transcription"]>(
        "transcription",
        { config: config.transcription, samples },
        signal,
        (message, progress) =>
          onProgress?.(
            message,
            Math.min(100, ((start + ((end - start) * (progress ?? 0)) / 100) / sampleCount) * 100),
          ),
      );

      analysis.inferenceMs += Date.now() - transcriptionStart;

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

    analysis.transcription = {
      segments,
      text: segments
        .map(({ text }) => text)
        .join(" ")
        .trim(),
    };
  }

  // Audio without samples stores no windows, so it is still recorded as vectorized.
  if (withAudioVectors) {
    const embedded = await embedAudioTokens(audio.read, sampleCount, signal, onProgress);
    const { invalidWindowCount, windows } = makeAudioWindows(embedded);

    analysis.audioWindows = windows;
    analysis.inferenceMs += embedded.inferenceMs;
    analysis.invalidAudioWindowCount = invalidWindowCount;
  }

  return analysis;
};

export const analyzeAudio = async (
  filePath: string,
  onProgress?: ProgressReporter,
  signal = workSignal.getStore(),
  options: AudioAnalysisOptions = {},
): Promise<AudioAnalysis> => {
  const audio = await decodeAudio(filePath, { onProgress, signal });

  try {
    return await analyzeDecodedAudio(audio, onProgress, signal, options);
  } finally {
    await audio.close();
  }
};

/** One embedding for a stretch of a file's audio, comparable with its stored windows. */
export const embedAudioSegment = async (
  filePath: string,
  range: { end: number; start: number },
  signal = workSignal.getStore(),
) => {
  const audio = await decodeAudio(filePath, { range, signal });

  try {
    if (!audio.sampleCount) throw new Error("The selected range has no audio.");

    const embedded = await embedAudioTokens(audio.read, audio.sampleCount, signal);
    const vector = poolAudioTokens(embedded, 0, embedded.tokenCount);
    if (!vector) throw new Error("The selected range's audio decoded to invalid values.");

    return vector;
  } finally {
    await audio.close();
  }
};
