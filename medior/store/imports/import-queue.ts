import fs from "fs/promises";
import path from "path";
import md5File from "md5-file";
import { File } from "medior/database";
import { FileImport, RootStore } from "medior/store";
import {
  CONSTANTS,
  checkFileExists,
  copyFile,
  deleteFile,
  dirToFilePaths,
  extendFileName,
  generateFramesThumbnail,
  getAvailableFileStorage,
  getConfig,
  getVideoInfo,
  sharp,
  trpc,
} from "medior/utils";
import { toast } from "react-toastify";

interface CopyFileForImportProps {
  dbOnly?: boolean;
  deleteOnImport: boolean;
  fileImport: FileImport;
  ignorePrevDeleted: boolean;
  tagIds: string[];
}

interface CopyFileForImportResult {
  error?: string;
  file?: File;
  isDuplicate?: boolean;
  isPrevDeleted?: boolean;
  success: boolean;
}

export const copyFileForImport = async ({
  dbOnly = false,
  deleteOnImport,
  fileImport,
  ignorePrevDeleted,
  tagIds,
}: CopyFileForImportProps): Promise<CopyFileForImportResult> => {
  const config = getConfig();
  let hash: string;

  try {
    const { dateCreated, extension, name, path: originalPath, size } = fileImport;
    const ext = extension.toLowerCase();

    hash = await md5File(originalPath);

    const fileStorageRes = await getAvailableFileStorage(size);
    if (!fileStorageRes.success) throw new Error(fileStorageRes.error);
    const targetDir = fileStorageRes.data;

    const dirPath = `${targetDir}\\${hash.substring(0, 2)}\\${hash.substring(2, 4)}`;
    const extFromPath = originalPath.split(".").pop().toLowerCase();
    const newPath = `${dirPath}\\${hash}.${extFromPath}`;

    const [deletedFileRes, fileRes] = await Promise.all([
      trpc.getDeletedFile.mutate({ hash }),
      trpc.getFileByHash.mutate({ hash }),
    ]);
    if (!fileRes.success) throw new Error(fileRes.error);
    let file = fileRes.data;
    const isDuplicate = !!file;
    const isPrevDeleted = !!deletedFileRes.data;

    const fileExistsAtPath = await checkFileExists(newPath);
    if (!fileExistsAtPath) await copyFile(dirPath, originalPath, newPath);

    if (isDuplicate) {
      if (tagIds?.length > 0) {
        const res = await trpc.editFileTags.mutate({
          addedTagIds: tagIds,
          fileIds: [file.id],
          withSub: false,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (fileImport.diffusionParams?.length > 0) {
        const res = await trpc.updateFile.mutate({
          id: file.id,
          diffusionParams: fileImport.diffusionParams,
        });
        if (!res.success) throw new Error(res.error);
      }
    } else if (!(isPrevDeleted && ignorePrevDeleted)) {
      const isAnimated = [...config.file.videoTypes, "gif"].includes(extFromPath);

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
          : [path.join(dirPath, `${hash}-thumb.jpg`)];

      if (!dbOnly && !fileExistsAtPath) {
        await (duration > 0
          ? generateFramesThumbnail(originalPath, dirPath, hash, duration)
          : sharp(originalPath).resize(null, CONSTANTS.THUMB.WIDTH).toFile(thumbPaths[0]));
      }

      const res = await trpc.importFile.mutate({
        dateCreated,
        duration,
        diffusionParams: fileImport.diffusionParams,
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
    }

    if (deleteOnImport && !(isPrevDeleted && ignorePrevDeleted)) {
      await deleteFile(originalPath, newPath);
      if (fileImport.diffusionParams?.length > 0)
        await deleteFile(extendFileName(originalPath, "txt"));
    }

    return { success: true, file, isDuplicate, isPrevDeleted };
  } catch (err) {
    console.error("Error importing", fileImport.toString({ withData: true }), ":", err.stack);

    if (err.code === "EEXIST") {
      const fileRes = await trpc.getFileByHash.mutate({ hash });
      if (!fileRes.data) {
        console.debug("File exists, but not in db. Inserting into db only...");
        return await copyFileForImport({
          dbOnly: true,
          deleteOnImport,
          ignorePrevDeleted,
          fileImport,
          tagIds,
        });
      } else return { success: true, file: fileRes.data, isDuplicate: true };
    } else return { success: false, error: err?.stack };
  }
};

export const dirToFileImports = async (dirPath: string) =>
  await filePathsToImports(await dirToFilePaths(dirPath));

export const filePathsToImports = async (filePaths: string[]) => {
  const config = getConfig();

  const EXT_REG_EXP = new RegExp(
    `\.(${config.file.imageTypes.join("|")}|${config.file.videoTypes.join("|")})$`,
    "i"
  );

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
  stores,
}: {
  fileList: FileList;
  stores: RootStore;
}) => {
  try {
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

    stores.import.setEditorRootFolderPath(
      filePaths[0] ? path.dirname(filePaths[0]) : folderPaths[0]
    );
    stores.import.setEditorRootFolderIndex(initialRootIndex);

    stores.import.setEditorFilePaths([
      ...(await Promise.all(folderPaths.map((f) => dirToFilePaths(f)))).flat(),
      ...filePaths,
    ]);

    stores.import.setEditorImports(
      (
        await Promise.all([
          ...folderPaths.map((f) => dirToFileImports(f)),
          ...filePaths.map((f) => filePathsToImports([f])),
        ])
      ).flat()
    );

    stores.import.setIsImportEditorOpen(true);
  } catch (err) {
    toast.error("Error queuing imports");
    console.error(err);
  }
};
