import fs from "fs/promises";
import path, { extname } from "path";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import md5File from "md5-file";
import { PassThrough } from "stream";
import { getAvailableFileStorage, getConfig } from "medior/utils/client";
import { CONSTANTS, fractionStringToNumber, round, sleep } from "medior/utils/common";
import { checkFileExists, makePerfLog } from "medior/utils/server";

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

  public async transcode(inputPath: string, seekTime: number = 0, onFirstFrames?: () => void) {
    if (this.prevInst) {
      this.prevInst.revoke();
      await sleep(500);
    }

    if (this.isTranscoding) return;
    this.isTranscoding = true;

    const mediaSource = new MediaSource();
    const stream = new PassThrough();

    const command = this.init(inputPath, seekTime, stream);

    const handleSourceOpen = this.handleSourceOpen.bind(this, mediaSource, stream, onFirstFrames);
    mediaSource.addEventListener("sourceopen", handleSourceOpen);
    const mediaSourceUrl = URL.createObjectURL(mediaSource);

    this.prevInst = {
      revoke: () => this.revoke(mediaSource, mediaSourceUrl, command, stream, handleSourceOpen),
    };

    return mediaSourceUrl;
  }

  private init(inputPath: string, seekTime: number, stream: PassThrough) {
    const { perfLog, perfLogTotal } = makePerfLog("[Transcode]", true);
    return ffmpeg()
      .input(inputPath)
      .seekInput(seekTime)
      .videoCodec("libvpx") // libvpx required for webm
      .audioCodec("libvorbis") // libvorbis required for webm
      .outputOptions([
        "-preset medium",
        "-crf 18",
        "-b:v 8M", // bitrate
        "-qmin 10", // quantizer min
        "-qmax 42", // quantizer max
        "-pix_fmt yuv420p",
      ])
      .format("webm") // webm required for seekable muxer stream
      .on("start", (commandLine) => {
        if (this.DEBUG) perfLog(`Spawned ffmpeg with command: ${commandLine}`);
      })
      .on("stderr", (stderrLine) => {
        if (this.DEBUG) perfLog(stderrLine);
      })
      .on("error", (err, stdout, stderr) => {
        if (err.message !== "Output stream closed") {
          console.error(`Error transcoding video: ${err.message}`);
          console.error(`ffmpeg stdout: ${stdout}`);
          console.error(`ffmpeg stderr: ${stderr}`);
        }
        stream.destroy(err);
        this.isTranscoding = false;
      })
      .on("end", () => {
        if (this.DEBUG) perfLogTotal("Transcoding finished.");
        stream.end();
        this.isTranscoding = false;
      })
      .pipe(stream, { end: true });
  }

  private handleSourceOpen(
    mediaSource: MediaSource,
    stream: PassThrough,
    onFirstFrames?: () => void,
  ) {
    const sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8, vorbis"');
    let queue: Uint8Array[] = [];
    let isAppending = false;
    let firstFrameReceived = false;

    const appendNextChunk = () => {
      if (queue.length > 0 && !isAppending && !sourceBuffer.updating) {
        isAppending = true;
        const chunk = queue.shift();
        try {
          if (sourceBuffer) sourceBuffer.appendBuffer(chunk as BufferSource);
        } catch (err) {
          if (!err.message?.includes("removed from the parent media"))
            console.error("Error appending buffer:", err);
        }
      }
    };

    const handleUpdateEnd = () => {
      isAppending = false;
      appendNextChunk();
    };

    sourceBuffer.addEventListener("updateend", handleUpdateEnd);

    stream.on("data", (chunk) => {
      queue.push(chunk);
      appendNextChunk();
      if (!firstFrameReceived) {
        firstFrameReceived = true;
        if (onFirstFrames) onFirstFrames();
      }
    });

    stream.on("end", () => {
      if (queue.length === 0 && !sourceBuffer.updating) return mediaSource.endOfStream();
      const checkEnd = setInterval(() => {
        if (queue.length === 0 && !sourceBuffer.updating) {
          mediaSource.endOfStream();
          clearInterval(checkEnd);
        }
      }, 100);
    });

    stream.on("error", (err) => {
      console.error("Stream error:", err);
      mediaSource.endOfStream("decode");
    });

    const cleanup = () => {
      sourceBuffer.removeEventListener("updateend", handleUpdateEnd);
      stream.removeAllListeners();
      if (mediaSource.readyState === "open") mediaSource.removeSourceBuffer(sourceBuffer);
    };

    mediaSource.addEventListener("sourceclose", cleanup);
    mediaSource.addEventListener("sourceended", cleanup);
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
): Promise<{ hash: string; path: string }> => {
  const DEBUG = false;
  const { perfLog } = makePerfLog("[ffmpeg]", true);

  const tempPath = path.resolve(outputDir, "temp.mp4");

  const ffmpegPromise = new Promise((resolve, reject) => {
    command
      .output(tempPath)
      .on("progress", (progress) => {
        if (options?.onProgress) {
          options.onProgress({
            fps: progress.currentFps ?? 0,
            frames: progress.frames ?? 0,
            kbps: progress.currentKbps ?? 0,
            percent: progress.percent ?? 0,
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

export const vidToThumbGrid = async (inputPath: string, outputPath: string, fileHash: string) => {
  const DEBUG = false;
  const { perfLog, perfLogTotal } = makePerfLog("[vidToThumbGrid]", true);

  let isCorrupted = false;
  const gridPath = path.resolve(outputPath, `${fileHash}-thumb.jpg`);

  try {
    if (DEBUG) perfLog(`Generating thumbnail grid for: ${inputPath}`);

    const { duration, height, width } = await getVideoInfo(inputPath);

    const scaled = getScaledThumbSize(width, height);

    const skipDuration = duration * CONSTANTS.FILE.THUMB.FRAME_SKIP_PERCENT;
    const usableDuration = duration - skipDuration;

    const numFrames = 9;
    const interval = usableDuration / numFrames;

    const fps = 1 / interval;

    if (DEBUG) perfLog(`Using fps=${fps}`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .inputOptions([
          `-ss ${skipDuration}`,
          "-analyzeduration 10M",
          "-probesize 10M",
          "-err_detect ignore_err",
        ])
        .outputOptions([
          "-threads 1",
          "-fflags +discardcorrupt",
          "-vsync vfr",
          `-vf fps=${fps},scale=${scaled.width}:${scaled.height},tile=3x3`,
          "-frames:v 1",
          "-q:v 2",
        ])
        .output(gridPath)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });

    if (DEBUG) perfLogTotal(`Thumbnail grid generated: ${gridPath}`);
  } catch (err) {
    isCorrupted = true;
    console.error(err);
  }

  return { isCorrupted, path: gridPath };
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

  await fs.mkdir(outputDir, { recursive: true });

  if (canStreamCopy) {
    const tmpDir = path.join(outputDir, "_tmp", `stitch-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Cut each segment without re-encoding
    const segmentPaths: string[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const [start, end] = pairs[i];
      const duration = end - start;
      const segPath = path.join(tmpDir, `seg-${i}.mp4`);

      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg()
          .input(inputPath)
          .inputOptions([`-ss ${start}`])
          .outputOptions([
            `-t ${duration}`,
            "-c copy", // stream-copy: no re-encode
            "-avoid_negative_ts make_zero",
            "-map_chapters -1", // drop chapter markers; avoids muxer complaints
          ])
          .output(segPath);

        if (options?.signal) {
          const abort = () => cmd.kill("SIGKILL");
          options.signal.addEventListener("abort", abort, { once: true });
          cmd
            .on("end", () => {
              options.signal!.removeEventListener("abort", abort);
              resolve();
            })
            .on("error", (err) => {
              options.signal!.removeEventListener("abort", abort);
              reject(err);
            });
        } else {
          cmd.on("end", () => resolve()).on("error", reject);
        }

        cmd.run();
      });

      segmentPaths.push(segPath);
    }

    const listPath = path.join(tmpDir, "concat.txt");
    const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listPath, listContent, "utf-8");

    const command = ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"]);

    const result = await execFfmpeg(command, outputDir, options);
    await fs.rm(tmpDir, { recursive: true, force: true });

    return result;
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
      .videoCodec("libx264")
      .audioCodec("aac");

    return execFfmpeg(command, outputDir, options);
  }
};
