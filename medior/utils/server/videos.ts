import fs from "fs/promises";
import path, { extname } from "path";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import type { FormatEnum } from "sharp";
import { checkFileExists, makePerfLog } from "trabecula/utils/server";
import {
  CONSTANTS,
  fractionStringToNumber,
  getVideoResizeFilters,
  ImageExt,
  round,
} from "medior/utils/common";
import { getAvailableFileStorage, getConfig, getIsImage } from "medior/utils/server";
import { runImageTask } from "medior/utils/server/image-task";
import { hashMediaFile, MediaOutput, publishMediaOutput } from "medior/utils/server/media-output";
import { runConcurrent, workSignal } from "medior/utils/server/work-signal";

export type FfmpegOptions = {
  onOutputPrepared?: (output: MediaOutput) => Promise<void>;
  onProgress?: (progress: FfmpegProgress) => void;
  onTempPath?: (tempPath: string) => Promise<void>;
  signal?: AbortSignal;
};

export type FfmpegProgress = {
  fps: number;
  frames: number;
  kbps: number;
  percent: number;
  size: number;
  time: string;
};

export interface VideoInfo {
  audioBitrate: number;
  audioCodec: string;
  bitrate: number;
  duration: number;
  ext: string;
  frameRate: number;
  height: number;
  size: number;
  videoCodec: string;
  width: number;
}

export interface MediaInfo extends VideoInfo {
  ext: string;
}

const timemarkToSeconds = (timemark: string) => {
  const [hh, mm, ss] = timemark.split(":");
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
};

