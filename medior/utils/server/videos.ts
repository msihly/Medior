import fs from "fs/promises";
import path, { extname } from "path";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import type { FormatEnum, Metadata } from "sharp";
import { checkFileExists, makePerfLog } from "trabecula/utils/server";
import {
  CONSTANTS,
  fractionStringToNumber,
  getVideoResizeFilters,
  round,
  validateTimestampPairs,
} from "medior/utils/common";
import { getAvailableFileStorage, getConfig, getScratchFolder } from "medior/utils/server";
import { getFfprobePath, runFfmpegCommand } from "medior/utils/server/ffmpeg";
import { runImageTask } from "medior/utils/server/image-task";
import { hashMediaFile, MediaOutput, publishMediaOutput } from "medior/utils/server/media-output";
import { runConcurrent, workSignal } from "medior/utils/server/work-signal";

export { videoTranscoder } from "./video-transcoder";

export type FfmpegOptions = {
  maxOutputSize?: number;
  onOutputPrepared?: (output: MediaOutput) => Promise<void>;
  onProgress?: (progress: FfmpegProgress) => void;
  /** Names phases that report no percentage, such as verifying the finished output. */
  onStage?: (stage: string) => void;
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
  frameDelays?: number[];
  isAnimated: boolean;
}

export class OutputSizeExceededError extends Error {
  constructor(public tempPath: string) {
    super(`Output reached the maximum size: ${tempPath}`);
    this.name = "OutputSizeExceededError";
  }
}

const PROBE_EXTENSIONS: Record<string, string[]> = {
  apng: ["png", "apng"],
  asf: ["wmv", "asf", "wm", "wmp"],
  avi: ["avi", "divx"],
  flv: ["flv", "f4v"],
  jpeg_pipe: ["jpg", "jpeg"],
  matroska: ["mkv", "webm"],
  mov: ["mp4", "3gp", "3gp2", "3gpp", "m4v", "mov", "qt"],
  mpeg: ["mpg", "mpeg", "vob"],
  mpegts: ["ts", "m2t", "m2ts", "mts"],
  mpegvideo: ["mpg", "m2v", "mpeg"],
  ogg: ["ogv"],
  tiff_pipe: ["tiff", "tif"],
};

const getProbedExtension = (info: ffmpeg.FfprobeData, filePath: string) => {
  const format = info.format.format_name?.split(",")[0];
  const pathExt = extname(filePath).slice(1).toLowerCase();
  const majorBrand = String(info.format.tags?.major_brand ?? "")
    .trim()
    .toLowerCase();

  const extensions = PROBE_EXTENSIONS[format];
  let ext: string;

  if (!format) throw new Error("Media format could not be detected.");

  if (format === "mov" && ["avif", "avis"].includes(majorBrand)) ext = "avif";
  else if (
    format === "mov" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(majorBrand)
  )
    ext = "heic";
  else if (format === "mov" && majorBrand === "qt") ext = "mov";
  else if (format === "mov" && majorBrand.startsWith("3g2")) ext = "3gp2";
  else if (format === "mov" && majorBrand.startsWith("3gp")) ext = "3gp";
  else if (extensions) ext = extensions.includes(pathExt) ? pathExt : extensions[0];
  else if (["image2", "image2pipe"].includes(format)) {
    const codec = info.streams.find((stream) => stream.codec_type === "video")?.codec_name;

    if (!codec) throw new Error("Image format could not be detected.");

    ext = codec === "mjpeg" ? "jpg" : codec === "jpeg2000" ? "jp2" : codec;
  } else ext = format.replace(/_pipe$/, "");

  return ext;
};

const timemarkToSeconds = (timemark: string) => {
  const [hh, mm, ss] = timemark.split(":");

  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
};

