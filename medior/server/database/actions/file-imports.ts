import { promises as fs } from "fs";
import { createHash } from "crypto";
import * as models from "medior/_generated/server/models";
import { checkFileExists, dirToFilePaths, fileLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import {
  backgroundExecution,
  cancelBackgroundExecutions,
  runBackgroundExecution,
} from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";
import {
  assertMediaPathIndexesReady,
  describeFileCleanup,
  FileOperationModel,
  finishFileOperation,
} from "medior/server/database/file-operations";
import { getImportSourceFolder, runImportTransaction } from "medior/server/database/import-entries";
import {
  areImportEntriesReady,
  assertImportEntriesReady,
} from "medior/server/database/import-entry-state";
import {
  importBatchFile,
  importMedia,
  MediaImportInput,
} from "medior/server/database/media-import";
import { metadataWriteOptions, registerMetadataWork } from "medior/server/database/metadata-work";
import * as Types from "medior/server/database/types";
import { isServerStopping } from "medior/server/process-lifecycle";
import {
  dayjs,
  Fmt,
  IMPORT_PAGE_SIZE,
  IMPORT_UPLOAD_BYTES,
  IMPORT_UPLOAD_COUNT,
  ImportBatchOptions,
  ImportEntryInput,
  sumArray,
} from "medior/utils/common";
import { getIsImage, leanModelToJson, makeAction, objectId, socket } from "medior/utils/server";
import { copyMediaFile } from "medior/utils/server/media-output";
import { getCommonSourceFolder } from "medior/utils/server/source-folders";
import { runConcurrent } from "medior/utils/server/work-signal";

class ImporterStatus {
  activeBatchId: string = null;
  private isImporting = false;
  private isPaused = true;

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

  tryRun() {
    if (this.isImporting) return false;

    this.isImporting = true;
    socket.emit("onImporterStatusUpdated");

    return true;
  }
}

const importerStatus = new ImporterStatus();
const COLLECTION_IMPORT_STATUSES = ["COMPLETE", "DUPLICATE"] satisfies Types.ImportStatus[];

export const checkFileImportHashes = makeAction(async (args: { hash: string }) => {
  const deletedFileRes = await actions.getDeletedFile({ hash: args.hash });

  if (!deletedFileRes.success) throw new Error(deletedFileRes.error);

  const fileRes = await actions.getFileByHash({ hash: args.hash });

  if (!fileRes.success) throw new Error(fileRes.error);

  return {
    file: fileRes.data,
    isDuplicate: !!fileRes.data,
    isPrevDeleted: !!deletedFileRes.data,
  };
});

export const completeImportBatch = makeAction(
  registerMetadataWork(
    "completeImportBatch",
    async (args: { id: string; withNextBatch: boolean }) => {
      const completedAt = dayjs().toISOString();

      const batch = (await getImportBatch({ id: args.id })).data;

      if (!batch) throw new Error("Import batch is unavailable");

      if (batch.isCompleted) return batch.completedAt;

      if (
        !batch.isReady ||
        (await models.FileImportModel.exists({ batchId: args.id, status: "PENDING" }))
      )
        throw new Error("Failed to complete batch (upload or imports pending)");

      const fileIds: string[] = [];

      if (batch.collectionTitle) {
        if (
          await models.FileImportModel.exists({
            batchId: args.id,
            fileId: null,
            status: { $in: COLLECTION_IMPORT_STATUSES },
          })
        )
          throw new Error(
            "Failed to complete batch collection (completed imports missing file ids)",
          );

        for await (const entry of models.FileImportModel.aggregate<{ _id: string }>([
          { $match: { batchId: objectId(args.id), status: { $in: COLLECTION_IMPORT_STATUSES } } },
          { $group: { _id: "$fileId", index: { $min: "$index" } } },
          { $sort: { index: 1 } },
        ])
          .allowDiskUse(true)
          .cursor({ batchSize: 1000 })) {
          fileIds.push(String(entry._id));
        }
      }

      let collectionId: string = null;

      if (batch.collectionTitle && fileIds.length) {
        const fileIdIndexes = fileIds.map((fileId, index) => ({ fileId, index }));

        const sourceFolderPath =
          batch.collectionSourceFolderPath ??
          (await getImportSourceFolder([batch.id], COLLECTION_IMPORT_STATUSES));

        const res = sourceFolderPath
          ? await actions.upsertImportedCollection({
              fileIdIndexes,
              sourceFolderPath,
              title: batch.collectionTitle,
            })
          : await actions.createCollection({
              fileIdIndexes,
              id: batch.collectionId ?? batch.id,
              title: batch.collectionTitle,
            });

        if (!res.success) throw new Error(`Failed to create collection: ${res.error}`);

        const collectionFileIds = new Set(
          res.data.fileIdIndexes.map((entry) => entry.fileId.toString()),
        );

        if (!fileIds.every((fileId) => collectionFileIds.has(fileId))) {
          fileLog({ args, batch, collection: res.data, fileIdIndexes }, { type: "error" });

          throw new Error("Failed to create collection with all completed or duplicate file ids");
        }

        collectionId = res.data.id;
      }

      let lastIndex = -1;

      while (true) {
        const entries = await models.FileImportModel.find({
          batchId: args.id,
          index: { $gt: lastIndex },
        })
          .select({ fileId: 1, index: 1, status: 1, tagIds: 1 })
          .sort({ index: 1 })
          .limit(1000)
          .lean();

        if (!entries.length) break;

        const duplicateFileIds = [
          ...new Set(
            entries
              .filter((entry) => entry.status === "DUPLICATE" && entry.fileId)
              .map((entry) => String(entry.fileId)),
          ),
        ];
        const tagIds = [...new Set(entries.flatMap((entry) => entry.tagIds ?? []).map(String))];

        if (duplicateFileIds.length && batch.tagIds?.length) {
          const result = await actions.editFileTags({
            addedTagIds: batch.tagIds,
            fileIds: duplicateFileIds,
            withRegen: false,
            withSub: false,
          });

          if (!result.success)
            throw new Error(`Failed to update duplicate file tags: ${result.error}`);
        }

        if (tagIds.length) await actions.queueTagMetadataRegen(tagIds);

        if (duplicateFileIds.length) {
          const result = await actions.regenCollAttrs({ fileIds: duplicateFileIds });

          if (!result.success) throw new Error(result.error);
        }

        lastIndex = entries.at(-1).index;
      }

      if (batch.tagIds.length) await actions.queueTagMetadataRegen(batch.tagIds);

      if (batch.deleteOnImport) {
        try {
          const hasOtherBatches = await models.FileImportBatchModel.exists({
            _id: { $ne: args.id },
            isCompleted: false,
            rootFolderPath: batch.rootFolderPath,
          });

          if (!hasOtherBatches) {
            const sidecars = await dirToFilePaths(batch.rootFolderPath, (p) =>
              p.endsWith("[[Collection]].json"),
            );

            const cleanup = [];

            for (const sidecar of sidecars) {
              const file = await describeFileCleanup(sidecar);

              if (file) cleanup.push(file);
            }

            await FileOperationModel.updateOne(
              { _id: `import-batch:${args.id}` },
              {
                $setOnInsert: {
                  cleanup,
                  emptyFolderPath: batch.rootFolderPath,
                  state: "COMMITTED",
                },
              },
              { ...metadataWriteOptions(), upsert: true },
            );

            actions.runFileCleanupQueue();
          }
        } catch (err) {
          if (err.code !== "ENOENT") throw err;
        }
      }

      await models.FileImportBatchModel.updateOne(
        { _id: args.id },
        { collectionId, completedAt, isCompleted: true },
        metadataWriteOptions(),
      );

      socket.emit("onImportBatchCompleted", { id: args.id });

      if (args.withNextBatch) {
        const nextBatch = (await getNextImportBatch(null)).data;

        if (nextBatch) runImportBatch({ id: nextBatch.id });
      }

      return completedAt;
    },
  ),
);

export const copyFile = makeAction(
  async (args: { dirPath: string; newPath: string; originalPath: string }) => {
    if (await checkFileExists(args.newPath)) return false;

    await fs.mkdir(args.dirPath, { recursive: true });

    await copyMediaFile(args.originalPath, args.newPath, true);

    return true;
  },
);

export const beginImportBatchUpload = makeAction(
  async (args: ImportBatchOptions & { id: string }) => {
    const tagIds = [...new Set(args.tagIds ?? [])];
    const ancestorMap = tagIds.length
      ? await actions.makeAncestorIdsMap(tagIds)
      : new Map<string, string[]>();

    const { id, ...options } = args;

    await models.FileImportBatchModel.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          ...options,
          completedAt: null,
          dateCreated: dayjs().toISOString(),
          fileCount: 0,
          isCompleted: false,
          isReady: false,
          processedCount: 0,
          processedSize: 0,
          progressRevision: 0,
          size: 0,
          startedAt: null,
          tagIds,
          tagIdsWithAncestors: [
            ...new Set(tagIds.flatMap((tagId) => ancestorMap.get(tagId) ?? [])),
          ],
        },
      },
      { ...metadataWriteOptions(), upsert: true },
    );

    socket.emit("onReloadImportBatches");

    return { id };
  },
);

