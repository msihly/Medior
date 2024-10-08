import fs from "fs/promises";
import path from "path";
import md5File from "md5-file";
import { PassThrough } from "stream";
import ffmpeg from "fluent-ffmpeg";
import {
  CONSTANTS,
  checkFileExists,
  fractionStringToNumber,
  getAvailableFileStorage,
  makePerfLog,
  round,
  sleep,
} from ".";

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
    const { perfLog, perfLogTotal } = makePerfLog("[Transcode]");
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
    onFirstFrames?: () => void
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
          if (sourceBuffer) sourceBuffer.appendBuffer(chunk);
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
    handleSourceOpen: EventListener
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
    const targetDir = fileStorageRes.data;

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

export const getScaledThumbSize = (width: number, height: number) => {
  const maxDim = CONSTANTS.FILE.THUMB.MAX_DIM;
  const scaleFactor = Math.min(maxDim / width, maxDim / height);
  return { width: Math.floor(width * scaleFactor), height: Math.floor(height * scaleFactor) };
};

interface VideoInfo {
  duration: number;
  frameRate: number;
  height: number;
  size: number;
  videoCodec: string;
  width: number;
}

export const getVideoInfo = async (path: string) => {
  return (await new Promise(async (resolve, reject) => {
    return ffmpeg.ffprobe(path, (err, info) => {
      if (err) return reject(err);

      const videoStream = info.streams.find((s) => s.codec_type === "video");
      if (!videoStream) return reject(new Error("No video stream found."));

      const { height, r_frame_rate, width, codec_name } = videoStream;
      const { duration, size } = info.format;

      return resolve({
        duration: typeof duration === "number" ? duration : null,
        frameRate: fractionStringToNumber(r_frame_rate),
        height,
        size,
        videoCodec: codec_name,
        width,
      });
    });
  })) as VideoInfo;
};

export const vidToThumbGrid = async (inputPath: string, outputPath: string, fileHash: string) => {
  const DEBUG = true;
  const { perfLog, perfLogTotal } = makePerfLog("[vidToThumbGrid]");

  try {
    if (DEBUG) perfLog(`Generating thumbnail grid for: ${inputPath}`);

    const { duration, height, width } = await getVideoInfo(inputPath);
    if (DEBUG) perfLog(`Video duration: ${duration}`);

    const gridPath = path.join(outputPath, `${fileHash}-thumb.jpg`);
    const numOfFrames = 9;
    const scaled = getScaledThumbSize(width, height);
    const skipDuration = duration * CONSTANTS.FILE.THUMB.FRAME_SKIP_PERCENT;
    const frameInterval = (duration - skipDuration) / numOfFrames;
    const timestamps = Array.from(
      { length: numOfFrames },
      (_, idx) => idx * frameInterval + skipDuration
    );
    if (DEBUG) perfLog(`Timestamps for frames: ${timestamps}`);

    // prettier-ignore
    const positions = [
      `0_0`, `${scaled.width}_0`, `${2 * scaled.width}_0`,
      `0_${scaled.height}`, `${scaled.width}_${scaled.height}`, `${2 * scaled.width}_${scaled.height}`,
      `0_${2 * scaled.height}`, `${scaled.width}_${2 * scaled.height}`, `${2 * scaled.width}_${2 * scaled.height}`
    ];

    const filterComplex =
      timestamps
        .map(
          (timestamp, idx) => `[0:v]select='eq(n\\,${Math.floor(timestamp * 25)})'[frame${idx}];`
        )
        .join("") +
      timestamps
        .map((_, idx) => `[frame${idx}]scale=${scaled.width}:${scaled.height}[scaled${idx}];`)
        .join("") +
      timestamps.map((_, idx) => `[scaled${idx}]`).join("") +
      `xstack=inputs=${numOfFrames}:layout=${positions.join("|")}`;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(["-filter_complex", filterComplex, "-frames:v", "1"])
        .output(gridPath)
        .on("end", () => resolve())
        .on("error", (err) => {
          console.error(`Error generating thumbnail grid:`, err);
          reject(err);
        })
        .run();
    });

    if (DEBUG) perfLogTotal(`Thumbnail grid generated: ${gridPath}`);
    return gridPath;
  } catch (err) {
    console.error(`Error:`, err);
  }
};

export const remuxToMp4 = async (inputPath: string, outputDir: string) => {
  const tempPath = path.join(outputDir, "temp.mp4");

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .outputOptions(["-c copy"])
      .output(tempPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

  const newHash = await md5File(tempPath);
  const finalPath = path.join(outputDir, `${newHash}.mp4`);

  await fs.rename(tempPath, finalPath);
  const res = await checkFileExists(finalPath);
  if (!res) throw new Error("Failed to remux to mp4.");

  return finalPath;
};

/*
export const generateFramesThumbnail = async (
  inputPath: string,
  outputPath: string,
  fileHash: string,
  duration: number = null,
  numOfFrames = 9
) => {
  const DEBUG = false;

  try {
    if (DEBUG) console.debug(`Generating thumbnails for: ${inputPath}`);

    duration ??= (await getVideoInfo(inputPath))?.duration;
    if (DEBUG) console.debug(`Video duration: ${duration}`);

    const skipDuration = duration * CONSTANTS.FILE.THUMB.FRAME_SKIP_PERCENT;
    const frameInterval = (duration - skipDuration) / numOfFrames;
    const frameIndices = range(numOfFrames);

    const filePaths = frameIndices.map((idx) =>
      path.join(outputPath, `${fileHash}-thumb-${String(idx + 1).padStart(2, "0")}.jpg`)
    );
    const timestamps = frameIndices.map((idx) => idx * frameInterval + skipDuration);

    if (DEBUG)
      console.debug(
        `Timestamps for frames: ${timestamps}\nFile paths for thumbnails: ${filePaths}`
      );

    await Promise.all(
      timestamps.map(
        (timestamp, idx) =>
          new Promise<void>((resolve, reject) => {
            if (DEBUG) console.debug(`Generating thumbnail for timestamp: ${timestamp}`);
            ffmpeg()
              .input(inputPath)
              .inputOptions([`-ss ${timestamp}`])
              .outputOptions([
                `-vf scale=${CONSTANTS.FILE.THUMB.MAX_DIM}:-1:force_original_aspect_ratio=increase,crop=min(iw\\,${CONSTANTS.FILE.THUMB.MAX_DIM}):ih`,
                `-vframes 1`,
              ])
              .output(filePaths[idx])
              .on("end", () => {
                if (DEBUG) console.debug(`Thumbnail generated: ${filePaths[idx]}`);
                resolve();
              })
              .on("error", (err) => {
                console.error(`Error generating thumbnail for timestamp ${timestamp}:`, err);
                reject(err);
              })
              .run();
          })
      )
    );

    return filePaths;
  } catch (err) {
    console.error("ERR::generateFramesThumbnail()", err);
    return [];
  }
};

export const generateVideoThumbnail = async (
  inputPath: string,
  outputPath: string,
  thumbDuration = 3
) => {
  const { duration } = await getVideoInfo(inputPath);
  const safeThumbDur = duration - thumbDuration;
  const startTime = safeThumbDur <= 0 ? 0 : getRandomInt(0.1 * safeThumbDur, 0.9 * safeThumbDur);

  return await new Promise((resolve, reject) => {
    return ffmpeg()
      .input(inputPath)
      .inputOptions([`-ss ${startTime}`])
      .outputOptions([`-t ${thumbDuration}`])
      .noAudio()
      .output(path.join(outputPath, "test.mp4"))
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
};
*/
