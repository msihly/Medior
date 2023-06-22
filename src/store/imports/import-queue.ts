import { useRef, useEffect } from "react";
import path from "path";
import md5File from "md5-file";
import { File, FileModel } from "database";
import { FileImport, useStores } from "store";
import {
  checkFileExists,
  copyFile,
  dayjs,
  deleteFile,
  generateFramesThumbnail,
  getVideoInfo,
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
  const { dateCreated, extension, name, path: originalPath, size } = fileObj;
  const ext = extension.toLowerCase();

  const hash = await md5File(originalPath);
  const dirPath = `${targetDir}\\${hash.substring(0, 2)}\\${hash.substring(2, 4)}`;
  const extFromPath = originalPath.split(".").pop().toLowerCase();
  const newPath = `${dirPath}\\${hash}.${extFromPath}`;
  const isAnimated = [...VIDEO_TYPES, "gif"].includes(extFromPath);

  const sharp = !isAnimated ? (await import("sharp")).default : null;
  const imageInfo = !isAnimated ? await sharp(originalPath).metadata() : null;
  const videoInfo = isAnimated ? await getVideoInfo(originalPath) : null;
  const duration = isAnimated ? videoInfo?.duration : null;
  const frameRate = isAnimated ? videoInfo?.frameRate : null;
  const width = isAnimated ? videoInfo?.width : imageInfo?.width;
  const height = isAnimated ? videoInfo?.height : imageInfo?.height;

  try {
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
      file = (
        await FileModel.create({
          dateCreated,
          dateModified: dayjs().toISOString(),
          duration,
          ext,
          frameRate,
          hash,
          height,
          isArchived: false,
          originalHash: hash,
          originalName: name,
          originalPath,
          path: newPath,
          rating: 0,
          size,
          tagIds,
          thumbPaths,
          width,
        })
      ).toJSON();
    } else isDuplicate = true;

    if (deleteOnImport) await deleteFile(originalPath, newPath);
    return { success: true, file, isDuplicate };
  } catch (err) {
    console.error("Error importing", fileObj.toString({ withData: true }), ":", err);

    if (err.code === "EEXIST") {
      const fileRes = await trpc.getFileByHash.mutate({ hash });
      if (!fileRes.data) {
        console.log("File exists, but not in db. Inserting into db only...");
        return await copyFileTo({ dbOnly: true, deleteOnImport, fileObj, targetDir });
      } else return { success: true, file: fileRes.data, isDuplicate: true };
    } else return { success: false, error: err?.message };
  }
};

export const useFileImportQueue = () => {
  const rootStore = useStores();
  const { importStore } = useStores();

  const currentImportPath = useRef<string>(null);

  const handlePhase = async () => {
    // console.debug("Import phase update:", {
    //   activeBatch: { ...importStore.activeBatch },
    //   currentPath: currentImportPath.current,
    //   incompleteBatches: importStore.incompleteBatches,
    // });

    const activeBatch = importStore.activeBatch;
    const nextPath = activeBatch?.nextImport?.path;

    if (currentImportPath.current === nextPath) {
      console.debug("Import phase skipped: current path matches next path.");
    } else if (nextPath) {
      console.debug("Importing file:", { ...activeBatch.nextImport });
      currentImportPath.current = nextPath;
      await importStore.importFile({ batchId: importStore.activeBatchId, filePath: nextPath });
    } else if (!activeBatch && importStore.incompleteBatches?.length > 0) {
      const batch = importStore.incompleteBatches[0];

      if (batch?.imports?.length > 0) {
        console.debug("Starting importBatch:", { ...batch.$ });
        await trpc.startImportBatch.mutate({ id: batch.id });
        importStore.setActiveBatchId(batch.id);
      } else {
        console.debug("Import phase skipped: incomplete batch has no imports yet.");
        currentImportPath.current = null;
      }
    } else {
      currentImportPath.current = null;

      if (activeBatch && !activeBatch?.nextImport) {
        console.debug("Completing importBatch:", { ...activeBatch });
        await importStore.completeImportBatch({ id: activeBatch.id, rootStore });
        importStore.setActiveBatchId(null);
      }
    }
  };

  useEffect(() => {
    handlePhase();
  }, [handlePhase, importStore.activeBatch?.nextImport, importStore.incompleteBatches]);
};