export const appendImportBatchEntries = makeAction(
  async (args: { id: string; imports: ImportEntryInput[]; offset: number }) => {
    if (
      !Number.isSafeInteger(args.offset) ||
      args.offset < 0 ||
      !args.imports.length ||
      args.imports.length > IMPORT_UPLOAD_COUNT
    )
      throw new Error("Invalid import upload chunk");

    const imports = args.imports.map((entry) => ({
      dateCreated: entry.dateCreated,
      diffusionParams: entry.diffusionParams,
      extension: entry.extension,
      name: entry.name,
      path: entry.path,
      size: entry.size,
      tagIds: [...new Set(entry.tagIds ?? [])],
    }));
    const payload = JSON.stringify(imports);

    if (Buffer.byteLength(payload, "utf8") > IMPORT_UPLOAD_BYTES)
      throw new Error("Import upload chunk exceeds the size limit");

    for (const entry of imports) {
      if (
        !entry.path ||
        !entry.name ||
        !entry.extension ||
        !Number.isFinite(entry.size) ||
        entry.size < 0
      )
        throw new Error("Invalid file in import upload");
    }

    const hash = createHash("sha256").update(payload).digest("hex");

    return runImportTransaction(async () => {
      const batch = await models.FileImportBatchModel.findById(args.id).lean();

      if (!batch || batch.isReady) throw new Error("Import batch is unavailable for upload");

      if (batch.lastUploadOffset === args.offset && batch.lastUploadHash === hash) {
        return { count: batch.fileCount };
      } else {
        if (batch.fileCount !== args.offset)
          throw new Error("Import chunks must be uploaded in order");

        await models.FileImportModel.insertMany(
          imports.map((entry, index) => ({
            ...entry,
            batchId: args.id,
            index: args.offset + index,
            status: "PENDING",
          })),
          { session: getBackgroundSession() },
        );

        const folder = getCommonSourceFolder(imports.map((entry) => entry.path));
        const sourceFolderPath = !args.offset
          ? folder
          : batch.sourceFolderPath && folder
            ? getCommonSourceFolder([batch.sourceFolderPath, folder], true)
            : null;

        await models.FileImportBatchModel.updateOne(
          { _id: args.id },
          {
            $inc: { fileCount: imports.length, size: sumArray(imports, (entry) => entry.size) },
            $set: { lastUploadHash: hash, lastUploadOffset: args.offset, sourceFolderPath },
          },
        );

        return { count: args.offset + imports.length };
      }
    });
  },
);