const secondsToTimemark = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${remainingSeconds
    .toFixed(2)
    .padStart(5, "0")}`;
};

export { videoTranscoder } from "./video-transcoder";

export const extractVideoFrame = async (inputPath: string, frameIndex: number): Promise<string> => {
  try {
    const fileStorageRes = await getAvailableFileStorage(10000);
    if (!fileStorageRes.success) throw new Error(fileStorageRes.error);

    const targetDir = fileStorageRes.data.location;

    const outputPath = path.join(targetDir, "_tmp", `extracted-frame-${randomUUID()}.jpg`);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .outputOptions([`-vf select='eq(n\\,${round(frameIndex, 0)})'`, `-vframes 1`])
        .output(outputPath)
        .on("end", resolve)
        .on("error", (err) => {
          console.error(`Error extracting frame: ${err}`);
          reject(err);
        })
        .run();
    }).catch(async (error) => {
      await fs.rm(outputPath, { force: true });
      throw error;
    });

    const fileExists = await checkFileExists(outputPath);
    if (!fileExists) throw new Error("Extracted frame not found.");

    return outputPath;
  } catch (err) {
    console.error("Error in extractVideoFrame:", err);

    return null;
  }
};

export const getScaledThumbSize = (
  width: number,
  height: number,
  maxDim = CONSTANTS.FILE.THUMB.MAX_DIM,
) => {
  const scaleFactor = Math.min(maxDim / width, maxDim / height);
  return {
    scaleFactor,
    height: Math.floor(height * scaleFactor),
    width: Math.floor(width * scaleFactor),
  };
};

const execFfmpeg = async (
  command: FfmpegCommand,
  outputDir: string,
  options?: FfmpegOptions,
  duration?: number,
  outputExt = "mp4",
): Promise<{ hash: string; path: string }> => {
  const DEBUG = false;
  const { perfLog } = makePerfLog("[ffmpeg]", true);

  const tempPath = path.resolve(outputDir, `temp-${randomUUID()}.${outputExt}`);

  options = { ...options, signal: options?.signal ?? workSignal.getStore() };
  await fs.mkdir(outputDir, { recursive: true });
  await options?.onTempPath?.(tempPath);
  options?.signal?.throwIfAborted();

  command.outputOptions(["-y"]);

  const ffmpegPromise = new Promise((resolve, reject) => {
    command
      .output(tempPath)
      .on("start", () => {
        if (options?.signal?.aborted) command.kill("SIGKILL");
      })
      .on("progress", (progress) => {
        if (options?.onProgress) {
          options.onProgress({
            fps: progress.currentFps ?? 0,
            frames: progress.frames ?? 0,
            kbps: progress.currentKbps ?? 0,
            percent:
              duration && progress.timemark
                ? Math.min(100, (timemarkToSeconds(progress.timemark) / duration) * 100)
                : (progress.percent ?? 0),
            size: progress.targetSize ? progress.targetSize * 1000 : 0,
            time: progress.timemark ?? "",
          });
        }
      })
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

  if (!options?.signal) await ffmpegPromise;
  else {
    const abortHandler = () => command.kill("SIGKILL");

    if (options.signal.aborted) {
      abortHandler();
      await ffmpegPromise;
      options.signal.throwIfAborted();
    }

    options.signal.addEventListener("abort", abortHandler);

    try {
      await ffmpegPromise;
    } finally {
      options.signal.removeEventListener("abort", abortHandler);
    }
  }

  if (DEBUG) perfLog(`Temp file created: ${tempPath}.`);

  const newHash = await hashMediaFile(tempPath);

  const newPath = path.resolve(
    outputDir,
    newHash.substring(0, 2),
    newHash.substring(2, 4),
    `${newHash}.${outputExt}`,
  );

  if (DEBUG) perfLog(`Moving temp file from ${tempPath} to ${newPath}.`);

  await publishMediaOutput({ hash: newHash, path: newPath, tempPath }, options?.onOutputPrepared);

  const res = await checkFileExists(newPath);

  if (DEBUG) perfLog(`Moved temp file to ${newPath}: ${res}`);

  if (!res) throw new Error("Command failed.");

  return { hash: newHash, path: newPath };
};

export const getVideoInfo = (
  filePath: string,
  signal = workSignal.getStore(),
): Promise<VideoInfo> =>
  new Promise((resolve, reject) => {
    signal?.throwIfAborted();

    execFile(
      process.env.FFPROBE_PATH || "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { maxBuffer: 16 * 1024 * 1024, signal, windowsHide: true },
      (error, stdout) => {
        if (error) return reject(error);

        try {
          const info: ffmpeg.FfprobeData = JSON.parse(stdout);
          const videoStream = info.streams.find((stream) => stream.codec_type === "video");
          const audioStream = info.streams.find((stream) => stream.codec_type === "audio");

          if (!videoStream?.codec_name) throw new Error("No video stream codec found.");

          if (audioStream && !audioStream.codec_name)
            throw new Error("No audio stream codec found.");

          const { avg_frame_rate, bit_rate, codec_name, height, width } = videoStream;
          const { duration, size } = info.format;

          resolve({
            audioBitrate: audioStream ? parseInt(audioStream.bit_rate, 10) || null : null,
            audioCodec: audioStream ? audioStream.codec_name : "None",
            bitrate: parseInt(bit_rate, 10) || null,
            duration: typeof duration === "number" ? duration : parseFloat(duration) || null,
            ext: extname(filePath).replace(".", "").toLowerCase(),
            frameRate: fractionStringToNumber(avg_frame_rate),
            height,
            size,
            videoCodec: codec_name,
            width,
          });
        } catch (error) {
          reject(error);
        }
      },
    );
  });

export const getMediaInfo = async (filePath: string): Promise<MediaInfo> => {
  const ext = extname(filePath).replace(".", "").toLowerCase();

  if (getIsImage(ext) && ext !== "gif") {
    const [metadata, stats] = await Promise.all([
      runImageTask({ input: filePath, options: { failOn: "none" } }).then(
        ({ metadata }) => metadata,
      ),
      fs.stat(filePath),
    ]);

    return {
      audioBitrate: null,
      audioCodec: null,
      bitrate: null,
      duration: null,
      ext,
      frameRate: null,
      height: metadata.height,
      size: stats.size,
      videoCodec: null,
      width: metadata.width,
    };
  }

  return getVideoInfo(filePath);
};

const normalizeImageExt = (ext: ImageExt) => (ext === "jpeg" ? "jpg" : ext);

export const compressImage = async (
  inputPath: string,
  outputDir: string,
  options?: FfmpegOptions,
) => {
  const { imageExt, imageJpgQuality, imageMaxLongEdge, imageMaxShortEdge } =
    getConfig().file.reencode;

  const outputExt = normalizeImageExt(imageExt);
  const tempPath = path.resolve(outputDir, `temp-${randomUUID()}.${outputExt}`);

  options?.signal?.throwIfAborted();
  await fs.mkdir(outputDir, { recursive: true });
  await options?.onTempPath?.(tempPath);

  try {
    const { output } = await runImageTask(
      {
        format: outputExt as keyof FormatEnum,
        input: inputPath,
        maxLongEdge: imageMaxLongEdge,
        maxShortEdge: imageMaxShortEdge,
        options: { failOn: "none" },
        outputPath: tempPath,
        quality: imageJpgQuality,
      },
      options?.signal,
    );

    options?.signal?.throwIfAborted();

    const hash = await hashMediaFile(tempPath);

    options?.signal?.throwIfAborted();

    const outputPath = path.resolve(
      outputDir,
      hash.substring(0, 2),
      hash.substring(2, 4),
      `${hash}.${outputExt}`,
    );

    await publishMediaOutput({ hash, path: outputPath, tempPath }, options?.onOutputPrepared);

    options?.onProgress?.({
      fps: 0,
      frames: 1,
      kbps: 0,
      percent: 100,
      size: output.size,
      time: "",
    });

    const info: MediaInfo = {
      audioBitrate: null,
      audioCodec: null,
      bitrate: null,
      duration: null,
      ext: outputExt,
      frameRate: null,
      height: output.height,
      size: output.size,
      videoCodec: null,
      width: output.width,
    };

    return { hash, info, path: outputPath };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
};

export const gifToLoopableVideo = async (
  inputPath: string,
  outputDir: string,
  options?: FfmpegOptions,
) => {
  const config = getConfig().file.reencode;
  const videoInfo = await getVideoInfo(inputPath);
  const filterArray = getVideoResizeFilters(config.maxLongEdge, config.maxShortEdge);

  if (config.maxFps && videoInfo.frameRate > config.maxFps)
    filterArray.push(`fps=${config.maxFps}`);

  const command = ffmpeg()
    .input(inputPath)
    .videoCodec("libx264")
    .addOption(["-vf", filterArray.join(",")])
    .outputOptions(["-movflags", "+faststart", "-an"]);

  return execFfmpeg(command, outputDir, options, videoInfo.duration);
};

export const reencode = async (inputPath: string, outputDir: string, options?: FfmpegOptions) => {
  const config = getConfig();
  const { codec, maxBitrate, maxFps, maxLongEdge, maxShortEdge, override } = config.file.reencode;
  const inputExt = extname(inputPath).replace(".", "").toLowerCase();

  if (getIsImage(inputExt) && inputExt !== "gif")
    return compressImage(inputPath, outputDir, options);
  if (inputExt === "gif") return gifToLoopableVideo(inputPath, outputDir, options);

  const videoInfo = await getVideoInfo(inputPath);
  const inputFps = videoInfo.frameRate;
  const inputBitrate = videoInfo.bitrate / 1000;
  const targetBitrate = Math.min(inputBitrate || maxBitrate, maxBitrate);

  const filterArray = getVideoResizeFilters(maxLongEdge, maxShortEdge);

  if (maxFps && inputFps > maxFps) filterArray.push(`fps=${maxFps}`);

  const outputOptions = override?.length
    ? override
    : [
        "-rc",
        "vbr_hq",
        "-cq",
        "18",
        "-b:v",
        `${targetBitrate}k`,
        "-maxrate",
        `${targetBitrate}k`,
        "-bufsize",
        `${targetBitrate * 2}k`,
        "-2pass",
        "0",
      ];

  const command = ffmpeg()
    .input(inputPath)
    .videoCodec(codec)
    .addOption(["-vf", filterArray.join(",")])
    .outputOptions(outputOptions);

  return execFfmpeg(command, outputDir, options);
};

export const remux = async (inputPath: string, outputDir: string, options?: FfmpegOptions) => {
  const command = ffmpeg().input(inputPath).outputOptions(["-c copy"]);
  return execFfmpeg(command, outputDir, options);
};

export const spliceVideo = async (
  inputPath: string,
  outputDir: string,
  pairs: Array<[number, number]>,
  options?: FfmpegOptions & { forceReencode?: boolean },
): Promise<{ hash: string; path: string }> => {
  if (!pairs || pairs.length === 0) throw new Error("At least one timestamp pair is required.");

  pairs.forEach(([start, end], i) => {
    if (typeof start !== "number" || typeof end !== "number")
      throw new Error(`Pair[${i}]: start and end must be numbers.`);
    if (!Number.isFinite(start) || !Number.isFinite(end))
      throw new Error(`Pair[${i}]: start and end must be finite numbers.`);
    if (start < 0) throw new Error(`Pair[${i}]: start must be >= 0 (got ${start}).`);
    if (end <= start)
      throw new Error(`Pair[${i}]: end (${end}) must be greater than start (${start}).`);
  });

  const info = await getVideoInfo(inputPath);

  pairs.forEach(([, end], i) => {
    if (info.duration !== null && end > info.duration)
      throw new Error(
        `Pair[${i}]: end (${end}s) exceeds video duration (${round(info.duration, 3)}s).`,
      );
  });

  const totalDuration = pairs.reduce((acc, [start, end]) => acc + (end - start), 0);

  await fs.mkdir(outputDir, { recursive: true });

  if (!options?.forceReencode) {
    const tempDir = path.join(outputDir, "_tmp", `splice-${Date.now()}`);

    await fs.mkdir(tempDir, { recursive: true });

    const segmentPaths: string[] = [];
    let completedDuration = 0;
    let completedSize = 0;

    try {
      for (const [index, [start, end]] of pairs.entries()) {
        const segmentPath = path.join(tempDir, `segment-${index}.ts`);
        const segmentDuration = end - start;

        const command = ffmpeg()
          .input(inputPath)
          .inputOptions([`-ss ${start}`])
          .outputOptions([
            `-t ${end - start}`,
            "-map 0",
            "-c copy",
            "-avoid_negative_ts make_zero",
            "-muxpreload 0",
            "-muxdelay 0",
          ]);

        options?.onProgress?.({
          fps: 0,
          frames: 0,
          kbps: 0,
          percent: (completedDuration / totalDuration) * 100,
          size: completedSize,
          time: secondsToTimemark(completedDuration),
        });

        await new Promise<void>((resolve, reject) => {
          const signal = options?.signal ?? workSignal.getStore();

          signal?.throwIfAborted();

          const abort = () => command.kill("SIGKILL");

          const cleanup = () => signal?.removeEventListener("abort", abort);

          command
            .output(segmentPath)
            .on("start", () => {
              if (signal?.aborted) abort();
            })
            .on("progress", (progress) => {
              const elapsed = progress.timemark
                ? Math.min(timemarkToSeconds(progress.timemark), segmentDuration)
                : 0;

              options?.onProgress?.({
                fps: progress.currentFps ?? 0,
                frames: progress.frames ?? 0,
                kbps: progress.currentKbps ?? 0,
                percent: ((completedDuration + elapsed) / totalDuration) * 100,
                size: completedSize + (progress.targetSize ?? 0) * 1000,
                time: secondsToTimemark(completedDuration + elapsed),
              });
            })
            .on("end", () => (cleanup(), resolve()))
            .on("error", (err) => (cleanup(), reject(err)))
            .run();

          if (!signal) return;

          if (signal.aborted) {
            cleanup();
            abort();
            reject(new Error("Command cancelled before start."));
          } else signal.addEventListener("abort", abort, { once: true });
        });

        segmentPaths.push(segmentPath);
        completedDuration += segmentDuration;
        completedSize += (await fs.stat(segmentPath)).size;
      }

      const command = ffmpeg()
        .input(`concat:${segmentPaths.join("|")}`)
        .outputOptions(["-map 0", "-c copy", "-movflags +faststart"]);

      return await execFfmpeg(command, outputDir, options, totalDuration);
    } finally {
      await fs.rm(tempDir, { force: true, recursive: true });
    }
  }

  const command = ffmpeg();

  pairs.forEach(([start, end]) => {
    command.input(inputPath).inputOptions([`-ss ${start}`, `-to ${end}`]);
  });

  const hasAudio = info.audioCodec && info.audioCodec !== "None";
  const streams = pairs.map((_, i) => (hasAudio ? `[${i}:v][${i}:a]` : `[${i}:v]`)).join("");

  const filterComplex = hasAudio
    ? `${streams}concat=n=${pairs.length}:v=1:a=1[v][a]`
    : `${streams}concat=n=${pairs.length}:v=1:a=0[v]`;

  command
    .outputOptions([
      "-filter_complex",
      filterComplex,
      "-map",
      "[v]",
      ...(hasAudio ? ["-map", "[a]"] : []),
    ])
    .videoCodec(getConfig().file.reencode.codec)
    .outputOptions(hasAudio ? [] : ["-an"]);

  if (hasAudio) command.audioCodec("aac");

  return execFfmpeg(command, outputDir, options, totalDuration);
};

export const vidToThumbGrid = async (
  inputPath: string,
  outputPath: string,
  fileHash: string,
  signal = workSignal.getStore(),
) => {
  const DEBUG = false;
  const { perfLog, perfLogTotal } = makePerfLog("[vidToThumbGrid]", true);

  let isCorrupted = false;
  const gridPath = path.resolve(outputPath, `${fileHash}-thumb.jpg`);

  const tempPaths = Array.from(
    { length: CONSTANTS.FILE.THUMB.GRID_COLUMNS * CONSTANTS.FILE.THUMB.GRID_ROWS },
    (_, index) => path.resolve(outputPath, `${fileHash}-thumb-${index}.jpg`),
  );

  try {
    if (DEBUG) perfLog(`Generating thumbnail grid for: ${inputPath}`);

    signal?.throwIfAborted();

    const { duration, height, width } = await getVideoInfo(inputPath, signal);

    if (DEBUG) perfLog(`Video duration: ${duration}`);

    const numOfFrames = CONSTANTS.FILE.THUMB.GRID_COLUMNS * CONSTANTS.FILE.THUMB.GRID_ROWS;
    const scaled = getScaledThumbSize(width, height);
    const skipDuration = duration * CONSTANTS.FILE.THUMB.FRAME_SKIP_PERCENT;
    const frameInterval = (duration - skipDuration) / numOfFrames;

    const thumbs = tempPaths.map((tempPath, idx) => ({
      timestamp: idx * frameInterval + skipDuration,
      tempPath,
    }));

    await runConcurrent(
      thumbs,
      3,
      (thumb) =>
        new Promise<void>((resolve, reject) => {
          signal?.throwIfAborted();

          const command = ffmpeg()
            .input(inputPath)
            .inputOptions(["-ss", `${thumb.timestamp}`])
            .outputOptions(["-vf", `scale=${scaled.width}:${scaled.height}`, "-frames:v", "1"])
            .output(thumb.tempPath)
            .on("start", () => {
              if (signal?.aborted) command.kill("SIGKILL");
            })
            .on("end", () => {
              signal?.removeEventListener("abort", abort);
              resolve();
            })
            .on("error", (err) => {
              signal?.removeEventListener("abort", abort);

              if (signal?.aborted) {
                reject(signal.reason);

                return;
              }

              console.error(`Failed thumb gen ${thumb.timestamp}: ${err}`);
              isCorrupted = true;
              resolve();
            });

          const abort = () => command.kill("SIGKILL");

          signal?.addEventListener("abort", abort, { once: true });
          command.run();
        }),
      signal,
    );

    signal?.throwIfAborted();

    if (DEBUG) perfLog(`Generated ${thumbs.length} thumbnails`);

    const channels = 4;
    const colCount = CONSTANTS.FILE.THUMB.GRID_COLUMNS;
    const gridWidth = scaled.width * colCount;
    const gridHeight = scaled.height * CONSTANTS.FILE.THUMB.GRID_ROWS;

    const compositeArray = (
      await Promise.all(
        thumbs.map(async ({ tempPath }, idx) => {
          if (!(await checkFileExists(tempPath))) {
            console.error(`Corrupted file. Failed thumb gen temp frame: ${tempPath}`);
            isCorrupted = true;

            return null;
          }

          const row = Math.floor(idx / colCount);
          const col = idx % colCount;

          return { input: tempPath, left: col * scaled.width, top: row * scaled.height };
        }),
      )
    ).filter(Boolean);

    if (DEBUG) perfLog(`Composite array: ${JSON.stringify(compositeArray)}`);

    const blankCanvas = Buffer.alloc(gridWidth * gridHeight * channels);

    const result = await runImageTask(
      {
        composite: compositeArray,
        format: "jpeg",
        input: blankCanvas,
        options: { raw: { channels, height: gridHeight, width: gridWidth } },
        outputPath: gridPath,
      },
      signal,
    );

    if (DEBUG) perfLog(`Grid created successfully: ${result}`);

    if (DEBUG) perfLogTotal(`Thumbnail grid generated: ${gridPath}`);
  } finally {
    await Promise.all(
      tempPaths.map((tempPath) => fs.rm(tempPath, { force: true }).catch(console.error)),
    );
  }

  signal?.throwIfAborted();

  return { isCorrupted, path: gridPath };
};
