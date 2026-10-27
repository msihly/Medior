import { promises as fs } from "fs";
import { createHash } from "crypto";
import * as models from "medior/_generated/server/models";
import { isServerStopping } from "trabecula/utils/process";
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
  isMediaPathReferenced,
  listOwnedMediaPathKeys,
  listPendingCleanupPathKeys,
} from "medior/server/database/file-operations";
import { queueImportCleanup } from "medior/server/database/import-cleanup";
import { getImportSourceFolder, runImportTransaction } from "medior/server/database/import-entries";
import {
  areImportEntriesReady,
  assertImportEntriesReady,
} from "medior/server/database/import-entry-state";
import {
  abandonPreparedImport,
  getImportOperationId,
  importBatchFile,
  importMedia,
  MediaImportInput,
} from "medior/server/database/media-import";
import { mediaPathKey } from "medior/server/database/media-paths";
import { metadataWriteOptions, registerMetadataWork } from "medior/server/database/metadata-work";
import { isPersistenceReady } from "medior/server/database/persistence";
import * as Types from "medior/server/database/types";
import {
  chunkArray,
  CONSTANTS,
  dayjs,
  Fmt,
  IMPORT_PAGE_SIZE,
  IMPORT_UPLOAD_BYTES,
  IMPORT_UPLOAD_COUNT,
  ImportBatchOptions,
  ImportEntryInput,
  sumArray,
} from "medior/utils/common";
import {
  getIsActiveScratchPath,
  getIsImage,
  getIsStoragePath,
  getIsStorageScratchPath,
  getIsVideo,
  leanModelToJson,
  makeAction,
  objectId,
  objectIds,
  socket,
} from "medior/utils/server";
import { copyMediaFile } from "medior/utils/server/media-output";
import { getCommonSourceFolder, mergeSourceFolders } from "medior/utils/server/source-folders";
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
    socket.emitVolatile("onImporterStatusUpdated");
  }

  setIsPaused(isPaused: boolean) {
    this.isPaused = isPaused;
    socket.emitVolatile("onImporterStatusUpdated");
  }

  tryRun() {
    if (this.isImporting) return false;

    this.isImporting = true;
    socket.emitVolatile("onImporterStatusUpdated");

    return true;
  }
}

const importerStatus = new ImporterStatus();
const COLLECTION_IMPORT_STATUSES = ["COMPLETE", "DUPLICATE"] satisfies Types.ImportStatus[];
const REPROCESSED_IMPORT_STATUSES = [
  "COMPLETE",
  "DUPLICATE",
  "ERROR",
] satisfies Types.ImportStatus[];

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

/** Lists source paths that earlier imports have committed to delete but not yet deleted. */
export const listPendingCleanupPaths = makeAction(async (args: { paths: string[] }) => {
  // Imports re-check once recovery storage is ready, so ingest can still queue them meanwhile.
  if (!(await isPersistenceReady())) return [];

  const pendingKeys = await listPendingCleanupPathKeys(args.paths.map(mediaPathKey));

  return args.paths.filter((filePath) => pendingKeys.has(mediaPathKey(filePath)));
});

