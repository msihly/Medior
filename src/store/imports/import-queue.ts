import { useRef, useEffect } from "react";
import path from "path";
import md5File from "md5-file";
import sharp from "sharp";
import { File } from "database";
import { FileImport, useStores } from "store";
import {
  checkFileExists,
  copyFile,
  deleteFile,
  generateFramesThumbnail,
  getVideoInfo,
  logToFile,
  trpc,
  VIDEO_TYPES,
} from "utils";

interface CopyFileToProps {
  dbOnly?: boolean;
  deleteOnImport: boolean;
  fileObj: FileImport;
  tagIds?: string[];
  targetDir: string;
}

interface CopyFileToResult {
  error?: string;
  file?: File;
  isDuplicate?: boolean;
  success: boolean;
}

export const copyFileTo = async ({
  dbOnly = false,
  deleteOnImport,
  fileObj,
  tagIds,
  targetDir,
}: CopyFileToProps): Promise<CopyFileToResult> => {
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
            : sharp(originalPath).resize(null, 300).toFile(thumbPaths[0]));
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
    logToFile("error", "Error importing", fileObj.toString({ withData: true }), ":", err.stack);

    if (err.code === "EEXIST") {
      const fileRes = await trpc.getFileByHash.mutate({ hash });
      if (!fileRes.data) {
        logToFile("debug", "File exists, but not in db. Inserting into db only...");
        return await copyFileTo({ dbOnly: true, deleteOnImport, fileObj, targetDir });
      } else return { success: true, file: fileRes.data, isDuplicate: true };
    } else return { success: false, error: err?.stack };
  }
};

export const useFileImportQueue = (isDebug = false) => {
  const rootStore = useStores();
  const { importStore } = useStores();

  const currentImportPath = useRef<string>(null);

  const handlePhase = async () => {
    try {
      // if (isDebug)
      //   logToFile(
      //     "debug",
      //     "Import phase update:",
      //     JSON.stringify(
      //       {
      //         activeBatch: { ...importStore.activeBatch },
      //         currentPath: currentImportPath.current,
      //         incompleteBatches: importStore.incompleteBatches,
      //       },
      //       null,
      //       2
      //     )
      //   );

      const activeBatch = importStore.activeBatch;
      const nextPath = activeBatch?.nextImport?.path;

      if (currentImportPath.current === nextPath) {
        if (isDebug) logToFile("debug", "Import phase skipped: current path matches next path.");
      } else if (nextPath) {
        if (isDebug)
          logToFile(
            "debug",
            "Importing file:",
            JSON.stringify({ ...activeBatch.nextImport }, null, 2)
          );

        currentImportPath.current = nextPath;
        const res = await importStore.importFile({
          batchId: importStore.activeBatchId,
          filePath: nextPath,
        });
        if (!res.success) throw new Error(res.error);
      } else if (!activeBatch && importStore.incompleteBatches?.length > 0) {
        const batch = importStore.incompleteBatches[0];

        if (batch?.imports?.length > 0) {
          if (isDebug)
            logToFile("debug", "Starting importBatch:", JSON.stringify({ ...batch.$ }, null, 2));

          await importStore.startImportBatch({ id: batch.id });
        } else {
          if (isDebug)
            logToFile("debug", "Import phase skipped: incomplete batch has no imports yet.");

          currentImportPath.current = null;
        }
      } else {
        currentImportPath.current = null;

        if (activeBatch && !activeBatch?.nextImport) {
          if (isDebug)
            logToFile(
              "debug",
              "Completing importBatch:",
              JSON.stringify({ ...activeBatch }, null, 2)
            );

          const res = await importStore.completeImportBatch({ id: activeBatch.id, rootStore });
          if (!res.success) throw new Error(res.error);
          importStore.setActiveBatchId(null);
        }
      }
    } catch (err) {
      logToFile("error", "Error in import phase update:", err.stack);
    }
  };

  useEffect(() => {
    handlePhase();
  }, [importStore.activeBatch?.nextImport, importStore.incompleteBatches]);
};
