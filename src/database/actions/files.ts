import { promises as fs, constants as fsc } from "fs";
import path from "path";
import md5File from "md5-file";
import sharp from "sharp";
import dayjs from "dayjs";
import { File, FileModel } from "database";
import { generateFramesThumbnail, splitArray } from "utils";

const copyFile = async (dirPath, originalPath, newPath) => {
  await fs.mkdir(dirPath, { recursive: true });
  await fs.copyFile(originalPath, newPath, fsc.COPYFILE_EXCL);
  return true;
};

export const copyFileTo = async (fileObj, targetDir, dbOnly = false) => {
  const { dateCreated, extension: ext, name, path: originalPath, size, tagIds } = fileObj;

  const hash = await md5File(originalPath);
  const dirPath = `${targetDir}\\${hash.substring(0, 2)}\\${hash.substring(2, 4)}`;
  const extFromPath = originalPath.split(".").pop();
  const newPath = `${dirPath}\\${hash}.${extFromPath}`;
  const isAnimated = ["gif", "mp4", "mkv", "webm"].includes(extFromPath);

  try {
    const thumbPaths = isAnimated
      ? Array(9)
          .fill("")
          .map((_, i) => path.join(dirPath, `${hash}-thumb-${String(i + 1).padStart(2, "0")}.jpg`))
      : [path.join(dirPath, `${hash}-thumb.${extFromPath}`)];

    if (!dbOnly) {
      await Promise.all(
        [
          copyFile(dirPath, originalPath, newPath),
          isAnimated
            ? generateFramesThumbnail(originalPath, dirPath, hash)
            : sharp(originalPath).resize(300, 300).toFile(thumbPaths[0]),
        ].flat()
      );
    }

    const file = (
      await FileModel.create({
        dateCreated,
        dateModified: dayjs().toISOString(),
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
  } catch (err) {
    if (err.code === "EEXIST") {
      const file = (await FileModel.findOne({ hash }))?.toJSON?.();
      if (!file) {
        console.log("File exists, but not in db. Inserting into db only...");
        const res = await copyFileTo(fileObj, targetDir, true);
        return res;
      }

      return { success: true, file, isDuplicate: true };
    } else {
      console.error(err?.message ?? err);
      return { success: false, error: err?.message ?? err };
    }
  }
};

export const deleteFiles = async (fileStore, files, isUndelete = false) => {
  if (!files?.length) return false;

  try {
    const fileIds = files.map((f) => f.id);

    if (isUndelete) {
      await FileModel.updateMany({ _id: { $in: fileIds } }, { isArchived: false });
      fileStore.archiveFiles(fileIds, true);
      return true;
    }

    const [deleted, archived] = splitArray(files, (f) => f.isArchived);
    const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));

    const promises = [];
    if (archivedIds?.length > 0)
      promises.push(FileModel.updateMany({ _id: { $in: archivedIds } }, { isArchived: true }));
    if (deletedIds?.length > 0) {
      promises.push(FileModel.deleteMany({ _id: { $in: deletedIds } }));
      promises.push(
        deleted.flatMap((file) => [
          fs.unlink(file.path),
          ...file.thumbPaths.map((thumbPath) => fs.unlink(thumbPath)),
        ])
      );
    }
    await Promise.all(promises);

    fileStore.archiveFiles(archivedIds);
    fileStore.deleteFiles(deletedIds);
    fileStore.toggleFilesSelected(fileIds, false);

    return true;
  } catch (err) {
    console.error(err?.message ?? err);
    return false;
  }
};

export const editFileTags = async (
  fileStore,
  fileIds = [],
  addedTagIds = [],
  removedTagIds = []
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
    console.error(err?.message ?? err);
    return false;
  }
};

export const getAllFiles = async () => {
  try {
    const files = (await FileModel.find()).map((r) => r.toJSON() as File);
    return files;
  } catch (err) {
    console.error(err?.message ?? err);
    return [];
  }
};

export const setFileRating = async (fileStore, fileIds = [], rating) => {
  try {
    const dateModified = dayjs().toISOString();

    await Promise.all(
      fileIds.flatMap(async (id) => {
        await FileModel.updateOne({ _id: id }, { rating, dateModified });
        fileStore.getById(id).update({ rating });
      })
    );
  } catch (err) {
    console.error(err?.message ?? err);
  }
};
