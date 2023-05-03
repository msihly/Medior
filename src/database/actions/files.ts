import { ipcRenderer } from "electron";
import { promises as fs, constants as fsc } from "fs";
import path from "path";
import md5File from "md5-file";
import {
  File,
  FileImportBatchModel,
  FileInfoRefreshQueue,
  FileModel,
  refreshAllTagCounts,
} from "database";
import {
  FileImport,
  FileStore,
  ImportStore,
  RootStore,
  TagOption,
  sortFiles,
  tagsToDescendants,
} from "store";
import {
  CONSTANTS,
  dayjs,
  generateFramesThumbnail,
  getVideoInfo,
  round,
  splitArray,
  VIDEO_TYPES,
} from "utils";
import { toast } from "react-toastify";

const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

const copyFile = async (dirPath: string, originalPath: string, newPath: string) => {
  if (await checkFileExists(newPath)) return false;
  await fs.mkdir(dirPath, { recursive: true });
  await fs.copyFile(originalPath, newPath, fsc.COPYFILE_EXCL);
  return true;
};

const deleteFile = async (path: string, copiedPath?: string) => {
  try {
    if (!(await checkFileExists(path)))
      throw new Error(`Failed to delete ${path}. File does not exist.`);
    if (copiedPath && !(await checkFileExists(copiedPath)))
      throw new Error(
        `Failed to delete ${path}. File does not exist at copied path ${copiedPath}.`
      );

    await fs.unlink(path);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

interface CopyFileToProps {
  dbOnly?: boolean;
  fileObj: FileImport;
  importStore: ImportStore;
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
  fileObj,
  importStore,
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
          // prettier-ignore
          await(
            duration > 0
              ? generateFramesThumbnail(originalPath, dirPath, hash, duration)
              : sharp(originalPath).resize(null, 300).toFile(thumbPaths[0])
          );
    }

    let file = await getFileByHash(hash);

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

      if (importStore.deleteOnImport) await deleteFile(originalPath, newPath);
      return { success: true, file, isDuplicate: false };
    } else {
      if (importStore.deleteOnImport) await deleteFile(originalPath, newPath);
      return { success: true, file, isDuplicate: true };
    }
  } catch (err) {
    console.log("Error importing", fileObj.toString({ withData: true }), ":", err);

    if (err.code === "EEXIST") {
      const file = await getFileByHash(hash);

      if (!file) {
        console.log("File exists, but not in db. Inserting into db only...", {
          dateCreated,
          dirPath,
          duration,
          ext,
          extFromPath,
          frameRate,
          hash,
          height,
          isAnimated,
          name,
          newPath,
          originalPath,
          size,
          tagIds,
          width,
        });

        return await copyFileTo({ fileObj, importStore, targetDir, dbOnly: true });
      }

      return { success: true, file, isDuplicate: true };
    } else {
      return { success: false, error: err?.message };
    }
  }
};

