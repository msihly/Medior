import fs from "fs/promises";
import path, { extname } from "path";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import { PassThrough } from "stream";
import { checkFileExists, makePerfLog, md5File } from "trabecula/utils/server";
import { CONSTANTS, fractionStringToNumber, round, sleep } from "medior/utils/common";
import { getAvailableFileStorage, getConfig, sharp } from "medior/utils/server";

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

const HIGH_BITRATE_THRESHOLD = 4_000_000;
const CHUNK_FLUSH_BYTES = 512 * 1024;

class VideoTranscoder {
  private DEBUG = false;

  private static instance: VideoTranscoder;
  private isTranscoding = false;
  private prevInst: { revoke: () => void } | null = null;

  private constructor() {}

  public static getInstance(): VideoTranscoder {
    if (!VideoTranscoder.instance) VideoTranscoder.instance = new VideoTranscoder();
    return VideoTranscoder.instance;
  }

  public async transcode(
    inputPath: string,
    videoBitrate: number,
    seekTime: number = 0,
    onFirstFrames?: () => void,
  ) {
    if (this.prevInst) this.prevInst.revoke(), await sleep(500);

    if (this.isTranscoding) return;
    this.isTranscoding = true;

    const mediaSource = new MediaSource();
    const stream = new PassThrough();

    const highBitrate = videoBitrate > HIGH_BITRATE_THRESHOLD;

    const command = this.initReencode(inputPath, seekTime, stream, highBitrate);

    const handleSourceOpen = this.handleSourceOpen.bind(
      this,
      mediaSource,
      stream,
      highBitrate,
      onFirstFrames,
    );

    mediaSource.addEventListener("sourceopen", handleSourceOpen);
    const mediaSourceUrl = URL.createObjectURL(mediaSource);

    this.prevInst = {
      revoke: () => this.revoke(mediaSource, mediaSourceUrl, command, stream, handleSourceOpen),
    };

    return mediaSourceUrl;
  }

  private initReencode(
    inputPath: string,
    seekTime: number,
    stream: PassThrough,
    highBitrate: boolean,
  ) {
    const { perfLog, perfLogTotal } = makePerfLog("[Transcode]", true);

    return ffmpeg()
      .input(inputPath)
      .seekInput(seekTime)
      .videoCodec("libvpx")
      .audioCodec("libvorbis")
      .outputOptions([
        `-crf ${highBitrate ? 24 : 18}`,
        `-b:v 6M`,
        `-bufsize 2M`,
        `-qmin 10`,
        `-qmax 42`,
        `-deadline realtime`, // libvpx: fastest encode
        `-cpu-used ${highBitrate ? 8 : 6}`, // libvpx: 0–8, higher = faster/lower quality
        `-threads ${highBitrate ? 4 : 2}`, // 0 = all
        `-tile-columns 2`,
        `-frame-parallel 1`,
        `-pix_fmt yuv420p`,
        `-af aresample=async=1:min_hard_comp=0.100000:first_pts=0`, // fix audio drift
      ])
      .format("webm")
      .on("start", (cmd) => {
        if (this.DEBUG) perfLog(`Spawned: ${cmd}`);
      })
      .on("stderr", (line) => {
        if (this.DEBUG) perfLog(line);
      })
      .on("error", (err, stdout, stderr) => this.onError(err, stdout, stderr, stream))
      .on("end", () => {
        if (this.DEBUG) perfLogTotal("Transcode finished.");
        stream.end();
        this.isTranscoding = false;
      })
      .pipe(stream, { end: true });
  }