export const finishImportBatchUpload = makeAction(async (args: { count: number; id: string }) => {
  if (!Number.isSafeInteger(args.count) || args.count < 1) throw new Error("Import batch is empty");

  const result = await models.FileImportBatchModel.updateOne(
    { _id: args.id, fileCount: args.count },
    { $set: { isReady: true }, $unset: { lastUploadHash: "", lastUploadOffset: "" } },
    metadataWriteOptions(),
  );

  if (!result.matchedCount) throw new Error("Import upload is incomplete or unavailable");

  socket.emit("onReloadImportBatches");

  return { count: args.count, id: args.id };
});

export const discardImportBatchUpload = makeAction(
  registerMetadataWork("discardImportBatchUpload", async (args: { id: string }) => {
    const removed = await models.FileImportBatchModel.findOneAndDelete({
      _id: args.id,
      isReady: false,
    });

    if (!removed && (await models.FileImportBatchModel.exists({ _id: args.id }))) {
      return false;
    } else {
      await models.FileImportModel.deleteMany({ batchId: args.id });
      socket.emit("onReloadImportBatches");

      return true;
    }
  }),
);

export const getImportBatchEntries = makeAction(async (args: { id: string; page: number }) => {
  if (!Number.isSafeInteger(args.page) || args.page < 1) throw new Error("Invalid import page");

  const offset = (args.page - 1) * IMPORT_PAGE_SIZE;
  const entries = await models.FileImportModel.find({
    batchId: args.id,
    index: { $gte: offset, $lt: offset + IMPORT_PAGE_SIZE },
  })
    .sort({ index: 1 })
    .lean();

  return entries.map(leanModelToJson<models.FileImportSchema>);
});

