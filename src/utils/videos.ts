import path from "path";
import { fractionStringToNumber } from ".";

interface VideoInfo {
  duration: number;
  frameRate: number;
  height: number;
  size: number;
  width: number;
}

export const getVideoInfo = async (path: string) => {
  return (await new Promise(async (resolve, reject) => {
    const { ffprobe } = await import("fluent-ffmpeg");

    return ffprobe(path, (err, info) => {
      if (err) return reject(err);
      const { height, r_frame_rate, width } = info.streams.find((s) => s.codec_type === "video");
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
    const frameInterval = duration / numOfFrames;

    try {
      await new Promise(async (resolve, reject) => {
        const ffmpeg = (await import("fluent-ffmpeg")).default;

        return ffmpeg()
          .input(inputPath)
          .outputOptions([
            `-vf fps=1/${frameInterval},scale=300:300:force_original_aspect_ratio=increase,crop=300:300`,
            `-vframes ${numOfFrames}`,
          ])
          .output(path.join(outputPath, `${fileHash}-thumb-%02d.jpg`))
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      return Array(numOfFrames)
        .fill("")
        .map((_, i) => path.join(outputPath, `${fileHash}-thumb-${i + 1}.jpg`));
    } catch (err) {
      console.error("ERR::generateFramesThumbnail()", err);
      return [];
    }
  } catch (err) {
    console.error("ERR::getVideoInfo()", err);
    return [];
  }
};

// export const generateVideoThumbnail = async (
//   inputPath: string,
//   outputPath: string,
//   thumbDuration = 3
// ) => {
//   const { duration } = await getVideoInfo(inputPath);
//   const safeThumbDur = duration - thumbDuration;
//   const startTime = safeThumbDur <= 0 ? 0 : getRandomInt(0.1 * safeThumbDur, 0.9 * safeThumbDur);

//   return await new Promise((resolve, reject) => {
//     return ffmpeg()
//       .input(inputPath)
//       .inputOptions([`-ss ${startTime}`])
//       .outputOptions([`-t ${thumbDuration}`])
//       .noAudio()
//       .output(path.join(outputPath, "test.mp4"))
//       .on("end", resolve)
//       .on("error", reject)
//       .run();
//   });
// };
