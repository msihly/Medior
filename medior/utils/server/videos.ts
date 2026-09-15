import fs from "fs/promises";
import path, { extname } from "path";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import { checkFileExists, makePerfLog, md5File } from "trabecula/utils/server";
import {
  CONSTANTS,
  fractionStringToNumber,
  getOrientedSizeLimits,
  getVideoResizeFilters,
  ImageExt,
  PromiseQueue,
  round,
} from "medior/utils/common";
import { getAvailableFileStorage, getConfig, getIsImage, sharp } from "medior/utils/server";

export type FfmpegOptions = {
  onProgress?: (progress: FfmpegProgress) => void;
  signal?: AbortSignal;
};

export type FfmpegProgress = {
  frames: number;
  fps: number;
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

    const outputPath = path.join(targetDir, "_tmp", "extracted-frame.jpg");
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

  const tempPath = path.resolve(outputDir, `temp.${outputExt}`);

  command.outputOptions(["-y"]);

  const ffmpegPromise = new Promise((resolve, reject) => {
    command
      .output(tempPath)
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
      throw new Error("Command cancelled before start.");
    }

    options.signal.addEventListener("abort", abortHandler);

    try {
      await ffmpegPromise;
    } finally {
      options.signal.removeEventListener("abort", abortHandler);
    }
  }

  if (DEBUG) perfLog(`Temp file created: ${tempPath}.`);

  const newHash = await md5File(tempPath);
  const newPath = path.resolve(
    outputDir,
    newHash.substring(0, 2),
    newHash.substring(2, 4),
    `${newHash}.${outputExt}`,
  );
  if (DEBUG) perfLog(`Moving temp file from ${tempPath} to ${newPath}.`);

  await fs.mkdir(path.dirname(newPath), { recursive: true });
  await fs.rename(tempPath, newPath);
  const res = await checkFileExists(newPath);
  if (DEBUG) perfLog(`Moved temp file to ${newPath}: ${res}`);
  if (!res) throw new Error("Command failed.");

  return { hash: newHash, path: newPath };
};

export const getVideoInfo = async (path: string): Promise<VideoInfo> => {
  return (await new Promise(async (resolve, reject) => {
    try {
      ffmpeg.ffprobe(path, (err, info) => {
        if (err) return reject(err);

        const videoStream = info.streams.find((s) => s.codec_type === "video");
        if (!videoStream) return reject(new Error("No video stream found."));

        const audioStream = info.streams.find((s) => s.codec_type === "audio");

        const { avg_frame_rate, bit_rate, codec_name, height, width } = videoStream;
        const { duration, size } = info.format;

        return resolve({
          audioBitrate: audioStream ? parseInt(audioStream.bit_rate, 10) || null : null,
          audioCodec: audioStream ? audioStream.codec_name : "None",
          bitrate: parseInt(bit_rate, 10) || null,
          duration: typeof duration === "number" ? duration : parseFloat(duration) || null,
          ext: extname(path).replace(".", "").toLowerCase(),
          frameRate: fractionStringToNumber(avg_frame_rate),
          height,
          size,
          videoCodec: codec_name,
          width,
        });
      });
    } catch (err: any) {
      reject(err.message);
    }
  })) as VideoInfo;
};

