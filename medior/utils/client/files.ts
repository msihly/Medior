// import * as fss from "fs";
import { constants as fsc, promises as fs } from "fs";
import path from "path";
import type { FileSchema, ImportFileInput } from "medior/server/database";
import { getIsAnimated, sharp } from "medior/utils/client";
import { CONSTANTS, dayjs, handleErrors } from "medior/utils/common";
import { getVideoInfo, makePerfLog, vidToThumbGrid } from "medior/utils/server";

export const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

export const copyFile = async (dirPath: string, originalPath: string, newPath: string) => {
  if (await checkFileExists(newPath)) return false;
  await fs.mkdir(dirPath, { recursive: true });

  await fs.copyFile(originalPath, newPath, fsc.COPYFILE_EXCL);
  return true;

  /*
  return new Promise(async (resolve, reject) => {
    try {
      const stats = await fs.stat(originalPath);
      const totalBytes = stats.size;

      const readStream = fss.createReadStream(originalPath);
      const writeStream = fss.createWriteStream(newPath, { flags: "wx" });

      let completedBytes = 0;
      const startTime = Date.now();

      const makeImportStats = (bytes: number) => {
        completedBytes += bytes;
        const elapsedTime = (Date.now() - startTime) / 1000;
        const rateInBytes = completedBytes / elapsedTime;
        const importStats = { completedBytes, elapsedTime, rateInBytes, totalBytes };
        trpc.emitImportStatsUpdated.mutate({ importStats });
      };

      const throttledMakeImportStats = throttle(makeImportStats, 1000);

      readStream.on("data", (chunk) => {
        throttledMakeImportStats(chunk.length);
      });

      readStream.on("end", () => {
        resolve(true);
      });

      readStream.on("error", (err) => {
        console.error("ReadStream error:", err);
        reject(err);
      });

      writeStream.on("error", (err) => {
        console.error("WriteStream error:", err);
        reject(err);
      });

      readStream.pipe(writeStream);
    } catch (err) {
      console.error("Error in promise:", err);
      reject(err);
    }
  });
  */
};

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
  let thumbPath = path.join(dirPath, `${args.hash}-thumb.jpg`);

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
