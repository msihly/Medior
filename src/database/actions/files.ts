import { promises as fs, constants as fsc } from "fs";
import path from "path";
import md5File from "md5-file";
import sharp from "sharp";
import { File, FileModel } from "database";
import { FileStore } from "store/files";
import { FileImportInstance } from "store/imports";
import { dayjs, generateFramesThumbnail, getVideoInfo, splitArray } from "utils";

const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

const copyFile = async (dirPath: string, originalPath: string, newPath: string) => {
  if (await checkFileExists(newPath)) return false;
  await fs.mkdir(dirPath, { recursive: true });
  await fs.copyFile(originalPath, newPath, fsc.COPYFILE_EXCL);
  return true;
};

interface CopyFileToProps {
  dbOnly?: boolean;
  fileObj: FileImportInstance;
  tagIds?: string[];
  targetDir: string;
}

export const copyFileTo = async ({
  dbOnly = false,
  fileObj,
  tagIds,
  targetDir,
}: CopyFileToProps) => {
  const { dateCreated, extension: ext, name, path: originalPath, size } = fileObj;

  const hash = await md5File(originalPath);
  const dirPath = `${targetDir}\\${hash.substring(0, 2)}\\${hash.substring(2, 4)}`;
  const extFromPath = originalPath.split(".").pop();
  const newPath = `${dirPath}\\${hash}.${extFromPath}`;
  const isAnimated = ["gif", "mp4", "mkv", "webm"].includes(extFromPath);
  const duration = isAnimated ? (await getVideoInfo(originalPath))?.duration : null;

  try {
    const thumbPaths = isAnimated
      ? Array(9)
          .fill("")
          .map((_, i) => path.join(dirPath, `${hash}-thumb-${String(i + 1).padStart(2, "0")}.jpg`))
      : [path.join(dirPath, `${hash}-thumb.${extFromPath}`)];

    if (!dbOnly) {
      if (!(await checkFileExists(newPath)))
        if (await copyFile(dirPath, originalPath, newPath))
          await (isAnimated
            ? generateFramesThumbnail(originalPath, dirPath, hash)
            : sharp(originalPath).resize(300, 300).toFile(thumbPaths[0]));
    }

    let file = await getFileByHash(hash);

    if (!file) {
      file = (
        await FileModel.create({
          dateCreated,
          dateModified: dayjs().toISOString(),
          duration,
          ext,
          hash,
          isArchived: false,
          originalName: name,
          originalPath,
          path: newPath,
          rating: 0,
          size,
          tagIds,
          thumbPaths,
        })
      ).toJSON();

      return { success: true, file, isDuplicate: false };
    } else return { success: true, file, isDuplicate: true };
  } catch (err) {
    console.log("Error importing", { ...fileObj }, ":", err);

    if (err.code === "EEXIST") {
      const file = await getFileByHash(hash);

      if (!file) {
        console.log("File exists, but not in db. Inserting into db only...", {
          dateCreated,
          dirPath,
          duration,
          ext,
          extFromPath,
          hash,
          isAnimated,
          name,
          newPath,
          originalPath,
          size,
          tagIds,
        });

        return await copyFileTo({ fileObj, targetDir, dbOnly: true });
      }

      return { success: true, file, isDuplicate: true };
    } else {
      console.error(err?.message ?? err);
      return { success: false, error: err?.message ?? err };
    }
  }
};

export const deleteFiles = async (fileStore: FileStore, files: File[], isUndelete = false) => {
  if (!files?.length) return false;

  try {
    const fileIds = files.map((f) => f.id);

    if (isUndelete) {
      await FileModel.updateMany({ _id: { $in: fileIds } }, { isArchived: false });
      fileStore.archiveFiles(fileIds, true);
      return true;
    }

    const [deleted, archived]: File[][] = splitArray(files, (f: File) => f.isArchived);
    const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));

    if (archivedIds?.length > 0) {
      await FileModel.updateMany({ _id: { $in: archivedIds } }, { isArchived: true });
      fileStore.archiveFiles(archivedIds);
    }

    if (deletedIds?.length > 0) {
      await FileModel.deleteMany({ _id: { $in: deletedIds } });
      await Promise.all(
        deleted.flatMap((file) =>
          fileStore.listByHash(file.hash).length === 1
            ? [fs.unlink(file.path), ...file.thumbPaths.map((thumbPath) => fs.unlink(thumbPath))]
            : []
        )
      );

      fileStore.deleteFiles(deletedIds);
    }

    fileStore.toggleFilesSelected(fileIds, false);

    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const editFileTags = async (
  fileStore: FileStore,
  fileIds: string[] = [],
  addedTagIds: string[] = [],
  removedTagIds: string[] = []
) => {
  if (!fileIds?.length || (!addedTagIds?.length && !removedTagIds?.length)) return false;

  try {
    const files = (await FileModel.find({ _id: { $in: fileIds } })).map((f) => {
      const file = f.toJSON();
      const tagIds = file.tagIds.filter((tagId) => !removedTagIds.includes(tagId));

      addedTagIds.forEach((tagId) => {
        if (!tagIds.includes(tagId)) tagIds.push(tagId);
      });

      return { ...file, tagIds };
    });

    const dateModified = dayjs().toISOString();

    files.forEach(async (f) => {
      await FileModel.updateOne({ _id: f.id }, { tagIds: f.tagIds, dateModified });
      fileStore.getById(f.id).updateTags(f.tagIds, dateModified);
    });

    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const getFileByHash = async (hash: string) => {
  try {
    const file = (await FileModel.findOne({ hash }))?.toJSON?.() as File;
    return file;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const getAllFiles = async () => {
  try {
    const files = (await FileModel.find()).map((r) => r.toJSON() as File);
    return files;
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const setFileRating = async (
  fileStore: FileStore,
  fileIds: string[] = [],
  rating: number
) => {
  try {
    const dateModified = dayjs().toISOString();

    await Promise.all(
      fileIds.flatMap(async (id) => {
        await FileModel.updateOne({ _id: id }, { rating, dateModified });
        fileStore.getById(id).update({ rating });
      })
    );
  } catch (err) {
    console.error(err);
  }
};