export const deleteFiles = async (rootStore: RootStore, files: File[], isUndelete = false) => {
  if (!files?.length) return false;

  try {
    if (isUndelete) {
      await FileModel.updateMany({ _id: { $in: files.map((f) => f.id) } }, { isArchived: false });
      toast.success(`${files.length} files unarchived`);
    } else {
      const [deleted, archived] = splitArray(files, (f: File) => f.isArchived);
      const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));

      if (archivedIds?.length > 0) {
        await FileModel.updateMany({ _id: { $in: archivedIds } }, { isArchived: true });
        toast.success(`${archivedIds.length} files archived`);
      }

      if (deletedIds?.length > 0) {
        await FileModel.deleteMany({ _id: { $in: deletedIds } });
        await Promise.all(
          deleted.flatMap((file) =>
            rootStore.fileStore.listByHash(file.hash).length === 1
              ? [fs.unlink(file.path), ...file.thumbPaths.map((thumbPath) => fs.unlink(thumbPath))]
              : []
          )
        );
        toast.success(`${deletedIds.length} files deleted`);
      }
    }

    rootStore.fileStore.toggleFilesSelected(files.map((f) => ({ id: f.id, isSelected: false })));

    await reloadDisplayedFiles(rootStore);
    await refreshAllTagCounts(rootStore, true);

    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const editFileTags = async ({
  addedTagIds = [],
  batchId,
  fileIds,
  rootStore,
  removedTagIds = [],
}: {
  addedTagIds?: string[];
  batchId?: string;
  fileIds: string[];
  removedTagIds?: string[];
  rootStore: RootStore;
}) => {
  try {
    if (!fileIds?.length || (!addedTagIds?.length && !removedTagIds?.length)) return false;

    const { importStore } = rootStore;
    const dateModified = dayjs().toISOString();

    if (removedTagIds?.length > 0) {
      if (batchId?.length > 0)
        await FileImportBatchModel.updateOne(
          { _id: batchId },
          { $pullAll: { tagIds: removedTagIds } }
        );

      await FileModel.updateMany(
        { _id: { $in: fileIds } },
        { $pullAll: { tagIds: removedTagIds }, dateModified }
      );
    }

    if (addedTagIds?.length > 0) {
      if (batchId?.length > 0)
        await FileImportBatchModel.updateOne(
          { _id: batchId },
          { $addToSet: { tagIds: { $each: addedTagIds } } }
        );

      await FileModel.updateMany(
        { _id: { $in: fileIds } },
        { $addToSet: { tagIds: { $each: addedTagIds } }, dateModified }
      );
    }

    importStore.editBatchTags({
      addedIds: addedTagIds,
      batchIds: [batchId],
      removedIds: removedTagIds,
    });

    await reloadDisplayedFiles(rootStore);
    await refreshAllTagCounts(rootStore, true);

    toast.success(`${fileIds.length} files updated`);

    ipcRenderer.send("onFilesEdited", { fileIds });
    return true;
  } catch (err) {
    console.error(err);
    return false;
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

export const getFileByHash = async (hash: string) => {
  try {
    const file = (await FileModel.findOne({ hash }))?.toJSON?.() as File;
    return file;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const getFiles = async (ids: string[]) => {
  try {
    const files = (await FileModel.find({ _id: { $in: ids } })).map((r) => r.toJSON() as File);
    return files;
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const refreshFile = async (fileStore: FileStore, id: string, withThumbs = false) => {
  try {
    const file = fileStore.getById(id);
    const sharp = !file.isAnimated ? (await import("sharp")).default : null;

    const [hash, { mtime, size }, imageInfo, videoInfo] = await Promise.all([
      md5File(file.path),
      fs.stat(file.path),
      !file.isAnimated ? sharp(file.path).metadata() : null,
      file.isAnimated ? getVideoInfo(file.path) : null,
    ]);

    const updates = {
      dateModified: dayjs(mtime).isAfter(file.dateModified)
        ? mtime.toISOString()
        : file.dateModified,
      duration: file.isAnimated ? videoInfo?.duration : file.duration,
      frameRate: file.isAnimated ? videoInfo?.frameRate : file.frameRate,
      hash,
      height: file.isAnimated ? videoInfo?.height : imageInfo?.height,
      originalHash: file.originalHash ?? hash,
      size,
      width: file.isAnimated ? videoInfo?.width : imageInfo?.width,
    };

    if (withThumbs) {
      const dirPath = path.dirname(file.path);

      const thumbPaths = file.isAnimated
        ? Array(9)
            .fill("")
            .map((_, i) =>
              path.join(dirPath, `${hash}-thumb-${String(i + 1).padStart(2, "0")}.jpg`)
            )
        : [path.join(dirPath, `${hash}-thumb${file.ext}`)];

      await (file.isAnimated
        ? generateFramesThumbnail(file.path, dirPath, hash, videoInfo?.duration)
        : sharp(file.path).resize(null, 300).toFile(thumbPaths[0]));

      updates["thumbPaths"] = thumbPaths;
    }

    await FileModel.updateOne({ _id: id }, updates);
    file.update(updates);

    return updates;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const refreshSelectedFiles = async (fileStore: FileStore) => {
  try {
    let completedCount = 0;
    const totalCount = fileStore.selected.length;

    const toastId = toast.info(() => `Refreshed ${completedCount} files' info...`, {
      autoClose: false,
    });

    fileStore.selected.map((f, _, files) =>
      FileInfoRefreshQueue.add(async () => {
        await refreshFile(fileStore, f.id);

        completedCount++;
        const isComplete = completedCount === totalCount;

        if (isComplete) ipcRenderer.send("onFilesEdited", { fileIds: files.map((f) => f.id) });

        toast.update(toastId, {
          autoClose: isComplete ? 5000 : false,
          render: `Refreshed ${completedCount} files${isComplete ? "." : "..."}`,
        });
      })
    );
  } catch (err) {
    console.error(err);
    return null;
  }
};

type ReloadDisplayedFilesOptions = {
  page?: number;
  withAppend?: boolean;
  withOverwrite?: boolean;
};

export const reloadDisplayedFiles = async (
  rootStore: RootStore,
  { page, withAppend = true, withOverwrite = false }: ReloadDisplayedFilesOptions = {}
) => {
  const logTag = "[Reload Displayed Files]";
  const funcPerfStart = performance.now();

  let perfStart = performance.now();
  const perfLog = (str: string) => {
    console.debug(logTag, round(performance.now() - perfStart, 0), "ms.", str);
    perfStart = performance.now();
  };

  try {
    const { fileStore, homeStore, tagStore } = rootStore;

    const tagsToIds = (tags: TagOption[]) => {
      const tagIds = tags.map((t) => t.id);
      const tagIdsWithDesc = [
        ...tagIds,
        ...(homeStore.includeDescendants
          ? tagsToDescendants(tagStore, tagStore.listByIds(tagIds))
          : []),
      ];
      return [tagIds, tagIdsWithDesc];
    };

    const [excludedAnyTagIds, excludedAnyTagIdsDesc] = tagsToIds(homeStore.excludedAnyTags);
    const [includedAllTagIds] = tagsToIds(homeStore.includedAllTags);
    const [includedAnyTagIds, includedAnyTagIdsDesc] = tagsToIds(homeStore.includedAnyTags);

    const enabledExts = Object.entries({
      ...homeStore.selectedImageTypes,
      ...homeStore.selectedVideoTypes,
    }).reduce((acc, [key, isEnabled]) => {
      if (isEnabled) acc.push(`.${key}`);
      return acc;
    }, [] as string[]);

    const files = (
      await FileModel.find({
        isArchived: homeStore.isArchiveOpen,
        ext: { $in: enabledExts },
        ...(homeStore.includeTagged
          ? { tagIds: { $ne: [] } }
          : homeStore.includeUntagged
          ? { tagIds: { $eq: [] } }
          : {}),
      })
    ).map((r) => r.toJSON() as File);

    perfLog("Mongo find"); // DEBUG

    const filtered = files
      .filter((f) => {
        const hasExcludedAny =
          excludedAnyTagIds.length > 0
            ? f.tagIds.length > 0 && f.tagIds.some((tagId) => excludedAnyTagIdsDesc.includes(tagId))
            : false;

        const hasIncludedAll =
          includedAllTagIds.length > 0
            ? f.tagIds.length > 0 && includedAllTagIds.every((tagId) => f.tagIds.includes(tagId))
            : true;

        const hasIncludedAny =
          includedAnyTagIds.length > 0
            ? f.tagIds.length > 0 && f.tagIds.some((tagId) => includedAnyTagIdsDesc.includes(tagId))
            : true;

        return hasIncludedAll && hasIncludedAny && !hasExcludedAny;
      })
      .sort((a, b) =>
        sortFiles({ a, b, isSortDesc: homeStore.isSortDesc, sortKey: homeStore.sortKey })
      );

    perfLog("Filtering and sorting"); // DEBUG

    if (withOverwrite) fileStore.overwrite(filtered);
    else if (withAppend) fileStore.appendFiltered(filtered, page);
    if (page) fileStore.setPage(page);

    perfLog(`${withOverwrite ? "Overwite" : "Append"}${page ? " and set page" : ""}`); // DEBUG

    const filteredIds = filtered.map((f) => f.id);
    const deselectedIds = fileStore.selectedIds.reduce((acc, cur) => {
      if (!filteredIds.includes(cur)) acc.push({ id: cur, isSelected: false });
      return acc;
    }, [] as { id: string; isSelected: boolean }[]);

    fileStore.toggleFilesSelected(deselectedIds);

    perfLog("File deselection"); // DEBUG

    const displayed = files.slice(
      ((page ?? fileStore.page) - 1) * CONSTANTS.FILE_COUNT,
      (page ?? fileStore.page) * CONSTANTS.FILE_COUNT
    );

    console.debug(
      `Loaded ${displayed.length} displayed files in ${performance.now() - funcPerfStart}ms.`
    );
  } catch (err) {
    console.error(err);
  }
};

export const setFileRating = async ({
  fileIds = [],
  rating,
  rootStore,
}: {
  fileIds: string[];
  rating: number;
  rootStore: RootStore;
}) => {
  try {
    if (!fileIds.length) return;
    const dateModified = dayjs().toISOString();
    await FileModel.updateMany({ _id: { $in: fileIds } }, { rating, dateModified });

    ipcRenderer.send("onFilesEdited", { fileIds });
    await reloadDisplayedFiles(rootStore);
  } catch (err) {
    console.error(err);
  }
};
