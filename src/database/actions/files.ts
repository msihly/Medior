import { promises as fs, constants as fsc } from "fs";
import md5File from "md5-file";
import sharp from "sharp";
import dayjs from "dayjs";
import { FileModel } from "database";
import { splitArray } from "utils";

export const copyFileTo = async (fileObj, targetDir, dbOnly = false) => {
  const { path: originalPath, name, extension: ext, size } = fileObj;

  const hash = await md5File(originalPath);
  const dirPath = `${targetDir}\\${hash.substring(0, 2)}\\${hash.substring(2, 4)}`;
  const extFromPath = originalPath.split(".").pop();
  const path = `${dirPath}\\${hash}.${extFromPath}`;
  const thumbPath = `${dirPath}\\${hash}-thumb.${extFromPath}`;
  const dateCreated = dayjs().toISOString();

  try {
    if (!dbOnly) {
      await fs.mkdir(dirPath, { recursive: true });
      await fs.copyFile(originalPath, path, fsc.COPYFILE_EXCL);
      await sharp(originalPath).resize(300, 300).toFile(thumbPath);
    }

    const file = (
      await FileModel.create({
        dateCreated,
        dateModified: dateCreated,
        ext,
        hash,
        isArchived: false,
        originalName: name,
        originalPath,
        path,
        size,
        tags: [],
        thumbPath,
      })
    ).toJSON();

    return { success: true, file, isDuplicate: false, isSelected: false };
  } catch (err) {
    if (err.code === "EEXIST") {
      const file = (await FileModel.findOne({ hash }))?.toJSON?.();
      if (!file) {
        console.log("File exists, but not in db. Inserting into db only...");
        const res = await copyFileTo(fileObj, targetDir, true);
        return res;
      }

      return { success: true, file, isDuplicate: true, isSelected: false };
    } else {
      console.error(err?.message ?? err);
      return { success: false, error: err?.message ?? err };
    }
  }
};

export const deleteFiles = async (fileStore, files, isUndelete = false) => {
  if (!files?.length) return false;

  try {
    if (isUndelete) {
      const fileIds = files.map((f) => f.id);
      await FileModel.updateMany({ _id: { $in: fileIds } }, { isArchived: false });
      fileStore.archiveFiles(fileIds, true);
      return true;
    }

    const [deleted, archived] = splitArray(files, (f) => f.isArchived);
    const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));
    const deletedPaths = deleted.map((f) => f.path);

    await Promise.all([
      archivedIds?.length > 0
        ? FileModel.updateMany({ _id: { $in: archivedIds } }, { isArchived: true })
        : true,
      deletedIds?.length > 0 ? FileModel.deleteMany({ _id: { $in: deletedIds } }) : true,
      deletedIds?.length > 0 ? deletedPaths.map((path) => fs.unlink(path)) : true,
    ]);

    fileStore.archiveFiles(archivedIds);
    fileStore.deleteFiles(deletedIds);

    return true;
  } catch (err) {
    console.error(err?.message ?? err);
    return false;
  }
};

export const editFileTags = async (fileStore, fileIds = [], addedTags = [], removedTags = []) => {
  if (!fileIds?.length || (!addedTags?.length && !removedTags?.length)) return false;

  try {
    const files = (await FileModel.find({ _id: { $in: fileIds } })).map((f) => {
      const file = f.toJSON();

      const tags = file.tags.filter((t) => !removedTags.includes(t));
      addedTags.forEach((t) => {
        if (!tags.includes(t)) tags.push(t);
      });

      return { ...file, tags };
    });

    const dateModified = dayjs().toISOString();

    files.forEach(async (f) => {
      await FileModel.updateOne({ _id: f.id }, { tags: f.tags, dateModified });
      fileStore.getById(f.id).updateTags(f.tags, dateModified);
    });

    return true;
  } catch (err) {
    console.error(err?.message ?? err);
    return false;
  }
};

export const getAllFiles = async () => {
  try {
    const files = (await FileModel.find()).map((r) => r.toJSON());
    return files;
  } catch (err) {
    console.error(err?.message ?? err);
    return [];
  }
};
