import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { THUMB_WIDTH, fractionStringToNumber } from ".";

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
    const frameInterval = duration / numOfFrames;

    try {
      await new Promise(async (resolve, reject) => {
        return ffmpeg()
          .input(inputPath)
          .outputOptions([
            `-vf fps=1/${frameInterval},scale=${THUMB_WIDTH}:-1:force_original_aspect_ratio=increase,crop=min(iw\\,${THUMB_WIDTH}):ih`,
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