export const completeImportBatch = makeAction(
  registerMetadataWork(
    "completeImportBatch",
    async (args: { id: string; withNextBatch: boolean }) => {
      const completedAt = dayjs().toISOString();

      const batchRes = await getImportBatch({ id: args.id });
      if (!batchRes.success) throw new Error(batchRes.error);

      const batch = batchRes.data;
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

        if (batch.mediaProgram)
          await actions.attachImportedMediaProgramSeason({
            collectionId,
            mediaProgram: batch.mediaProgram,
          });
      }

      const sidecarCollectionFiles = new Map<string, { fileId: string; index: number }[]>();
      let lastIndex = -1;

      while (true) {
        const entries = await models.FileImportModel.find({
          batchId: args.id,
          index: { $gt: lastIndex },
        })
          .select({ fileId: 1, index: 1, "sidecar.collections": 1, status: 1, tagIds: 1 })
          .sort({ index: 1 })
          .limit(1000)
          .lean();

        if (!entries.length) break;

        for (const entry of entries) {
          if (
            !entry.fileId ||
            !COLLECTION_IMPORT_STATUSES.some((status) => status === entry.status)
          )
            continue;

          for (const { id, index } of entry.sidecar?.collections ?? []) {
            const file = { fileId: String(entry.fileId), index };
            const files = sidecarCollectionFiles.get(id);

            if (files) files.push(file);
            else sidecarCollectionFiles.set(id, [file]);
          }
        }

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

      if (sidecarCollectionFiles.size) {
        const collections = await models.FileCollectionModel.find({
          _id: { $in: objectIds([...sidecarCollectionFiles.keys()]) },
        })
          .select({ _id: 1 })
          .lean();

        for (const collection of collections) {
          const collId = collection._id.toString();
          const res = await actions.insertFilesIntoCollection({
            collId,
            fileIdIndexes: sidecarCollectionFiles.get(collId),
          });
          if (!res.success) throw new Error(`Failed to add files to collection: ${res.error}`);
        }
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

            const cleanupId = `import-batch:${args.id}`;

            await FileOperationModel.updateOne(
              { _id: cleanupId },
              {
                $setOnInsert: {
                  cleanup,
                  emptyFolderPath: batch.rootFolderPath,
                  state: "COMMITTED",
                },
              },
              { ...metadataWriteOptions(), upsert: true },
            );

            await queueImportCleanup([cleanupId]);
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
        const nextBatch = await getNextImportBatch(null);

        // The batch is already completed, so a failed lookup only skips starting the next one.
        if (!nextBatch.success)
          fileLog(`Failed to find the next import batch: ${nextBatch.error}`, { type: "error" });
        else if (nextBatch.data) runImportBatch({ id: nextBatch.data.id });
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

    socket.emitVolatile("onReloadImportBatches");

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
      sidecar: entry.sidecar,
      size: entry.size,
      subtitles: entry.subtitles?.map(({ path }) => ({ path })),
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

        // Later pages extend the folder found so far; one saved without a folder stays without.
        const sourceFolderPath = mergeSourceFolders(
          args.offset ? (batch.sourceFolderPath ?? null) : undefined,
          getCommonSourceFolder(imports.map((entry) => entry.path)),
        );

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

  socket.emitVolatile("onReloadImportBatches");

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
      socket.emitVolatile("onReloadImportBatches");

      return true;
    }
  }),
);

export const getImportBatchEntries = makeAction(
  async (args: { id: string; page: number; statuses?: Types.ImportStatus[] }) => {
    if (!Number.isSafeInteger(args.page) || args.page < 1) throw new Error("Invalid import page");

    const isFiltered = args.statuses?.length > 0;
    const offset = (args.page - 1) * IMPORT_PAGE_SIZE;

    // Unfiltered pages are index ranges; filtered pages skip through the batch's status index.
    const entries = await models.FileImportModel.find(
      isFiltered
        ? { batchId: args.id, status: { $in: args.statuses } }
        : { batchId: args.id, index: { $gte: offset, $lt: offset + IMPORT_PAGE_SIZE } },
    )
      .sort({ index: 1 })
      .skip(isFiltered ? offset : 0)
      .limit(IMPORT_PAGE_SIZE)
      .lean();

    return entries.map(leanModelToJson<models.FileImportSchema>);
  },
);

export const getImportBatchStatusCounts = makeAction(async (args: { ids: string[] }) => {
  const counts = await models.FileImportModel.aggregate<{
    _id: { batchId: string; status: Types.ImportStatus };
    count: number;
  }>([
    { $match: { batchId: { $in: objectIds(args.ids) } } },
    { $group: { _id: { batchId: "$batchId", status: "$status" }, count: { $sum: 1 } } },
  ]);

  const countsById: Record<
    string,
    Partial<Record<Types.ImportStatus, number>>
  > = Object.fromEntries(args.ids.map((id) => [id, {}]));

  for (const { _id, count } of counts) countsById[String(_id.batchId)][_id.status] = count;

  return countsById;
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
        await abandonPreparedImport(operation);
        finishFileOperation(operation._id).catch(console.error);
      }

      const result = await models.FileImportBatchModel.deleteMany({ _id: { $in: args.ids } });

      await models.FileImportModel.deleteMany({ batchId: { $in: args.ids } });

      return result;
    },
    { persistInBackground: true },
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
  if (activeImportExecution) await stopImporter();

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

      // Files sharing the same added tags are sent together, so open views update them in place.
      const fileIdsByTags = new Map<string, { addedTagIds: string[]; fileIds: string[] }>();

      for (const fileTags of args.fileTagIds) {
        const key = [...fileTags.tagIds].sort().join();

        if (!fileIdsByTags.has(key))
          fileIdsByTags.set(key, { addedTagIds: fileTags.tagIds, fileIds: [] });
        fileIdsByTags.get(key).fileIds.push(fileTags.fileId);
      }

      for (const { addedTagIds, fileIds } of fileIdsByTags.values())
        socket.emitVolatile("onFileTagsUpdated", { addedTagIds, fileIds, removedTagIds: [] });

      socket.emitVolatile("onFilesUpdated", {
        fileIds: args.fileTagIds.map(({ fileId }) => fileId),
        updates: { dateModified },
      });
    },
    { getFileIds: ({ fileTagIds }) => fileTagIds.map(({ fileId }) => fileId) },
  ),
);

