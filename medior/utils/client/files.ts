import { promises as fs } from "fs";
import path from "path";
import type { FileSchema, ImportFileInput } from "medior/server/database";
import { getIsAnimated, sharp } from "medior/utils/client";
import { CONSTANTS, dayjs, handleErrors } from "medior/utils/common";
import { getVideoInfo, makePerfLog, vidToThumbGrid } from "medior/utils/server";

export const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

export const deleteFile = (path: string, copiedPath?: string) =>
  handleErrors(async () => {
    if (!(await checkFileExists(path))) return false;
    if (copiedPath && !(await checkFileExists(copiedPath)))
      throw new Error(
        `Failed to delete ${path}. File does not exist at copied path ${copiedPath}.`,
      );

    await fs.unlink(path);
    return true;
  });

export const extendFileName = (fileName: string, ext: string) =>
  `${path.relative(".", fileName).replace(/\.\w+$/, "")}.${ext}`;

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

  let isCorrupted: boolean;
  const stats = await fs.stat(args?.filePath);
  const imageInfo = !isAnimated ? await sharp(args.filePath).metadata() : null;
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
    } else
      sharp(args.filePath, { failOn: "none" })
        .resize(null, CONSTANTS.FILE.THUMB.MAX_DIM)
        .toFile(thumbPath);
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
