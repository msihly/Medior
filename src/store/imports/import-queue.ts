import fs from "fs/promises";
import path from "path";
import md5File from "md5-file";
import sharp from "sharp";
import { File } from "database";
import { FileImport, RootStore } from "store";
import {
  checkFileExists,
  copyFile,
  deleteFile,
  dirToFilePaths,
  generateFramesThumbnail,
  getVideoInfo,
  IMAGE_TYPES,
  THUMB_WIDTH,
  trpc,
  VIDEO_TYPES,
} from "utils";
import { toast } from "react-toastify";

interface CopyFileForImportProps {
  dbOnly?: boolean;
  deleteOnImport: boolean;
  fileObj: FileImport;
  tagIds?: string[];
  targetDir: string;
}

interface CopyFileForImportResult {
  error?: string;
  file?: File;
  isDuplicate?: boolean;
  success: boolean;
}

export const copyFileForImport = async ({
  dbOnly = false,
  deleteOnImport,
  fileObj,
  tagIds,
  targetDir,
}: CopyFileForImportProps): Promise<CopyFileForImportResult> => {
  let hash: string;

  try {
    const { dateCreated, extension, name, path: originalPath, size } = fileObj;
    const ext = extension.toLowerCase();

    hash = await md5File(originalPath);

    const dirPath = `${targetDir}\\${hash.substring(0, 2)}\\${hash.substring(2, 4)}`;
    const extFromPath = originalPath.split(".").pop().toLowerCase();
    const newPath = `${dirPath}\\${hash}.${extFromPath}`;
    const isAnimated = [...VIDEO_TYPES, "gif"].includes(extFromPath);

    // const sharp = !isAnimated ? (await import("sharp")).default : null; // removed dynamic import due to packaged release issue
    const imageInfo = !isAnimated ? await sharp(originalPath).metadata() : null;
    const videoInfo = isAnimated ? await getVideoInfo(originalPath) : null;
    const duration = isAnimated ? videoInfo?.duration : null;
    const frameRate = isAnimated ? videoInfo?.frameRate : null;
    const width = isAnimated ? videoInfo?.width : imageInfo?.width;
    const height = isAnimated ? videoInfo?.height : imageInfo?.height;

    const thumbPaths =
      duration > 0
        ? Array(9)
            .fill("")
            .map((_, i) =>
              path.join(dirPath, `${hash}-thumb-${String(i + 1).padStart(2, "0")}.jpg`)
            )
        : [path.join(dirPath, `${hash}-thumb.${extFromPath}`)];

    if (!dbOnly) {
      if (!(await checkFileExists(newPath)))
        if (await copyFile(dirPath, originalPath, newPath))
          await (duration > 0
            ? generateFramesThumbnail(originalPath, dirPath, hash, duration)
            : sharp(originalPath, { failOn: "none" })
                .resize(null, THUMB_WIDTH)
                .toFile(thumbPaths[0]));
    }

    let fileRes = await trpc.getFileByHash.mutate({ hash });
    if (!fileRes.success) throw new Error(fileRes.error);
    let file = fileRes.data;
    let isDuplicate = false;

    if (!file) {
      const res = await trpc.importFile.mutate({
        dateCreated,
        duration,
        ext,
        frameRate,
        hash,
        height,
        originalName: name,
        originalPath,
        path: newPath,
        size,
        tagIds,
        thumbPaths,
        width,
      });

      if (!res.success) throw new Error(res.error);
      file = res.data;
    } else isDuplicate = true;

    if (deleteOnImport) await deleteFile(originalPath, newPath);
    return { success: true, file, isDuplicate };
  } catch (err) {
    console.error("Error importing", fileObj.toString({ withData: true }), ":", err.stack);

    if (err.code === "EEXIST") {
      const fileRes = await trpc.getFileByHash.mutate({ hash });
      if (!fileRes.data) {
        console.debug("File exists, but not in db. Inserting into db only...");
        return await copyFileForImport({ dbOnly: true, deleteOnImport, fileObj, targetDir });
      } else return { success: true, file: fileRes.data, isDuplicate: true };
    } else return { success: false, error: err?.stack };
  }
};

export const dirToFileImports = async (dirPath: string) =>
  await filePathsToImports(await dirToFilePaths(dirPath));

const EXT_REG_EXP = new RegExp(`\.(${IMAGE_TYPES.join("|")}|${VIDEO_TYPES.join("|")})$`, "i");

export const filePathsToImports = async (filePaths: string[]) => {
  return (
    await Promise.all(
      filePaths.map(async (filePath) => {
        const extension = path.extname(filePath);
        if (!EXT_REG_EXP.test(extension)) return null;

        const { birthtime, size } = await fs.stat(filePath);
        return new FileImport({
          dateCreated: birthtime.toISOString(),
          extension,
          name: path.parse(filePath).name,
          path: filePath,
          size,
          status: "PENDING",
        });
      })
    )
  ).filter((filePath) => filePath !== null);
};

export const handleIngest = async ({
  fileList,
  rootStore,
}: {
  fileList: FileList;
  rootStore: RootStore;
}) => {
  try {
    const { importStore } = rootStore;
    const [filePaths, folderPaths] = [...fileList]
      .sort((a, b) => {
        const lengthDiff = a.path.split(path.sep).length - b.path.split(path.sep).length;
        if (lengthDiff !== 0) return lengthDiff;
        return a.name.localeCompare(b.name);
      })
      .reduce((acc, cur) => (acc[cur.type === "" ? 1 : 0].push(cur.path), acc), [
        [],
        [],
      ] as string[][]);

    const initialRootIndex =
      (filePaths[0] ? path.dirname(filePaths[0]) : folderPaths[0]).split(path.sep).length - 1;

    importStore.setEditorRootFolderPath(filePaths[0] ? path.dirname(filePaths[0]) : folderPaths[0]);
    importStore.setEditorRootFolderIndex(initialRootIndex);
    importStore.setIsImportEditorOpen(true);

    importStore.setEditorFilePaths([
      ...(await Promise.all(folderPaths.map((f) => dirToFilePaths(f)))).flat(),
      ...filePaths,
    ]);

    importStore.setEditorImports(
      (
        await Promise.all([
          ...folderPaths.map((f) => dirToFileImports(f)),
          ...filePaths.map((f) => filePathsToImports([f])),
        ])
      ).flat()
    );
  } catch (err) {
    toast.error("Error queuing imports");
    console.error(err);
  }
};
