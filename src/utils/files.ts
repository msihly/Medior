import { promises as fs, constants as fsc } from "fs";
import path from "path";
import { FileImport } from "store";
import { handleErrors } from "./miscellaneous";

export const IMAGE_TYPES = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "jif",
  "jiff",
  "jfif",
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const IMAGE_EXT_REG_EXP = new RegExp(`${IMAGE_TYPES.join("|")}`, "i");

export const VIDEO_TYPES = ["webm", "mp4", "mkv", "mov", "m4v", "f4v", "flv", "3gp"] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];
export const VIDEO_EXT_REG_EXP = new RegExp(`${VIDEO_TYPES.join("|")}`, "i");
export const ANIMATED_EXT_REG_EXP = new RegExp(`gif|${VIDEO_TYPES.join("|")}`, "i");

export const THUMB_WIDTH = 400;

const EXT_REG_EXP = new RegExp(`\.(${IMAGE_TYPES.join("|")}|${VIDEO_TYPES.join("|")})$`, "i");

export const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

export const copyFile = async (dirPath: string, originalPath: string, newPath: string) => {
  if (await checkFileExists(newPath)) return false;
  await fs.mkdir(dirPath, { recursive: true });
  await fs.copyFile(originalPath, newPath, fsc.COPYFILE_EXCL);
  return true;
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

export const dirToFileImports = async (dirPath: string) =>
  await filePathsToImports(await dirToFilePaths(dirPath));

export const dirToFilePaths = async (dirPath: string): Promise<string[]> => {
  const paths = await fs.readdir(dirPath, { withFileTypes: true });
  return (
    await Promise.all(
      paths.map(async (dirent) => {
        const filePath = path.join(dirPath, dirent.name);
        return dirent.isDirectory() ? await dirToFilePaths(filePath) : filePath;
      })
    )
  ).flat();
};

export const filePathsToImports = async (filePaths: string[]) => {
  return (
    await Promise.all(
      filePaths.map(async (filePath) => {
        const extension = path.extname(filePath);
        if (!EXT_REG_EXP.test(extension)) return null;

        const { birthtime, size } = await fs.stat(filePath);
        return {
          dateCreated: birthtime.toISOString(),
          extension,
          name: path.parse(filePath).name,
          path: filePath,
          size,
          status: "PENDING",
        } as FileImport;
      })
    )
  ).filter((filePath) => filePath !== null);
};

export const removeEmptyFolders = async (dirPath: string = ".", excluded?: string[]) => {
  if (!(await fs.stat(dirPath)).isDirectory() || excluded?.includes(path.basename(dirPath))) return;

  let files = await fs.readdir(dirPath);
  if (files.length) {
    await Promise.all(files.map((f) => removeEmptyFolders(path.join(dirPath, f), excluded)));
    files = await fs.readdir(dirPath);
  }

  if (!files.length && path.resolve(dirPath) !== path.resolve(process.cwd()))
    await fs.rmdir(dirPath);
};