import fs from "fs/promises";
import path from "path";
import { FileImport } from "store";

export const IMAGE_TYPES = ["jpg", "jpeg", "png", "gif", "webp", "jif", "jiff", "jfif"] as const;
export type ImageType = typeof IMAGE_TYPES[number];
export const IMAGE_EXT_REG_EXP = new RegExp(`${IMAGE_TYPES.join("|")}`, "i");

export const VIDEO_TYPES = ["webm", "mp4", "mkv", "m4v", "f4v"] as const;
export type VideoType = typeof VIDEO_TYPES[number];
export const VIDEO_EXT_REG_EXP = new RegExp(`${VIDEO_TYPES.join("|")}`, "i");
export const ANIMATED_EXT_REG_EXP = new RegExp(`gif|${VIDEO_TYPES.join("|")}`, "i");

const EXT_REG_EXP = new RegExp(`\.(${IMAGE_TYPES.join("|")}|${VIDEO_TYPES.join("|")})$`, "i");

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