export const getMediaInfo = async (filePath: string): Promise<MediaInfo> => {
  const ext = extname(filePath).replace(".", "").toLowerCase();
  if (getIsImage(ext) && ext !== "gif") {
    const [metadata, stats] = await Promise.all([
      sharp(filePath, { failOn: "none" }).metadata(),
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

const moveHashedOutput = async (tempPath: string, outputDir: string, outputExt: string) => {
  const newHash = await md5File(tempPath);
  const newPath = path.resolve(
    outputDir,
    newHash.substring(0, 2),
    newHash.substring(2, 4),
    `${newHash}.${outputExt}`,
  );

  await fs.mkdir(path.dirname(newPath), { recursive: true });
  await fs.rename(tempPath, newPath);
  const res = await checkFileExists(newPath);
  if (!res) throw new Error("Command failed.");

  return { hash: newHash, path: newPath };
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
  const tempPath = path.resolve(outputDir, `temp.${outputExt}`);

  await fs.mkdir(outputDir, { recursive: true });

  const image = sharp(inputPath, { failOn: "none" });
  const metadata = await image.metadata();
  image.resize({
    ...getOrientedSizeLimits(metadata.width, metadata.height, imageMaxLongEdge, imageMaxShortEdge),
    fit: "inside",
    withoutEnlargement: true,
  });

  if (outputExt === "jpg") image.jpeg({ quality: imageJpgQuality });
  else image.toFormat(outputExt as any);
  await image.toFile(tempPath);
  options?.onProgress?.({ fps: 0, frames: 1, kbps: 0, percent: 100, size: 0, time: "" });

  return moveHashedOutput(tempPath, outputDir, outputExt);
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
        const signal = options?.signal;
        const abort = () => command.kill("SIGKILL");
        const cleanup = () => signal?.removeEventListener("abort", abort);

        command
          .output(segmentPath)
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

    return execFfmpeg(command, outputDir, options, totalDuration).finally(() =>
      fs.rm(tempDir, { force: true, recursive: true }),
    );
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

export const vidToThumbGrid = async (inputPath: string, outputPath: string, fileHash: string) => {
  const DEBUG = false;
  const { perfLog, perfLogTotal } = makePerfLog("[vidToThumbGrid]", true);

  let isCorrupted = false;
  const gridPath = path.resolve(outputPath, `${fileHash}-thumb.jpg`);

  try {
    if (DEBUG) perfLog(`Generating thumbnail grid for: ${inputPath}`);

    const { duration, height, width } = await getVideoInfo(inputPath);
    if (DEBUG) perfLog(`Video duration: ${duration}`);

    const numOfFrames = CONSTANTS.FILE.THUMB.GRID_COLUMNS * CONSTANTS.FILE.THUMB.GRID_ROWS;
    const scaled = getScaledThumbSize(width, height);
    const skipDuration = duration * CONSTANTS.FILE.THUMB.FRAME_SKIP_PERCENT;
    const frameInterval = (duration - skipDuration) / numOfFrames;

    const thumbs = Array.from({ length: numOfFrames }, (_, idx) => ({
      timestamp: idx * frameInterval + skipDuration,
      tempPath: path.resolve(outputPath, `${fileHash}-thumb-${idx}.jpg`),
    }));

    const queue = new PromiseQueue({ concurrency: 3 });

    for (const thumb of thumbs) {
      queue.add(
        () =>
          new Promise<void>((resolve) => {
            ffmpeg()
              .input(inputPath)
              .inputOptions(["-ss", `${thumb.timestamp}`])
              .outputOptions(["-vf", `scale=${scaled.width}:${scaled.height}`, "-frames:v", "1"])
              .output(thumb.tempPath)
              .on("end", () => resolve())
              .on("error", (err) => {
                console.error(`Failed thumb gen ${thumb.timestamp}: ${err}`);
                isCorrupted = true;
                resolve();
              })
              .run();
          }),
      );
    }

    await queue.resolve();

    if (DEBUG) perfLog(`Generated ${thumbs.length} thumbnails`);

    const channels = 4;
    const colCount = CONSTANTS.FILE.THUMB.GRID_COLUMNS;
    const gridWidth = scaled.width * colCount;
    const gridHeight = scaled.height * CONSTANTS.FILE.THUMB.GRID_ROWS;
    const validTempPaths: string[] = [];

    try {
      const compositeArray = (
        await Promise.all(
          thumbs.map(async ({ tempPath }, idx) => {
            if (!(await checkFileExists(tempPath))) {
              console.error(`Corrupted file. Failed thumb gen temp frame: ${tempPath}`);
              isCorrupted = true;
              return null;
            } else {
              validTempPaths.push(tempPath);
              const row = Math.floor(idx / colCount);
              const col = idx % colCount;
              return { input: tempPath, left: col * scaled.width, top: row * scaled.height };
            }
          }),
        )
      ).filter(Boolean);

      if (DEBUG) perfLog(`Composite array: ${JSON.stringify(compositeArray)}`);

      const blankCanvas = Buffer.from(new Array(gridWidth * gridHeight * channels).fill(0));

      const result = await sharp(blankCanvas, {
        raw: { channels, height: gridHeight, width: gridWidth },
      })
        .composite(compositeArray)
        .jpeg()
        .toFile(gridPath);

      if (DEBUG) perfLog(`Grid created successfully: ${result}`);
    } catch (error) {
      isCorrupted = true;
      throw new Error(`Error creating thumb grid: ${error.message}`);
    } finally {
      const res = await Promise.all(
        validTempPaths.map((p) =>
          fs
            .unlink(p)
            .then(() => true)
            .catch(() => false),
        ),
      );
      if (DEBUG) perfLog(`Unlink res: ${res.join(", ")}`);
      if (res.some((v) => !v)) {
        isCorrupted = true;
        console.error(`Corrupted file: ${inputPath}`);
      }
    }

    if (DEBUG) perfLogTotal(`Thumbnail grid generated: ${gridPath}`);
  } catch (err) {
    isCorrupted = true;
    console.error(err);
  } finally {
    return { isCorrupted, path: gridPath };
  }
};