export const extractVideoFrame = async (
  inputPath: string,
  frameIndex: number,
  signal = workSignal.getStore(),
): Promise<string> => {
  signal?.throwIfAborted();

  const fileStorageRes = await getAvailableFileStorage(10000);
  if (!fileStorageRes.success) throw new Error(fileStorageRes.error);

  signal?.throwIfAborted();

  const outputPath = path.join(
    getScratchFolder(path.join(fileStorageRes.data.location, "_tmp")),
    `extracted-frame-${randomUUID()}.jpg`,
  );

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    signal?.throwIfAborted();

    const command = ffmpeg()
      .input(inputPath)
      .outputOptions([`-vf select='eq(n\\,${round(frameIndex, 0)})'`, "-vframes 1"])
      .output(outputPath);

    await runFfmpegCommand(command, signal);
    signal?.throwIfAborted();

    if (!(await checkFileExists(outputPath))) throw new Error("Extracted frame not found.");

    return outputPath;
  } catch (error) {
    await fs.rm(outputPath, { force: true });

    throw error;
  }
};

export const getScaledThumbSize = (
  width: number,
  height: number,
  maxDim = CONSTANTS.FILE.THUMB.MAX_DIM,
) => {
  const scaleFactor = Math.min(maxDim / width, maxDim / height);

  return {
    height: Math.floor(height * scaleFactor),
    scaleFactor,
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

  const tempDir = getScratchFolder(outputDir);
  const tempPath = path.resolve(tempDir, `temp-${randomUUID()}.${outputExt}`);

  options = { ...options, signal: options?.signal ?? workSignal.getStore() };
  await fs.mkdir(tempDir, { recursive: true });
  await options?.onTempPath?.(tempPath);
  options?.signal?.throwIfAborted();

  command.outputOptions(["-y"]);

  let isOversized = false;

  command.output(tempPath).on("progress", (progress) => {
    // Reported sizes are floored KiB, so this never exceeds the bytes already written.
    if (
      !isOversized &&
      options?.maxOutputSize &&
      (progress.targetSize ?? 0) * 1000 >= options.maxOutputSize
    ) {
      isOversized = true;
      command.kill("SIGKILL");
    }

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
  });

  try {
    await runFfmpegCommand(command, options.signal);
  } catch (error) {
    throw isOversized && !options.signal?.aborted ? new OutputSizeExceededError(tempPath) : error;
  }

  if (DEBUG) perfLog(`Temp file created: ${tempPath}.`);

  options?.onStage?.("Verifying output");

  const newHash = await hashMediaFile(tempPath);

  const newPath = path.resolve(
    outputDir,
    newHash.substring(0, 2),
    newHash.substring(2, 4),
    `${newHash}.${outputExt}`,
  );

  if (DEBUG) perfLog(`Moving temp file from ${tempPath} to ${newPath}.`);

  await publishMediaOutput(
    { hash: newHash, path: newPath, tempPath },
    options?.onOutputPrepared,
    true,
  );

  const res = await checkFileExists(newPath);

  if (DEBUG) perfLog(`Moved temp file to ${newPath}: ${res}`);

  if (!res) throw new Error("Command failed.");

  return { hash: newHash, path: newPath };
};

export const getVideoInfo = (
  filePath: string,
  signal = workSignal.getStore(),
): Promise<MediaInfo> =>
  new Promise((resolve, reject) => {
    signal?.throwIfAborted();

    execFile(
      getFfprobePath(),
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

          const { avg_frame_rate, bit_rate, codec_name, height, r_frame_rate, width } = videoStream;
          const { size } = info.format;
          const duration = [info.format.duration, videoStream.duration]
            .map(Number)
            .find((value) => Number.isFinite(value) && value > 0);

          const frameRate = [avg_frame_rate, r_frame_rate]
            .map((rate) => (rate ? fractionStringToNumber(rate) : null))
            .find((rate) => Number.isFinite(rate) && rate > 0);

          const ext = getProbedExtension(info, filePath);
          const format = info.format.format_name.split(",")[0];

          resolve({
            audioBitrate: audioStream ? parseInt(audioStream.bit_rate, 10) || null : null,
            audioCodec: audioStream ? audioStream.codec_name : "None",
            bitrate: parseInt(bit_rate, 10) || null,
            duration: duration ?? null,
            ext,
            frameRate: frameRate ?? null,
            height,
            isAnimated:
              !format.endsWith("_pipe") &&
              !["image2", "image2pipe"].includes(format) &&
              !["avif", "heic"].includes(ext),
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

export const getMediaInfo = async (
  filePath: string,
  signal = workSignal.getStore(),
): Promise<MediaInfo> => {
  let metadata: Metadata;

  try {
    metadata = (await runImageTask({ input: filePath, options: { failOn: "none" } }, signal))
      .metadata;
  } catch {
    signal?.throwIfAborted();
  }

  let info: MediaInfo;

  if (!metadata || metadata.format === "raw") info = await getVideoInfo(filePath, signal);
  else if (metadata.format === "webp" && metadata.pages > 1) {
    if (
      metadata.delay?.length !== metadata.pages ||
      metadata.delay.some((delay) => !Number.isFinite(delay) || delay < 0)
    )
      throw new Error("Animated WebP frame timing is incomplete or invalid.");

    // Match Chromium playback: frame delays of 10 ms or less are displayed for 100 ms.
    const frameDelays = metadata.delay.map((delay) => (delay <= 10 ? 100 : delay));
    const duration = frameDelays.reduce((total, delay) => total + delay, 0) / 1000;

    info = {
      audioBitrate: null,
      audioCodec: null,
      bitrate: null,
      duration,
      ext: "webp",
      frameDelays,
      frameRate: metadata.pages / duration,
      height: metadata.pageHeight ?? metadata.height,
      isAnimated: true,
      size: (await fs.stat(filePath)).size,
      videoCodec: "webp",
      width: metadata.width,
    };
  } else {
    const isAnimated =
      metadata.format === "gif" ||
      ((metadata.pages ?? 1) > 1 &&
        (["png", "webp"].includes(metadata.format) || (metadata.delay?.length ?? 0) > 1));

    const videoInfo =
      isAnimated || metadata.format === "png" ? await getVideoInfo(filePath, signal) : null;

    const ext =
      metadata.format === "png" && videoInfo
        ? videoInfo.ext
        : metadata.format === "jpeg"
          ? "jpg"
          : metadata.format === "heif"
            ? metadata.compression === "av1"
              ? "avif"
              : "heic"
            : metadata.format;

    if ((metadata.pages ?? 1) > 1 && isAnimated && !(videoInfo.duration > 0))
      throw new Error("Animated image timing could not be read; refusing to flatten its frames.");

    if (isAnimated || videoInfo?.isAnimated) info = { ...videoInfo, ext, isAnimated: true };
    else
      info = {
        audioBitrate: null,
        audioCodec: null,
        bitrate: null,
        duration: null,
        ext,
        frameRate: null,
        height: metadata.height,
        isAnimated: false,
        size: (await fs.stat(filePath)).size,
        videoCodec: null,
        width: metadata.width,
      };
  }

  return info;
};

const compressImage = async (inputPath: string, outputDir: string, options?: FfmpegOptions) => {
  const { imageExt, imageJpgQuality, imageMaxLongEdge, imageMaxShortEdge } =
    getConfig().file.reencode;

  const outputExt = imageExt === "jpeg" ? "jpg" : imageExt;
  const tempDir = getScratchFolder(outputDir);
  const tempPath = path.resolve(tempDir, `temp-${randomUUID()}.${outputExt}`);

  options?.signal?.throwIfAborted();
  await fs.mkdir(tempDir, { recursive: true });
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
        upright: true,
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

    await publishMediaOutput({ hash, path: outputPath, tempPath }, options?.onOutputPrepared, true);

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
      isAnimated: false,
      size: output.size,
      videoCodec: null,
      width: output.width,
    };

    return { hash, info, path: outputPath };
  } finally {
    await fs.rm(tempPath, { force: true });
  }
};

const gifToLoopableVideo = async (
  inputPath: string,
  outputDir: string,
  videoInfo: MediaInfo,
  options?: FfmpegOptions,
) => {
  const config = getConfig().file.reencode;
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
  const { codec, maxBitrate, maxFps, maxLongEdge, maxShortEdge, override } =
    getConfig().file.reencode;

  const videoInfo = await getMediaInfo(inputPath, options?.signal);

  if (!videoInfo.isAnimated) {
    return compressImage(inputPath, outputDir, options);
  } else if (videoInfo.ext === "gif") {
    return gifToLoopableVideo(inputPath, outputDir, videoInfo, options);
  } else {
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
  }
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
  validateTimestampPairs(pairs);

  const info = await getVideoInfo(inputPath);

  validateTimestampPairs(pairs, info.duration);

  const totalDuration = pairs.reduce((acc, [start, end]) => acc + (end - start), 0);

  await fs.mkdir(outputDir, { recursive: true });

  if (!options?.forceReencode) {
    const tempDir = path.join(
      getScratchFolder(path.join(outputDir, "_tmp")),
      `splice-${randomUUID()}`,
    );

    await fs.mkdir(tempDir, { recursive: true });

    try {
      // The concat demuxer reads each range straight from the source and joins them into one
      // continuous timeline, so the output is written once. Ranges start at the keyframe before.
      const listPath = path.join(tempDir, "ranges.txt");
      const sourcePath = inputPath.replace(/\\/g, "/").replace(/'/g, "'\\''");

      await fs.writeFile(
        listPath,
        pairs
          .map(([start, end]) => `file '${sourcePath}'\ninpoint ${start}\noutpoint ${end}`)
          .join("\n"),
      );

      const command = ffmpeg()
        .input(listPath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions([
          "-map 0",
          "-c copy",
          "-avoid_negative_ts make_zero",
          "-movflags +faststart",
        ]);

      options?.onStage?.(
        pairs.length > 1 ? `Cutting and joining ${pairs.length} clips` : "Cutting",
      );

      return await execFfmpeg(command, outputDir, options, totalDuration);
    } finally {
      await fs.rm(tempDir, { force: true, recursive: true });
    }
  } else {
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
  }
};

export const vidToThumbGrid = async (
  inputPath: string,
  outputPath: string,
  fileHash: string,
  info: MediaInfo,
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

    const { duration, frameDelays, height, width } = info;

    if (DEBUG) perfLog(`Video duration: ${duration}`);

    const scaled = getScaledThumbSize(width, height);
    const skipDuration = duration * CONSTANTS.FILE.THUMB.FRAME_SKIP_PERCENT;
    const frameInterval = (duration - skipDuration) / tempPaths.length;
    let frameEnd = frameDelays?.[0] ?? 0;
    let page = 0;

    const thumbs = tempPaths.map((tempPath, idx) => {
      const timestamp = idx * frameInterval + skipDuration;

      if (frameDelays) {
        while (page < frameDelays.length - 1 && timestamp * 1000 >= frameEnd) {
          page++;
          frameEnd += frameDelays[page];
        }
      }

      return { page, tempPath, timestamp };
    });

    await runConcurrent(
      thumbs,
      3,
      async (thumb) => {
        if (frameDelays) {
          await runImageTask(
            {
              format: "jpeg",
              input: inputPath,
              options: { page: thumb.page, pages: 1 },
              outputPath: thumb.tempPath,
              resize: { fit: "fill", height: scaled.height, width: scaled.width },
            },
            signal,
          );
        } else {
          const command = ffmpeg()
            .input(inputPath)
            .inputOptions(["-ss", `${thumb.timestamp}`])
            .outputOptions(["-vf", `scale=${scaled.width}:${scaled.height}`, "-frames:v", "1"])
            .output(thumb.tempPath);

          try {
            await runFfmpegCommand(command, signal);
          } catch (error) {
            signal?.throwIfAborted();

            console.error(`Failed thumb gen ${thumb.timestamp}: ${error}`);
            isCorrupted = true;
          }
        }
      },
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