  private handleSourceOpen(
    mediaSource: MediaSource,
    stream: PassThrough,
    highBitrate: boolean,
    onFirstFrames?: () => void,
  ) {
    const mimeType = 'video/webm; codecs="vp8, vorbis"';
    if (!MediaSource.isTypeSupported(mimeType)) {
      console.error("[Transcode] MIME type not supported:", mimeType);
      mediaSource.endOfStream("decode");
      return;
    }

    const sourceBuffer = mediaSource.addSourceBuffer(mimeType);

    const queue: Uint8Array[] = [];
    let isAppending = false;
    let firstFrameReceived = false;
    let streamEnded = false;

    const flushThreshold = highBitrate ? CHUNK_FLUSH_BYTES : CHUNK_FLUSH_BYTES / 4;
    let accumulator: Uint8Array[] = [];
    let accumulatedBytes = 0;

    const flushAccumulator = () => {
      if (accumulatedBytes === 0) return;

      const merged = new Uint8Array(accumulatedBytes);
      let offset = 0;
      for (const chunk of accumulator) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      accumulator = [];
      accumulatedBytes = 0;
      queue.push(merged);
      appendNextChunk();
    };

    const appendNextChunk = () => {
      if (isAppending || sourceBuffer.updating || queue.length === 0) return;
      isAppending = true;
      const chunk = queue.shift()!;
      try {
        sourceBuffer.appendBuffer(chunk as any);
      } catch (err: any) {
        isAppending = false;
        if (!err.message?.includes("removed from the parent media"))
          console.error("[Transcode] Error appending buffer:", err);
      }
    };

    const handleUpdateEnd = () => {
      isAppending = false;
      if (queue.length > 0) appendNextChunk();
      else if (streamEnded) tryEndStream();
    };

    const tryEndStream = () => {
      if (mediaSource.readyState !== "open") return;
      if (!isAppending && queue.length === 0 && !sourceBuffer.updating) mediaSource.endOfStream();
    };

    sourceBuffer.addEventListener("updateend", handleUpdateEnd);

    stream.on("data", (chunk: Buffer) => {
      const u8 = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      accumulator.push(u8);
      accumulatedBytes += u8.byteLength;

      if (!firstFrameReceived) {
        firstFrameReceived = true;
        onFirstFrames?.();
        flushAccumulator();
      } else if (accumulatedBytes >= flushThreshold) flushAccumulator();
    });

    stream.on("end", () => {
      flushAccumulator();
      streamEnded = true;
      if (!isAppending && queue.length === 0 && !sourceBuffer.updating) tryEndStream();
    });

    stream.on("error", (err) => {
      console.error("[Transcode] Stream error:", err);
      if (mediaSource.readyState === "open") mediaSource.endOfStream("decode");
    });

    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", handleUpdateEnd);
      stream.removeAllListeners();
      if (mediaSource.readyState === "open") {
        try {
          mediaSource.removeSourceBuffer(sourceBuffer);
        } catch (err) {
          console.warn("[Transcode] Error removing source buffer:", err);
        }
      }
    };

    mediaSource.addEventListener("sourceclose", cleanup, { once: true });
    mediaSource.addEventListener("sourceended", cleanup, { once: true });
  }

  private onError(err: Error, stdout: string, stderr: string, stream: PassThrough) {
    if (err.message !== "Output stream closed") {
      console.error(`[Transcode] Error: ${err.message}`);
      if (this.DEBUG) {
        console.error(`ffmpeg stdout: ${stdout}`);
        console.error(`ffmpeg stderr: ${stderr}`);
      }
    }

    stream.destroy(err);
    this.isTranscoding = false;
  }

  private revoke(
    mediaSource: MediaSource,
    mediaSourceUrl: string,
    command: any,
    stream: PassThrough,
    handleSourceOpen: EventListener,
  ) {
    mediaSource.removeEventListener("sourceopen", handleSourceOpen);
    mediaSource.removeEventListener("sourceclose", handleSourceOpen);
    mediaSource.removeEventListener("sourceended", handleSourceOpen);
    URL.revokeObjectURL(mediaSourceUrl);
    command.ffmpegProc?.kill("SIGKILL");
    stream.destroy();
    this.isTranscoding = false;
  }
}

