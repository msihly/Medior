import { constants as fsc, promises as fs } from "fs";
import * as models from "medior/_generated/server/models";
import { ModelCreationData } from "mobx-keystone";
import * as actions from "medior/server/database/actions";
import * as Types from "medior/server/database/types";
import type { FileImport } from "medior/store";
import { FileImporter } from "medior/store/imports/importer";
import { dayjs, Fmt, sleep, sumArray } from "medior/utils/common";
import { makeAction } from "medior/utils/server";
import {
  checkFileExists,
  leanModelToJson,
  objectId,
  removeEmptyFolders,
  socket,
} from "medior/utils/server";

class ImporterStatus {
  private isImporting = false;
  private isPaused = false;

  getIsImporting() {
    return this.isImporting;
  }

  getIsPaused() {
    return this.isPaused;
  }

  setIsImporting(isImporting: boolean) {
    this.isImporting = isImporting;
    socket.emit("onImporterStatusUpdated");
  }

  setIsPaused(isPaused: boolean) {
    this.isPaused = isPaused;
    socket.emit("onImporterStatusUpdated");
  }
}

const importerStatus = new ImporterStatus();

export const checkFileImportHashes = makeAction(async (args: { hash: string }) => {
  const [deletedFileRes, fileRes] = await Promise.all([
    actions.getDeletedFile({ hash: args.hash }),
    actions.getFileByHash({ hash: args.hash }),
  ]);
  if (!fileRes.success) throw new Error(fileRes.error);
  return {
    file: fileRes.data,
    isDuplicate: !!fileRes.data,
    isPrevDeleted: !!deletedFileRes.data,
  };
});

export const completeImportBatch = makeAction(
  async (args: { id: string; withNextBatch: boolean }) => {
    const completedAt = dayjs().toISOString();

    const batch = (await getImportBatch({ id: args.id })).data;
    if (batch.imports.some((f) => f.status === "PENDING")) return null;

    const fileIds = batch.imports
      .filter((imp) => ["COMPLETED", "DUPLICATE"].includes(imp.status))
      .map((imp) => imp.fileId);

    const tagIds = [
      ...new Set([...batch.tagIds, ...batch.imports.flatMap((imp) => imp.tagIds)].flat()),
    ];

    let collectionId: string = null;
    if (fileIds.length && batch.collectionTitle) {
      const fileIdIndexes = fileIds.map((fileId, index) => ({ fileId, index }));
      const res = await actions.createCollection({ fileIdIndexes, title: batch.collectionTitle });
      if (!res.success) throw new Error(`Failed to create collection: ${res.error}`);
      collectionId = res.data.id;
    }

    await Promise.all([
      models.FileImportBatchModel.updateOne(
        { _id: args.id },
        { collectionId, completedAt, isCompleted: true },
      ),
      tagIds.length && actions.regenFileTagAncestors({ fileIds }),
      tagIds.length && actions.recalculateTagCounts({ tagIds }),
      ...tagIds.map((tagId) => actions.regenTagThumbPaths({ tagId })),
    ]);

    socket.emit("onImportBatchCompleted", { id: args.id });

    if (batch.deleteOnImport) {
      try {
        const res = await actions.listFileImportBatch({
          args: { filter: { rootFolderPath: batch.rootFolderPath } },
        });
        if (!res.success) throw new Error(res.error);
        if (res.data.items.length > 0) {
          await removeEmptyFolders(batch.rootFolderPath);
          console.debug(`Removed empty folders: ${batch.rootFolderPath}`);
        }
      } catch (err) {
        console.error("Error removing empty folders:", err);
      }
    }

    importerStatus.setIsImporting(false);
    if (args.withNextBatch) {
      const nextBatch = (await getNextImportBatch(null)).data;
      if (nextBatch) runImportBatch({ id: nextBatch.id });
    }

    return completedAt;
  },
);

