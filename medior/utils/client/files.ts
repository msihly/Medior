import { promises as fs } from "fs";
import path from "path";
import { Metadata } from "sharp";
import { makePerfLog } from "trabecula/utils/server";
import type { FileSchema, ImportFileInput } from "medior/server/database";
import { CONSTANTS, dayjs } from "medior/utils/common";
import { getIsAnimated, sharp } from "medior/utils/server";
import { getVideoInfo, vidToThumbGrid } from "medior/utils/server/videos";

export const genFileInfo = async (args: {
  file?: FileSchema;
  filePath: string;
  hash: string;
  skipThumbs?: boolean;
}) => {
  const DEBUG = false;
  const { perfLog, perfLogTotal } = makePerfLog("[genFileInfo]");

  const ext = args.filePath.split(".").pop().toLowerCase();
  const isAnimated = getIsAnimated(ext);

  let isCorrupted: boolean = false;
  let imageInfo: Metadata = null;

  const stats = await fs.stat(args?.filePath);

  if (!isAnimated) {
    try {
      imageInfo = await sharp(args.filePath, { failOn: "none" }).metadata();
    } catch (err) {
      isCorrupted = true;
    }
  }

  const videoInfo = isAnimated ? await getVideoInfo(args.filePath) : null;

  const audioBitrate = isAnimated ? videoInfo.audioBitrate : null;
  const audioCodec = isAnimated ? videoInfo.audioCodec : null;
  const bitrate = isAnimated ? videoInfo.bitrate : null;
  const dateModified =
    !args.file || dayjs(stats.mtime).isAfter(args.file?.dateModified)
      ? stats.mtime.toISOString()
      : args.file?.dateModified;
  const duration = isAnimated ? videoInfo?.duration : null;
  const frameRate = isAnimated ? videoInfo?.frameRate : null;
  const width = isAnimated ? videoInfo?.width : imageInfo?.width;
  const height = isAnimated ? videoInfo?.height : imageInfo?.height;
  const videoCodec = isAnimated ? videoInfo?.videoCodec : null;
  if (DEBUG) perfLog(`Got file info.`);

  const hasFrames = duration > 0;
  const dirPath = path.dirname(args.filePath);
  let thumbPath = path.resolve(dirPath, `${args.hash}-thumb.jpg`);

  if (!args.skipThumbs) {
    if (hasFrames) {
      const thumbGridRes = await vidToThumbGrid(args.filePath, dirPath, args.hash);
      isCorrupted = thumbGridRes.isCorrupted;
      thumbPath = thumbGridRes.path;
    } else {
      try {
        await sharp(args.filePath, { failOn: "none" })
          .resize(null, CONSTANTS.FILE.THUMB.MAX_DIM)
          .toFile(thumbPath);
      } catch {
        isCorrupted = true;
      }
    }

    if (DEBUG) perfLog(`Generated thumbnail.`);
  }

  const fileInfo: Partial<ImportFileInput> = {
    audioBitrate,
    audioCodec,
    bitrate,
    dateModified,
    duration,
    ext,
    frameRate,
    hash: args?.hash,
    height,
    isCorrupted,
    size: stats.size,
    thumb: {
      frameHeight: isAnimated ? height : null,
      frameWidth: isAnimated ? width : null,
      path: thumbPath,
    },
    videoCodec,
    width,
  };

  if (DEBUG) perfLogTotal(`Generated file info: ${JSON.stringify(fileInfo)}.`);
  return fileInfo as ImportFileInput;
};
