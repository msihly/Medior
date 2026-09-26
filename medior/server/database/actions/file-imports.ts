import { promises as fs } from "fs";
import path from "path";
import * as models from "medior/_generated/server/models";
import { ModelCreationData } from "mobx-keystone";
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
import {
  importBatchFile,
  importMedia,
  MediaImportInput,
} from "medior/server/database/media-import";
import { metadataWriteOptions, registerMetadataWork } from "medior/server/database/metadata-work";
import * as Types from "medior/server/database/types";
import { isServerStopping } from "medior/server/process-lifecycle";
import type { FileImport } from "medior/store";
import { dayjs, Fmt, sumArray } from "medior/utils/common";
import { getIsImage, leanModelToJson, makeAction, objectId, socket } from "medior/utils/server";
import { copyMediaFile } from "medior/utils/server/media-output";
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

const deriveImportCollectionSourceFolderPath = (filePaths: string[]) => {
  const folders = filePaths.filter(Boolean).map((filePath) => path.win32.dirname(filePath));
  if (!folders.length) return null;

  const root = path.win32.parse(folders[0]).root;
  if (
    !folders.every((folder) => path.win32.parse(folder).root.toLowerCase() === root.toLowerCase())
  )
    return null;

  const relativeParts = folders.map((folder) =>
    path.win32
      .relative(root, folder)
      .split(/[\\/]+/)
      .filter(Boolean),
  );

  const commonParts: string[] = [];
  const maxLength = Math.min(...relativeParts.map((parts) => parts.length));

  for (let index = 0; index < maxLength; index++) {
    const part = relativeParts[0][index];
    if (!relativeParts.every((parts) => parts[index].toLowerCase() === part.toLowerCase())) break;

    commonParts.push(part);
  }

  return commonParts.length ? path.win32.join(root, ...commonParts) : null;
};

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

      if (batch.imports.some((f) => f.status === "PENDING")) {
        fileLog({ args, batch }, { type: "error" });
        throw new Error("Failed to complete batch (imports pending)");
      }

      const collectionImports = batch.imports.filter((imp) =>
        COLLECTION_IMPORT_STATUSES.some((status) => status === imp.status),
      );

      const missingCollectionFileIds = collectionImports.filter((imp) => !imp.fileId);

      if (batch.collectionTitle && missingCollectionFileIds.length) {
        fileLog({ args, batch, missingCollectionFileIds }, { type: "error" });
        throw new Error("Failed to complete batch collection (completed imports missing file ids)");
      }

      const fileIds = [
        ...new Set(collectionImports.map((imp) => imp.fileId?.toString()).filter(Boolean)),
      ];

      const tagIds = [
        ...new Set([...batch.tagIds, ...batch.imports.flatMap((imp) => imp.tagIds)].flat()),
      ];

      let collectionId: string = null;

      if (batch.collectionTitle && fileIds.length) {
        const fileIdIndexes = fileIds.map((fileId, index) => ({ fileId, index }));

        const sourceFolderPath =
          batch.collectionSourceFolderPath ??
          deriveImportCollectionSourceFolderPath(
            collectionImports.map((fileImport) => fileImport.path),
          );

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

      const duplicateFileIds = [
        ...new Set(
          batch.imports.filter((file) => file.status === "DUPLICATE").map((file) => file.fileId),
        ),
      ];

      if (duplicateFileIds.length && batch.tagIds?.length) {
        const res = await actions.editFileTags({
          addedTagIds: batch.tagIds,
          fileIds: duplicateFileIds,
          withRegen: false,
          withSub: false,
        });
        if (!res.success) throw new Error(`Failed to update duplicate file tags: ${res.error}`);
      }

      if (tagIds.length) await actions.queueTagMetadataRegen(tagIds);

      if (duplicateFileIds.length) {
        const regenerated = await actions.regenCollAttrs({ fileIds: duplicateFileIds });
        if (!regenerated.success) throw new Error(regenerated.error);
      }

      if (batch.deleteOnImport) {
        try {
          const res = await actions.listFileImportBatch({
            args: { filter: { isCompleted: false, rootFolderPath: batch.rootFolderPath } },
          });
          if (!res.success) throw new Error(res.error);

          if (!res.data.items.some((item) => item.id !== args.id)) {
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

        if (nextBatch) void runImportBatch({ id: nextBatch.id });
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

export const createImportBatches = makeAction(
  async (
    batches: {
      collectionSourceFolderPath?: string;
      collectionTitle?: string;
      deleteOnImport: boolean;
      ignorePrevDeleted: boolean;
      imports: ModelCreationData<FileImport>[];
      rootFolderPath: string;
      tagIds?: string[];
    }[],
  ) => {
    const tagMap: { tagIds: string[]; tagIdsWithAncestors: string[] }[] = [];

    const batchTagIds = batches.map((batch) =>
      batch.tagIds ? [...new Set(batch.tagIds)].flat() : [],
    );

    const uniqueTagIds = [...new Set(batchTagIds.flat())];

    const ancestorMap = uniqueTagIds.length
      ? await actions.makeAncestorIdsMap(uniqueTagIds)
      : new Map<string, string[]>();

    for (let i = 0; i < batches.length; i++) {
      const tagIds = batchTagIds[i];

      tagMap.push({
        tagIds,
        tagIdsWithAncestors: [...new Set(tagIds.flatMap((tagId) => ancestorMap.get(tagId) ?? []))],
      });
    }

    const res = await models.FileImportBatchModel.insertMany(
      batches.map((batch, idx) => ({
        ...batch,
        completedAt: null,
        dateCreated: dayjs().toISOString(),
        fileCount: batch.imports.length,
        isCompleted: false,
        size: sumArray(batch.imports, (imp) => imp.size),
        startedAt: null,
        tagIds: tagMap[idx].tagIds,
        tagIdsWithAncestors: tagMap[idx].tagIdsWithAncestors,
      })),
      { ...metadataWriteOptions(), rawResult: true, session: getBackgroundSession() },
    );

    const ids = Object.values(res.insertedIds).map((id) => id.toString());

    if (res.insertedCount !== batches.length) throw new Error("Failed to create import batches");

    socket.emit("onReloadImportBatches");

    return { count: res.insertedCount, ids };
  },
);

export const deleteImportBatches = makeAction(
  registerMetadataWork(
    "deleteImportBatches",
    async (args: { ids: string[] }) => {
      await stopImporter();

      for (const operation of await FileOperationModel.find({
        batchId: { $in: args.ids },
        importResult: { $exists: false },
        state: "PREPARED",
      }).lean()) {
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

        void finishFileOperation(operation._id).catch(console.error);
      }

      return models.FileImportBatchModel.deleteMany({ _id: { $in: args.ids } });
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
  const hasPendingImports = await models.FileImportBatchModel.exists({ isCompleted: false });

  return {
    isImporting: importerStatus.getIsImporting(),
    isPaused: !!hasPendingImports && importerStatus.getIsPaused(),
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
  void cancelBackgroundExecutions(undefined, "import metadata finalization")
    .then((resumes) => {
      for (const resume of resumes) void resume();
    })
    .catch((error) => console.error("Failed to interrupt import finalization:", error));

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
        const visited = new Set<string>();

        while (id && !importerStatus.getIsPaused() && !isServerStopping()) {
          const batchRes = await getImportBatch({ id });
          if (!batchRes.success) throw new Error(batchRes.error);

          const batch = batchRes.data;
          if (!batch || batch.isCompleted)
            throw new Error("Import batch is unavailable or completed");

          if (!batch.startedAt) {
            const started = await startImportBatch({ id });
            if (!started.success) throw new Error(started.error);
          }

          importerStatus.activeBatchId = id;
          socket.emitReliable("onImportBatchLoaded", { id });
          void actions.runMetadataRecoveryQueue();

          const preparedPaths = new Set(
            (
              await FileOperationModel.find({
                batchId: id,
                error: { $exists: false },
                kind: "import",
                state: "PREPARED",
              })
                .select({ sourcePath: 1 })
                .lean()
            ).map((operation) => operation.sourcePath),
          );

          const files = batch.imports.filter(
            ({ path, status }) =>
              status === "PENDING" || (status !== "ERROR" && preparedPaths.has(path)),
          );

          for (let index = 0; index < files.length; ) {
            if (importerStatus.getIsPaused() || isServerStopping()) return;

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
                  tagIds: [...new Set([...batch.tagIds, ...file.tagIds])],
                }),
              importAbortController.signal,
              (run) => runBackgroundExecution(run, importAbortController.signal, false),
            );
          }

          if (importerStatus.getIsPaused() || isServerStopping()) return;

          const completed = await completeImportBatch({ id, withNextBatch: false });
          if (!completed.success) throw new Error(completed.error);

          visited.add(id);
          id = (
            await models.FileImportBatchModel.findOne({
              _id: { $nin: [...visited] },
              isCompleted: false,
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
    thumb?: models.FileImportBatchSchema["imports"][number]["thumb"];
  }) => {
    const res = await models.FileImportBatchModel.updateOne(
      { _id: args.batchId, "imports.path": args.filePath },
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

    if (!res?.matchedCount) {
      const errorMsg = "Failed to update file import";

      socket.emit("onFileImportUpdated", { ...args, status: "ERROR", errorMsg });
      throw new Error(errorMsg);
    }

    socket.emitReliable("onFileImportUpdated", args);
  },
);
