import fs from "fs/promises";
import path, { extname } from "path";
import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import md5File from "md5-file";
import { PassThrough } from "stream";
import { getAvailableFileStorage, getConfig, sharp } from "medior/utils/client";
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
          ext: extname(path).replace(".", ""),
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

  let isCorrupted: boolean;
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
