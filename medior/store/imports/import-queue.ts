import fs from "fs/promises";
import path from "path";
import md5File from "md5-file";
import { FileSchema } from "medior/database";
import { FileImport, RootStore } from "medior/store";
import {
  CONSTANTS,
  checkFileExists,
  copyFile,
  dayjs,
  deleteFile,
  dirToFilePaths,
  extendFileName,
  generateFramesThumbnail,
  getAvailableFileStorage,
  getConfig,
  getVideoInfo,
  makePerfLog,
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
  file?: FileSchema;
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
  const DEBUG = false;
  const { perfLog } = makePerfLog("[CopyFileForImport]");

  const config = getConfig();
  let hash: string;

  try {
    const { dateCreated, extension, name, path: originalPath, size } = fileImport;
    const ext = extension.toLowerCase();

    const [targetDir] = await Promise.all([
      (async () => {
        const fileStorageRes = await getAvailableFileStorage(size);
        if (!fileStorageRes.success) throw new Error(fileStorageRes.error);
        const targetDir = fileStorageRes.data;
        if (DEBUG) perfLog("Got target dir");
        return targetDir;
      })(),
      (async () => {
        hash = await md5File(originalPath);
        if (DEBUG) perfLog("Hashed file");
      })(),
    ]);

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
    if (DEBUG) perfLog("Checked if file is duplicate or previously deleted");

    const fileExistsAtPath = await checkFileExists(newPath);
    if (DEBUG) perfLog(`File exists at path: ${fileExistsAtPath}`);

    if (!fileExistsAtPath) await copyFile(dirPath, originalPath, newPath);
    if (DEBUG) perfLog("Copied file");

    if (isDuplicate) {
      if (tagIds?.length > 0) {
        const res = await trpc.editFileTags.mutate({
          addedTagIds: tagIds,
          fileIds: [file.id],
          withSub: false,
        });
        if (!res.success) throw new Error(res.error);
        if (DEBUG) perfLog("Added tags to duplicate file");
      }

      if (fileImport.diffusionParams?.length > 0) {
        const res = await trpc.updateFile.mutate({
          id: file.id,
          diffusionParams: fileImport.diffusionParams,
        });
        if (!res.success) throw new Error(res.error);
        if (DEBUG) perfLog("Updated diffusion params of duplicate file");
      }
    } else if (!(isPrevDeleted && ignorePrevDeleted)) {
      const isAnimated = [...config.file.videoTypes, "gif"].includes(extFromPath);

      const imageInfo = !isAnimated ? await sharp(originalPath).metadata() : null;
      const videoInfo = isAnimated ? await getVideoInfo(originalPath) : null;
      const duration = isAnimated ? videoInfo?.duration : null;
      const frameRate = isAnimated ? videoInfo?.frameRate : null;
      const width = isAnimated ? videoInfo?.width : imageInfo?.width;
      const height = isAnimated ? videoInfo?.height : imageInfo?.height;
      if (DEBUG) perfLog("Got file info");

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
          : sharp(originalPath).resize(null, CONSTANTS.FILE.THUMB.WIDTH).toFile(thumbPaths[0]));
        if (DEBUG) perfLog("Generated thumbnail(s)");
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
      if (DEBUG) perfLog("Imported file");
    }

    if (deleteOnImport && !(isPrevDeleted && ignorePrevDeleted)) {
      await deleteFile(originalPath, newPath);
      if (DEBUG) perfLog("Deleted original file");

      if (fileImport.diffusionParams?.length > 0) {
        await deleteFile(extendFileName(originalPath, "txt"));
        if (DEBUG) perfLog("Deleted diffusion params file");
      }
    }

    return { success: true, file, isDuplicate, isPrevDeleted };
  } catch (err) {
    if (err.code === "EEXIST" || err.message.includes("duplicate key")) {
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
    } else {
      console.error("Error importing", fileImport.toString({ withData: true }), ":", err.stack);
      return { success: false, error: err?.stack };
    }
  }
};

export const dirToFileImports = async (dirPath: string) => {
  const filePaths = await dirToFilePaths(dirPath);
  const imports = await filePathsToImports(filePaths);
  return { filePaths, imports };
};

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

        const stats = await fs.stat(filePath);
        return new FileImport({
          dateCreated: dayjs(
            Math.min(stats.birthtime.valueOf(), stats.ctime.valueOf(), stats.mtime.valueOf())
          ).toISOString(),
          extension,
          name: path.parse(filePath).name,
          path: filePath,
          size: stats.size,
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
    const { perfLog, perfLogTotal } = makePerfLog("[Ingest]");
    stores.import.editor.setIsInitDone(false);
    stores.import.setIsImportEditorOpen(true);

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

    const rootFolderPath = filePaths[0] ? path.dirname(filePaths[0]) : folderPaths[0];
    const initialRootIndex = rootFolderPath.split(path.sep).length - 1;
    stores.import.setEditorRootFolderPath(rootFolderPath);
    stores.import.setEditorRootFolderIndex(initialRootIndex);
    perfLog("Set root folder path and index");

    const [folders, importsFromFilePaths] = await Promise.all([
      await Promise.all(folderPaths.map((f) => dirToFileImports(f))),
      filePathsToImports(filePaths),
    ]);
    const editorFilePaths = [...filePaths, ...folders.flatMap((f) => f.filePaths)];
    const editorImports = [...importsFromFilePaths, ...folders.flatMap((f) => f.imports)];
    perfLog("Created editor file paths and imports");

    stores.import.setEditorFilePaths(editorFilePaths);
    stores.import.setEditorImports(editorImports);
    perfLog("Set editor file paths and imports");

    perfLogTotal("Init done");
    setTimeout(() => stores.import.editor.setIsInitDone(true), 0);
  } catch (err) {
    toast.error("Error queuing imports");
    console.error(err);
  }
};