export const videoTranscoder = VideoTranscoder.getInstance();

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
): Promise<{ hash: string; path: string }> => {
  const DEBUG = false;
  const { perfLog } = makePerfLog("[ffmpeg]", true);

  const tempPath = path.resolve(outputDir, "temp.mp4");

  const timemarkToSeconds = (timemark: string) => {
    const [hh, mm, ss] = timemark.split(":");
    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
  };

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
    `${newHash}.mp4`,
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

export const reencode = async (inputPath: string, outputDir: string, options?: FfmpegOptions) => {
  const config = getConfig();
  const { codec, maxBitrate, maxFps, maxHeight, maxWidth, override } = config.file.reencode;

  const videoInfo = await getVideoInfo(inputPath);
  const inputFps = videoInfo.frameRate;
  const inputBitrate = videoInfo.bitrate / 1000;
  const targetBitrate = Math.min(inputBitrate || maxBitrate, maxBitrate);

  const filterArray = [
    `scale='if(gt(iw,${maxWidth}),${maxWidth},iw)':'if(gt(ih,${maxHeight}),${maxHeight},ih)':force_original_aspect_ratio=decrease`,
  ];

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

  const inputExt = info.ext.toLowerCase();
  const canStreamCopy = !options?.forceReencode && inputExt === "mp4";
  const totalDuration = pairs.reduce((acc, [start, end]) => acc + (end - start), 0);

  await fs.mkdir(outputDir, { recursive: true });

  if (canStreamCopy) {
    const tmpDir = path.join(outputDir, "_tmp", `stitch-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    const segmentPaths: string[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const [start, end] = pairs[i];
      const duration = end - start;
      const segPath = path.join(tmpDir, `seg-${i}.ts`);

      const cmd = ffmpeg()
        .input(inputPath)
        .inputOptions([`-ss ${start}`])
        .outputOptions([
          `-t ${duration}`,
          "-map 0",
          "-c copy",
          "-avoid_negative_ts make_zero",
          "-muxpreload 0",
          "-muxdelay 0",
          "-f mpegts",
        ]);

      await new Promise<void>((resolve, reject) => {
        cmd
          .output(segPath)
          .on("end", () => resolve())
          .on("error", reject)
          .run();

        if (options?.signal) {
          const abort = () => cmd.kill("SIGKILL");
          if (options.signal.aborted) {
            abort();
            reject(new Error("Command cancelled before start."));
          } else options.signal.addEventListener("abort", abort, { once: true });
        }
      });

      segmentPaths.push(segPath);
    }

    const concatInput = `concat:${segmentPaths.join("|")}`;

    const command = ffmpeg()
      .input(concatInput)
      .inputOptions(["-fflags +genpts"])
      .outputOptions(["-map 0", "-c copy", "-movflags +faststart"]);

    return execFfmpeg(command, outputDir, options, totalDuration).finally(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  } else {
    const command = ffmpeg();
    pairs.forEach(([start, end]) => {
      command.input(inputPath).inputOptions([`-ss ${start}`, `-to ${end}`]);
    });

    // Build filter_complex: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[v][a]
    const streams = pairs.map((_, i) => `[${i}:v][${i}:a]`).join("");
    const filterComplex = `${streams}concat=n=${pairs.length}:v=1:a=1[v][a]`;

    command
      .outputOptions(["-filter_complex", filterComplex, "-map", "[v]", "-map", "[a]"])
      .videoCodec(getConfig().file.reencode.codec)
      .audioCodec("aac");

    return execFfmpeg(command, outputDir, options, totalDuration);
  }
};

export const vidToThumbGrid = async (inputPath: string, outputPath: string, fileHash: string) => {
  const DEBUG = false;
  const { perfLog, perfLogTotal } = makePerfLog("[vidToThumbGrid]", true);

  let isCorrupted = false;
  const gridPath = path.resolve(outputPath, `${fileHash}-thumb.jpg`);

  try {
    if (DEBUG) perfLog(`Generating thumbnail grid for: ${inputPath}`);

    const { duration, frameRate, height, width } = await getVideoInfo(inputPath);
    if (DEBUG) perfLog(`Video duration: ${duration}`);

    const numOfFrames = 9;
    const scaled = getScaledThumbSize(width, height);
    const skipDuration = duration * CONSTANTS.FILE.THUMB.FRAME_SKIP_PERCENT;
    const frameInterval = (duration - skipDuration) / numOfFrames;
    const timestamps = Array.from(
      { length: numOfFrames },
      (_, idx) => idx * frameInterval + skipDuration,
    );
    const frames = timestamps.map((t) => Math.floor(t * frameRate));
    const tempPaths = frames.map((_, i) => path.resolve(outputPath, `${fileHash}-thumb-${i}.jpg`));
    if (DEBUG) perfLog(`Frames: ${JSON.stringify(timestamps.map((t, i) => [i, t, frames[i]]))}`);

    for (let idx = 0; idx < timestamps.length; idx++) {
      const timestamp = timestamps[idx];
      const temp = tempPaths[idx];

      await new Promise<void>((resolve) => {
        ffmpeg()
          .input(inputPath)
          .inputOptions([`-ss ${timestamp}`])
          .outputOptions(["-vf", `scale=${scaled.width}:${scaled.height}`, "-frames:v", "1"])
          .output(temp)
          .on("end", () => resolve())
          .on("error", (err) => {
            console.error(`Error generating thumbnail for timestamp ${timestamp}: ${err}`);
            isCorrupted = true;
            resolve();
          })
          .run();
      });
    }

    const validTempPaths: string[] = [];
    const compositeInputs = await Promise.all(
      tempPaths.map(async (tempPath) => {
        if (!(await checkFileExists(tempPath))) {
          console.error(`Corrupted file. Failed to generate thumb temp frame: ${tempPath}`);
          isCorrupted = true;
          return null;
        } else {
          validTempPaths.push(tempPath);
          return tempPath;
        }
      }),
    );

    try {
      const channels = 4;
      const colCount = 3;
      const rowCount = 3;
      const gridWidth = scaled.width * colCount;
      const gridHeight = scaled.height * rowCount;
      const compositeArray = compositeInputs
        .map((input, idx) => {
          if (input === null) return;
          const row = Math.floor(idx / rowCount);
          const col = idx % colCount;
          return { input, left: col * scaled.width, top: row * scaled.height };
        })
        .filter(Boolean);

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