export const deleteImportBatches = makeAction(
  registerMetadataWork(
    "deleteImportBatches",
    async (args: { ids: string[] }) => {
      await assertImportEntriesReady();
      await stopImporter();

      for await (const operation of FileOperationModel.find({
        batchId: { $in: args.ids },
        importResult: { $exists: false },
        state: "PREPARED",
      })
        .lean()
        .cursor({ batchSize: 100 })) {
        const cleanup = [...operation.cleanup];

        for (const path of [operation.outputPath, operation.thumbPath]) {
          if (!path || path === operation.sourcePath) continue;

          const file = await describeFileCleanup(path);

          if (file) cleanup.push(file);
        }

        await FileOperationModel.updateOne(
          { _id: operation._id, state: "PREPARED" },
          { cleanup, state: "COMMITTED" },
        );

        finishFileOperation(operation._id).catch(console.error);
      }

      const result = await models.FileImportBatchModel.deleteMany({ _id: { $in: args.ids } });

      await models.FileImportModel.deleteMany({ batchId: { $in: args.ids } });

      return result;
    },
    true,
  ),
);

export const getImportBatch = makeAction(async (args: { id: string }) => {
  return leanModelToJson<models.FileImportBatchSchema>(
    await models.FileImportBatchModel.findById(args.id).lean(),
  );
});

export const getNextImportBatch = makeAction(async () => {
  return leanModelToJson<models.FileImportBatchSchema>(
    await models.FileImportBatchModel.findOne({
      ...(importerStatus.getIsImporting() && importerStatus.activeBatchId
        ? { _id: importerStatus.activeBatchId }
        : {}),
      isCompleted: false,
      isReady: true,
    })
      .sort({ startedAt: -1, dateCreated: 1 })
      .lean(),
  );
});

export const pauseImporter = makeAction(async () => stopImporter());

export const resumeImporter = makeAction(async () => {
  if (activeImportExecution) {
    await stopImporter();
    await activeImportExecution;
  }

  const batch = await getNextImportBatch(null);

  if (!batch.success) throw new Error(batch.error);

  if (batch.data) return runImportBatch({ id: batch.data.id });
});

