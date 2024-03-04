import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { CONSTANTS, fractionStringToNumber, range } from ".";

interface VideoInfo {
  duration: number;
  frameRate: number;
  height: number;
  size: number;
  width: number;
}

export const getVideoInfo = async (path: string) => {
  return (await new Promise(async (resolve, reject) => {
    return ffmpeg.ffprobe(path, (err, info) => {
      if (err) return reject(err);

      const videoStream = info.streams.find((s) => s.codec_type === "video");
      if (!videoStream) return reject(new Error("No video stream found."));

      const { height, r_frame_rate, width } = videoStream;
      const { duration, size } = info.format;

      return resolve({
        duration: typeof duration === "number" ? duration : null,
        frameRate: fractionStringToNumber(r_frame_rate),
        height,
        size,
        width,
      });
    });
  })) as VideoInfo;
};

export const generateFramesThumbnail = async (
  inputPath: string,
  outputPath: string,
  fileHash: string,
  duration: number = null,
  numOfFrames = 9
) => {
  try {
    duration ??= (await getVideoInfo(inputPath))?.duration;
    const skipDuration = duration * CONSTANTS.THUMB.FRAME_SKIP_PERCENT;
    const frameInterval = (duration - skipDuration) / numOfFrames;
    const frameIndices = range(numOfFrames);

    const filePaths = frameIndices.map((idx) =>
      path.join(outputPath, `${fileHash}-thumb-${String(idx + 1).padStart(2, "0")}.jpg`)
    );
    const timestamps = frameIndices.map((idx) => idx * frameInterval + skipDuration);

    await Promise.all(
      timestamps.map(
        (timestamp, idx) =>
          new Promise(async (resolve, reject) => {
            return ffmpeg()
              .input(inputPath)
              .inputOptions([`-ss ${timestamp}`])
              .outputOptions([
                `-vf scale=${CONSTANTS.THUMB.WIDTH}:-1:force_original_aspect_ratio=increase,crop=min(iw\\,${CONSTANTS.THUMB.WIDTH}):ih`,
                `-vframes 1`,
              ])
              .output(filePaths[idx])
              .on("end", resolve)
              .on("error", reject)
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

/*
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
