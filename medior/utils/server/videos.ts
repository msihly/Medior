import fs from "fs/promises";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import md5File from "md5-file";
import { PassThrough } from "stream";
import { getAvailableFileStorage, sharp } from "medior/utils/client";
import { CONSTANTS, fractionStringToNumber, round, sleep } from "medior/utils/common";
import { checkFileExists, fileLog, makePerfLog } from "medior/utils/server";

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
    try {
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
    } catch (err) {
      fileLog(err.message, { type: "error" });
      reject(err.message);
    }
  })) as VideoInfo;
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

    await Promise.all(
      timestamps.map(
        (timestamp, idx) =>
          new Promise<void>((resolve) => {
            const outputPath = tempPaths[idx];

            try {
              ffmpeg()
                .input(inputPath)
                .inputOptions([`-ss ${timestamp}`])
                .outputOptions(["-vf", `scale=${scaled.width}:${scaled.height}`, `-frames:v`, "1"])
                .output(outputPath)
                .on("end", () => resolve())
                .on("error", (err) => {
                  console.error(`Error generating thumbnail for timestamp ${timestamp}: ${err}`);
                  isCorrupted = true;
                  resolve();
                })
                .run();
            } catch (err) {
              console.error(`Error generating thumbnail for timestamp ${timestamp}: ${err}`);
              isCorrupted = true;
              resolve();
            }
          }),
      ),
    );

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

export const remuxToMp4 = async (inputPath: string, outputDir: string) => {
  const DEBUG = false;
  const { perfLog } = makePerfLog("[remuxToMp4]", true);

  const tempPath = path.resolve(outputDir, "temp.mp4");

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .outputOptions(["-c copy"])
      .output(tempPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
  if (DEBUG) perfLog(`Remuxed file created at temp path: ${tempPath}.`);

  const newHash = await md5File(tempPath);
  const newPath = path.resolve(
    outputDir,
    newHash.substring(0, 2),
    newHash.substring(2, 4),
    `${newHash}.mp4`,
  );
  if (DEBUG) perfLog(`Moved temp file from ${tempPath} to ${newPath}.`);

  await fs.rename(tempPath, newPath);
  const res = await checkFileExists(newPath);
  if (DEBUG) perfLog(`Moved temp file to ${newPath}: ${res}`);
  if (!res) throw new Error("Failed to remux to mp4.");

  return { hash: newHash, path: newPath };
};