export const getImporterStatus = makeAction(async () => {
  const isReady = await areImportEntriesReady();
  const hasPendingImports =
    isReady &&
    (await models.FileImportBatchModel.exists({
      isCompleted: false,
      isReady: true,
    }));

  return {
    isImporting: importerStatus.getIsImporting(),
    isPaused: !!hasPendingImports && importerStatus.getIsPaused(),
    isReady,
  };
});

export const reingestFolder = makeAction(
  registerMetadataWork(
    "reingestFolder",
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
            update: { $addToSet: { tagIds: { $each: f.tagIds } }, $set: { dateModified } },
          },
        })),
        { session: getBackgroundSession() },
      );

      if (bulkRes.matchedCount !== args.fileTagIds.length)
        throw new Error(`Failed to update file tagIds: ${Fmt.jstr({ args, bulkRes })}`);

      const tagIds = [...new Set(args.fileTagIds.flatMap((f) => f.tagIds))];

      if (tagIds.length) {
        const queued = await actions.regenTags({ tagIds });

        if (!queued.success) throw new Error(queued.error);
      }

      const collections = await actions.regenCollAttrs({
        fileIds: args.fileTagIds.map(({ fileId }) => fileId),
      });

      if (!collections.success) throw new Error(collections.error);

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
  ),
);

let activeImportExecution: Promise<void> = null;
let importAbortController: AbortController;

// @generator-ignore-export
export const stopImporter = async () => {
  importerStatus.setIsPaused(true);
  importAbortController?.abort();
  (async () => {
    try {
      const resumes = await cancelBackgroundExecutions(undefined, "import metadata finalization");

      for (const resume of resumes) resume();
    } catch (error) {
      console.error("Failed to interrupt import finalization:", error);
    }
  })();

  await activeImportExecution;
};

// @generator-ignore-export
export const isImporterPaused = () => importerStatus.getIsPaused();

export const importMediaFile = makeAction(async (args: MediaImportInput) => importMedia(args));

