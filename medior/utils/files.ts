import * as fss from "fs";
import { promises as fs } from "fs";
import path from "path";
import { handleErrors, throttle, trpc } from "medior/utils";

export const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

export const copyFile = async (dirPath: string, originalPath: string, newPath: string) => {
  if (await checkFileExists(newPath)) return false;
  await fs.mkdir(dirPath, { recursive: true });

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
};

export const deleteFile = (path: string, copiedPath?: string) =>
  handleErrors(async () => {
    if (!(await checkFileExists(path)))
      throw new Error(`Failed to delete ${path}. File does not exist.`);
    if (copiedPath && !(await checkFileExists(copiedPath)))
      throw new Error(
        `Failed to delete ${path}. File does not exist at copied path ${copiedPath}.`
      );

    await fs.unlink(path);
  });

export const dirToFilePaths = async (
  dirPath: string,
  recursive: boolean = true
): Promise<string[]> => {
  const paths = await fs.readdir(dirPath, { withFileTypes: true });
  return (
    await Promise.all(
      paths.map(async (dirent) => {
        const filePath = path.join(dirPath, dirent.name);
        return dirent.isDirectory()
          ? recursive
            ? await dirToFilePaths(filePath)
            : null
          : filePath;
      })
    )
  )
    .flat()
    .filter((p) => p !== null);
};

export const dirToFolderPaths = async (dirPath: string): Promise<string[]> => {
  const paths = await fs.readdir(dirPath, { withFileTypes: true });
  return (
    await Promise.all(
      paths.map(async (dirent) => {
        const filePath = path.join(dirPath, dirent.name);
        return dirent.isDirectory() ? [filePath, ...(await dirToFolderPaths(filePath))] : null;
      })
    )
  )
    .flat()
    .filter((filePath) => filePath !== null);
};

export const extendFileName = (fileName: string, ext: string) =>
  `${path.relative(".", fileName).replace(/\.\w+$/, "")}.${ext}`;

export const removeEmptyFolders = async (
  dirPath: string = ".",
  options: { excludedPaths?: string[]; removeEmptyParent?: boolean } = {}
) => {
  if (
    !(await fs.stat(dirPath)).isDirectory() ||
    options.excludedPaths?.includes(path.basename(dirPath))
  )
    return;

  const subOptions = { ...options, removeEmptyParent: false };

  let files = await fs.readdir(dirPath);
  if (files.length) {
    await Promise.all(files.map((f) => removeEmptyFolders(path.join(dirPath, f), subOptions)));
    files = await fs.readdir(dirPath);
  }

  if (!files.length) {
    try {
      await fs.rmdir(dirPath);
    } catch (err) {
      console.error(`Failed to remove ${dirPath}`, err);
    }
  }

  if (options.removeEmptyParent) await removeEmptyFolders(path.dirname(dirPath), subOptions);
};
