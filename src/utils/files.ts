import { promises as fs, constants as fsc } from "fs";
import path from "path";
import { handleErrors } from "./miscellaneous";

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