export const copyFile = makeAction(
  async (args: { dirPath: string; originalPath: string; newPath: string }) => {
    socket.emit("onFileImportStarted", { filePath: args.originalPath });

    if (await checkFileExists(args.newPath)) return false;
    await fs.mkdir(args.dirPath, { recursive: true });

    await fs.copyFile(args.originalPath, args.newPath, fsc.COPYFILE_EXCL);
    return true;
  },
);

export const createImportBatches = makeAction(
  async (
    batches: {
      collectionTitle?: string;
      deleteOnImport: boolean;
      ignorePrevDeleted: boolean;
      imports: ModelCreationData<FileImport>[];
      remux: boolean;
      rootFolderPath: string;
      tagIds?: string[];
    }[],
  ) => {
    const res = await models.FileImportBatchModel.insertMany(
      batches.map((batch) => ({
        ...batch,
        completedAt: null,
        dateCreated: dayjs().toISOString(),
        fileCount: batch.imports.length,
        isCompleted: false,
        size: sumArray(batch.imports, (imp) => imp.size),
        startedAt: null,
        tagIds: batch.tagIds ? [...new Set(batch.tagIds)].flat() : [],
      })),
    );

    if (res.length !== batches.length) throw new Error("Failed to create import batches");
    return res;
  },
);

export const deleteImportBatches = makeAction(
  async (args: { ids: string[] }) =>
    await models.FileImportBatchModel.deleteMany({ _id: { $in: args.ids } }),
);

export const getImportBatch = makeAction(async (args: { id: string }) => {
  return leanModelToJson<models.FileImportBatchSchema>(
    await models.FileImportBatchModel.findById(args.id).lean(),
  );
});

export const getNextImportBatch = makeAction(async () => {
  return leanModelToJson<models.FileImportBatchSchema>(
    await models.FileImportBatchModel.findOne({ isCompleted: false })
      .sort({ startedAt: -1, dateCreated: 1 })
      .lean(),
  );
});

export const pauseImporter = makeAction(async () => {
  importerStatus.setIsPaused(true);
});

export const resumeImporter = makeAction(async () => {
  importerStatus.setIsPaused(false);
});

export const getImporterStatus = makeAction(async () => {
  return { isPaused: importerStatus.getIsPaused(), isImporting: importerStatus.getIsImporting() };
});

export const reingestFolder = makeAction(
  async (args: {
    collectionTitle?: string;
    fileTagIds: { fileId: string; tagIds: string[] }[];
  }) => {
    if (!args.fileTagIds.length) throw new Error("No fileTagIds passed");
    const dateModified = dayjs().toISOString();

    const bulkRes = await models.FileModel.bulkWrite(
      args.fileTagIds.map((f) => ({
        updateMany: {
          filter: { _id: objectId(f.fileId) },
          update: { $addToSet: { tagIds: { $each: f.tagIds } }, dateModified },
        },
      })),
    );
    if (!bulkRes.matchedCount || bulkRes.matchedCount !== bulkRes.modifiedCount)
      throw new Error(`Failed to update file tagIds: ${Fmt.jstr({ args, bulkRes })}`);

    const tagIds = [...new Set(args.fileTagIds.flatMap((f) => f.tagIds))];
    if (tagIds.length) {
      const fileIds = args.fileTagIds.flatMap((f) => f.fileId);
      await actions.regenFileTagAncestors({ fileIds });
      await actions.recalculateTagCounts({ tagIds });
      await Promise.all(tagIds.map((tagId) => actions.regenTagThumbPaths({ tagId })));
    }

    if (args.collectionTitle) {
      const collRes = await actions.createCollection({
        fileIdIndexes: args.fileTagIds.map((f, i) => ({ fileId: f.fileId, index: i })),
        title: args.collectionTitle,
        withSub: false,
      });
      if (!collRes.success) throw new Error(collRes.error);
    }

    socket.emit("onReloadFiles");
  },
);