/**
 * Requeues the batch's files from file storage that it copied, kept, or failed before such files were
 * registered in place. Records it copied from leftover scratch output, previously deleted files, or
 * files in use are deleted first, so each requeued file is registered in place or deleted as redundant.
 */
export const reprocessStoredImports = makeAction(
  registerMetadataWork(
    "reprocessStoredImports",
    async (args: { id: string }) => {
      await assertImportEntriesReady();
      await stopImporter();

      const batch = await models.FileImportBatchModel.findOne({ _id: args.id, isReady: true })
        .select({ collectionId: 1, tagIds: 1 })
        .lean();
      if (!batch) throw new Error("Import batch is unavailable");

      let deletedCount = 0;
      let lastIndex = -1;
      let requeuedCount = 0;

      while (true) {
        const entries = await models.FileImportModel.find({
          batchId: args.id,
          index: { $gt: lastIndex },
          status: { $in: REPROCESSED_IMPORT_STATUSES },
        })
          .select({
            fileId: 1,
            hash: 1,
            index: 1,
            path: 1,
            "sidecar.rating": 1,
            status: 1,
            tagIds: 1,
          })
          .sort({ index: 1 })
          .limit(1000)
          .lean();

        if (!entries.length) break;

        lastIndex = entries.at(-1).index;

        const storedEntries = entries.filter(
          (entry) => getIsStoragePath(entry.path) && !getIsActiveScratchPath(entry.path),
        );
        const existingIndexes = new Set<number>();

        await runConcurrent(storedEntries, CONSTANTS.FILE.IO_CONCURRENCY, async (entry) => {
          if (await checkFileExists(entry.path)) existingIndexes.add(entry.index);
        });

        const files = new Map(
          (
            await models.FileModel.find({
              _id: { $in: storedEntries.flatMap((entry) => entry.fileId ?? []) },
            })
              .select({
                collectionIds: 1,
                hash: 1,
                originalHash: 1,
                originalPath: 1,
                path: 1,
                previousHashes: 1,
                rating: 1,
                sourceHash: 1,
                tagIds: 1,
              })
              .lean()
          ).map((file) => [String(file._id), file]),
        );

        // Files tagged, rated, or collected beyond what this batch gave them are kept even when
        // they are redundant copies.
        const getIsCurated = (entry: (typeof entries)[number]) => {
          const file = files.get(String(entry.fileId));
          if (!file) return false;

          const importedTagIds = new Set([...batch.tagIds, ...(entry.tagIds ?? [])].map(String));

          return (
            (file.tagIds ?? []).some((tagId) => !importedTagIds.has(String(tagId))) ||
            (file.collectionIds ?? []).some(
              (collectionId) => String(collectionId) !== String(batch.collectionId),
            ) ||
            (file.rating > 0 && file.rating !== entry.sidecar?.rating)
          );
        };

        const curatedIndexes = new Set(
          storedEntries.filter(getIsCurated).map((entry) => entry.index),
        );

        // Files this batch created from an entry record its source as their original path.
        const createdFiles = storedEntries.flatMap((entry) => {
          const file = files.get(String(entry.fileId));

          return file && mediaPathKey(file.originalPath) === mediaPathKey(entry.path) ? [file] : [];
        });
        const createdFileSet = new Set(createdFiles);
        const createdHashes = createdFiles.map((file) => file.hash);
        const createdHashSet = new Set(createdHashes);

        // Files compressed, spliced, or edited since keep the checksums of versions this batch re-created.
        const supersedingIds = new Map<string, string>();

        for (const file of await models.FileModel.find({
          _id: { $nin: createdFiles.map((created) => created._id) },
          $or: [
            { originalHash: { $in: createdHashes, $type: "string" } },
            { previousHashes: { $in: createdHashes, $type: "string" } },
            { sourceHash: { $in: createdHashes, $type: "string" } },
          ],
        })
          .select({ originalHash: 1, path: 1, previousHashes: 1, sourceHash: 1 })
          .lean()) {
          if (await checkFileExists(file.path)) {
            for (const hash of [file.originalHash, file.sourceHash, ...(file.previousHashes ?? [])])
              if (createdHashSet.has(hash)) supersedingIds.set(hash, String(file._id));
          }
        }

        // Untouched originals this batch re-created are removed; curated ones stay.
        const getSupersedingId = (entry: (typeof entries)[number]) => {
          const file = files.get(String(entry.fileId));

          return createdFileSet.has(file) && !curatedIndexes.has(entry.index)
            ? supersedingIds.get(file.hash)
            : undefined;
        };

        const junkFileIds: string[] = [];
        const requeuedIndexes: number[] = [];
        const supersededEntries: { fileId: string; index: number }[] = [];

        // Originals registered in place, or whose source is already gone, leave the entry a duplicate.
        for (const entry of storedEntries) {
          const file = files.get(String(entry.fileId));
          const supersedingId = getSupersedingId(entry);

          if (
            supersedingId &&
            (!existingIndexes.has(entry.index) ||
              mediaPathKey(file.path) === mediaPathKey(entry.path))
          ) {
            junkFileIds.push(String(file._id));
            supersededEntries.push({ fileId: supersedingId, index: entry.index });
          }
        }

        const supersededIndexes = new Set(supersededEntries.map((superseded) => superseded.index));
        const candidates = storedEntries.filter(
          (entry) => existingIndexes.has(entry.index) && !supersededIndexes.has(entry.index),
        );

        const operationIds = new Map(
          candidates.map((entry) => [
            entry.index,
            getImportOperationId({ batchId: args.id, originalPath: entry.path }),
          ]),
        );

        const operations = new Map(
          (await FileOperationModel.find({ _id: { $in: [...operationIds.values()] } }).lean()).map(
            (operation) => [operation._id, operation],
          ),
        );

        const deletedHashes = new Set(
          (
            await models.DeletedFileModel.find({
              hash: { $in: candidates.flatMap((entry) => entry.hash ?? []) },
            })
              .select({ hash: 1 })
              .lean()
          ).map((file) => file.hash),
        );

        const { cleanupKeys, transformKeys } = await listOwnedMediaPathKeys(
          candidates.map((entry) => entry.path),
        );

        for (const entry of candidates) {
          const file = files.get(String(entry.fileId));
          const isTransformOwned = transformKeys.has(mediaPathKey(entry.path));
          const operation = operations.get(operationIds.get(entry.index));
          const supersedingId = getSupersedingId(entry);

          // Sources a cleanup is deleting are left to it, as is any copy it retains.
          if (cleanupKeys.has(mediaPathKey(entry.path))) continue;

          // Files registered in place are done; ones whose content no longer relates keep their source.
          if (
            file &&
            (mediaPathKey(file.path) === mediaPathKey(entry.path) ||
              !entry.hash ||
              ![
                file.hash,
                file.originalHash,
                file.sourceHash,
                ...(file.previousHashes ?? []),
              ].includes(entry.hash))
          )
            continue;

          // Imports committing or cleaning up finish on their own; ones whose file exists finish requeued.
          if (operation) {
            if (operation.state !== "PREPARED" || operation.importResult) continue;

            if (
              !operation.outputPath ||
              !(await isMediaPathReferenced(operation.outputPath, {
                fileOperationId: operation._id,
              }))
            ) {
              await abandonPreparedImport(operation);

              if ((await finishFileOperation(operation._id)) !== "DONE") continue;
            }
          }

          const isJunk =
            !!supersedingId ||
            (entry.status === "COMPLETE" &&
              !!file &&
              !curatedIndexes.has(entry.index) &&
              (isTransformOwned ||
                getIsStorageScratchPath(entry.path) ||
                deletedHashes.has(entry.hash) ||
                (await isMediaPathReferenced(entry.path, {
                  fileOperationId: operationIds.get(entry.index),
                }))));

          if (isJunk) junkFileIds.push(String(entry.fileId));

          // Transform cleanups decide their files, so requeuing only records why a junk copy went.
          if (!isTransformOwned || isJunk) requeuedIndexes.push(entry.index);
        }

        // Entries point at their superseding files before the originals go, so none is left dangling.
        if (supersededEntries.length)
          await models.FileImportModel.bulkWrite(
            supersededEntries.map(({ fileId, index }) => ({
              updateOne: {
                filter: { batchId: args.id, index },
                update: { $set: { errorMsg: null, fileId, status: "DUPLICATE" } },
              },
            })),
          );

        const uniqueJunkIds = [...new Set(junkFileIds)];

        // Junk records are not marked deleted, so imports of their content elsewhere are unaffected.
        for (const fileIds of chunkArray(uniqueJunkIds, 200)) {
          const deleted = await actions.deleteFiles({ fileIds, withDeletedHashes: false });
          if (!deleted.success) throw new Error(deleted.error);

          deletedCount += fileIds.length;
        }

        // Other entries that recorded a removed file, such as duplicates of it, are left to retry.
        if (uniqueJunkIds.length)
          await models.FileImportModel.updateMany(
            {
              fileId: { $in: objectIds(uniqueJunkIds) },
              $nor: [{ batchId: objectId(args.id), index: { $in: requeuedIndexes } }],
            },
            {
              $set: {
                errorMsg: "Its file was removed as a redundant stored copy; reprocess to retry.",
                fileId: null,
                status: "ERROR",
              },
            },
          );

        if (requeuedIndexes.length)
          requeuedCount += await runImportTransaction(async () => {
            const filter = {
              batchId: objectId(args.id),
              index: { $in: requeuedIndexes },
              status: { $ne: "PENDING" },
            };

            const [requeued] = await models.FileImportModel.aggregate<{
              count: number;
              size: number;
            }>([
              { $match: filter },
              { $group: { _id: null, count: { $sum: 1 }, size: { $sum: "$size" } } },
            ]);

            if (!requeued) return 0;

            await models.FileImportModel.updateMany(filter, {
              $set: { errorMsg: null, fileId: null, status: "PENDING" },
            });

            await models.FileImportBatchModel.updateOne(
              { _id: args.id },
              {
                $inc: {
                  processedCount: -requeued.count,
                  processedSize: -requeued.size,
                  progressRevision: 1,
                },
                $set: { completedAt: null, isCompleted: false },
              },
            );

            return requeued.count;
          });
      }

      socket.emitVolatile("onReloadImportBatches");

      return { deletedCount, requeuedCount };
    },
    { persistInBackground: true },
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

const getImportKind = (extension: string) =>
  getIsImage(extension) ? "image" : getIsVideo(extension) ? "video" : null;

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
          socket.emit("onImportBatchLoaded", { id });
          actions.runMetadataRecoveryQueue();

          const processImports = async (files: models.FileImportSchema[]) => {
            for (let index = 0; index < files.length; ) {
              if (importerStatus.getIsPaused() || isServerStopping()) break;

              const pending = [files[index++]];
              const kind = getImportKind(pending[0].extension);

              if (kind) {
                while (index < files.length && getImportKind(files[index].extension) === kind)
                  pending.push(files[index++]);
              }

              // Videos take turns on the source drive, the library drive, and ffmpeg, so 3 at a time
              // lets each be busy with a different file.
              await runConcurrent(
                pending,
                kind === "image" ? 4 : 3,
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
                    rootFolderPath: batch.rootFolderPath,
                    sidecar: file.sidecar,
                    size: file.size,
                    subtitleMode: batch.subtitleMode,
                    subtitles: file.subtitles,
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

    socket.emit("onFileImportUpdated", { ...args, ...progress });
  },
);