export const runImportBatch = makeAction(async (args: { id: string }) => {
  if (isServerStopping()) throw new Error("Importer is shutting down");

  await assertMediaPathIndexesReady();

  if (!importerStatus.tryRun()) return { started: false };

  importerStatus.setIsPaused(false);
  importAbortController = new AbortController();

  activeImportExecution = runBackgroundExecution(
    async () => {
      try {
        let id = args.id;

        while (id && !importerStatus.getIsPaused() && !isServerStopping()) {
          const batchRes = await getImportBatch({ id });

          if (!batchRes.success) throw new Error(batchRes.error);

          const batch = batchRes.data;

          if (!batch || batch.isCompleted || !batch.isReady)
            throw new Error("Import batch is unavailable or completed");

          if (!batch.startedAt) {
            const started = await startImportBatch({ id });

            if (!started.success) throw new Error(started.error);
          }

          importerStatus.activeBatchId = id;
          socket.emitReliable("onImportBatchLoaded", { id });
          actions.runMetadataRecoveryQueue();

          const processImports = async (files: models.FileImportSchema[]) => {
            for (let index = 0; index < files.length; ) {
              if (importerStatus.getIsPaused() || isServerStopping()) break;

              const pending = [files[index++]];

              if (getIsImage(pending[0].extension)) {
                while (index < files.length && getIsImage(files[index].extension))
                  pending.push(files[index++]);
              }

              await runConcurrent(
                pending,
                4,
                (file) =>
                  importBatchFile({
                    batchId: id,
                    dateCreated: file.dateCreated,
                    deleteOnImport: batch.deleteOnImport,
                    diffusionParams: file.diffusionParams,
                    ext: file.extension,
                    ignorePrevDeleted: batch.ignorePrevDeleted,
                    originalName: file.name,
                    originalPath: file.path,
                    size: file.size,
                    tagIds: [...new Set([...batch.tagIds, ...(file.tagIds ?? [])].map(String))],
                  }),
                importAbortController.signal,
                (run) => runBackgroundExecution(run, importAbortController.signal, false),
              );
            }
          };

          for await (const operation of FileOperationModel.find({
            batchId: id,
            error: { $exists: false },
            kind: "import",
            state: "PREPARED",
          })
            .select({ sourcePath: 1 })
            .lean()
            .cursor({ batchSize: 100 })) {
            if (importerStatus.getIsPaused() || isServerStopping()) break;

            const entry = await models.FileImportModel.findOne({
              batchId: id,
              path: operation.sourcePath,
              status: { $ne: "ERROR" },
            }).lean();

            if (entry) await processImports([leanModelToJson<models.FileImportSchema>(entry)]);
          }

          let lastIndex = -1;

          while (!importerStatus.getIsPaused() && !isServerStopping()) {
            const entries = await models.FileImportModel.find({
              batchId: id,
              index: { $gt: lastIndex },
              status: "PENDING",
            })
              .sort({ index: 1 })
              .limit(IMPORT_PAGE_SIZE)
              .lean();

            if (!entries.length) break;

            await processImports(entries.map(leanModelToJson<models.FileImportSchema>));
            lastIndex = entries.at(-1).index;
          }

          if (importerStatus.getIsPaused() || isServerStopping()) return;

          const completed = await completeImportBatch({ id, withNextBatch: false });

          if (!completed.success) throw new Error(completed.error);

          id = (
            await models.FileImportBatchModel.findOne({
              isCompleted: false,
              isReady: true,
            })
              .sort({ startedAt: -1, dateCreated: 1 })
              .select({ _id: 1 })
              .lean()
          )?._id.toString();
        }
      } catch (error) {
        importerStatus.setIsPaused(true);

        if (backgroundExecution.getStore()?.cancelled || isServerStopping()) return;

        console.error("Importer paused; pending work retained:", error);

        await actions.recordNotification({
          message: `Importer paused: ${error.message}`,
          type: "error",
        });
      }
    },
    importAbortController.signal,
    false,
  )
    .catch((error) => {
      importerStatus.setIsPaused(true);

      if (!importAbortController.signal.aborted && !isServerStopping())
        console.error("Importer stopped:", error);
    })
    .finally(() => {
      importerStatus.activeBatchId = null;
      importerStatus.setIsImporting(false);
      activeImportExecution = null;
    });

  return { started: true };
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
    thumb?: models.FileImportSchema["thumb"];
  }) => {
    const progress = await runImportTransaction(async () => {
      const filter = { batchId: objectId(args.batchId), path: args.filePath };
      const [previous] = await models.FileImportModel.aggregate<{
        count: number;
        processedCount: number;
        processedSize: number;
        size: number;
      }>([
        { $match: filter },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            processedCount: { $sum: { $cond: [{ $ne: ["$status", "PENDING"] }, 1, 0] } },
            processedSize: { $sum: { $cond: [{ $ne: ["$status", "PENDING"] }, "$size", 0] } },
            size: { $sum: "$size" },
          },
        },
      ]);

      if (!previous) throw new Error("Failed to update file import");

      const { batchId, filePath, ...updates } = args;

      const batch = await models.FileImportBatchModel.findByIdAndUpdate(
        batchId,
        {
          $inc: {
            processedCount:
              args.status === undefined
                ? 0
                : (args.status === "PENDING" ? 0 : previous.count) - previous.processedCount,
            processedSize:
              args.status === undefined
                ? 0
                : (args.status === "PENDING" ? 0 : previous.size) - previous.processedSize,
            progressRevision: 1,
          },
        },
        { new: true },
      )
        .select({ processedCount: 1, processedSize: 1, progressRevision: 1 })
        .lean();

      if (!batch) throw new Error(`Import batch for ${filePath} is unavailable`);

      await models.FileImportModel.updateMany(filter, {
        $set: { ...updates, progressRevision: batch.progressRevision },
      });

      return {
        processedCount: batch.processedCount,
        processedSize: batch.processedSize,
        progressRevision: batch.progressRevision,
      };
    });

    socket.emitReliable("onFileImportUpdated", { ...args, ...progress });
  },
);