export const runImportBatch = makeAction(async (args: { id: string }) => {
  if (importerStatus.getIsImporting()) return;

  const batch = (await getImportBatch({ id: args.id })).data;
  if (!batch) throw new Error(`Import batch not found: ${args.id}`);
  if (batch.isCompleted) throw new Error(`Import batch is completed: ${args.id}`);
  if (!batch?.startedAt) await startImportBatch({ id: args.id });

  importerStatus.setIsPaused(false);
  importerStatus.setIsImporting(true);
  socket.emit("onImportBatchLoaded", { id: args.id });

  const pendingImports = batch.imports.filter((imp) => imp.status === "PENDING");

  let withNextBatch = true;
  for (const fileImport of pendingImports) {
    try {
      while (importerStatus.getIsPaused() && importerStatus.getIsImporting()) await sleep(100);

      const importer = new FileImporter({
        dateCreated: fileImport.dateCreated,
        deleteOnImport: batch.deleteOnImport,
        ext: fileImport.extension,
        ignorePrevDeleted: batch.ignorePrevDeleted,
        originalName: fileImport.name,
        originalPath: fileImport.path,
        size: fileImport.size,
        tagIds: [...new Set([...batch.tagIds, ...fileImport.tagIds].flat())],
        withRemux: batch.remux,
      });

      const copyRes = await importer.import();

      const updateRes = await updateFileImportByPath({
        batchId: batch.id,
        errorMsg: copyRes.error ?? null,
        fileId: copyRes.file?.id ?? null,
        filePath: fileImport.path,
        hash: copyRes.file?.hash ?? null,
        status: copyRes.status,
        thumb: copyRes.file?.thumb ?? null,
      });
      if (!updateRes?.success) throw new Error(updateRes?.error);
    } catch (err) {
      console.error("Error importing file:", err);
      const storageMsg = "No available file storage location found";
      if (err.message.includes(storageMsg)) {
        withNextBatch = false;
        break;
      }
    }
  }

  const updatedBatch = (await getImportBatch({ id: args.id })).data;
  const addedTagIds = [...updatedBatch.tagIds].flat();
  const duplicateFileIds = updatedBatch.imports
    .filter((file) => file.status === "DUPLICATE")
    .map((file) => file.fileId);

  if (addedTagIds.length && duplicateFileIds.length) {
    try {
      const res = await actions.editFileTags({
        fileIds: duplicateFileIds,
        addedTagIds,
        withSub: false,
      });
      if (!res.success) throw new Error(res.error);
    } catch (err) {
      console.error("Error adding tags to duplicate files:", err);
    }
  }

  await completeImportBatch({ id: args.id, withNextBatch });
});

export const startImportBatch = makeAction(async (args: { id: string }) => {
  const startedAt = dayjs().toISOString();
  await models.FileImportBatchModel.updateOne({ _id: args.id }, { startedAt });
  return startedAt;
});

export const updateFileImportByPath = makeAction(
  async (args: {
    batchId: string;
    errorMsg?: string;
    fileId?: string;
    filePath: string;
    hash?: string;
    status?: Types.ImportStatus;
    thumb?: models.FileImportBatchSchema["imports"][number]["thumb"];
  }) => {
    const res = await models.FileImportBatchModel.updateOne(
      { _id: args.batchId },
      {
        $set: {
          "imports.$[fileImport].errorMsg": args.errorMsg,
          "imports.$[fileImport].fileId": args.fileId,
          "imports.$[fileImport].hash": args.hash,
          "imports.$[fileImport].status": args.status,
          "imports.$[fileImport].thumb": args.thumb,
        },
      },
      { arrayFilters: [{ "fileImport.path": args.filePath }] },
    );

    if (res?.matchedCount !== res?.modifiedCount)
      throw new Error("Failed to update file import by path");

    socket.emit("onFileImportUpdated", args);
  },
);
