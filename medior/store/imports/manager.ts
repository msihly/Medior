import { computed } from "mobx";
import { clone, getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import {
  CreateImportBatchesInput,
  DeleteImportBatchesInput,
  ImportStats,
} from "medior/server/database";
import { asyncAction, RootStore } from "medior/store";
import { getIsVideo, toast } from "medior/utils/client";
import { PromiseQueue, uniqueArrayMerge } from "medior/utils/common";
import { makePerfLog, removeEmptyFolders, trpc } from "medior/utils/server";
import { FileImport, FileImportBatch, FileImporter } from ".";

@model("medior/ImportManager")
export class ImportManager extends Model({
  importBatches: prop<FileImportBatch[]>(() => []).withSetter(),
  importStats: prop<ImportStats>(() => ({
    completedBytes: 0,
    elapsedTime: 0,
    rateInBytes: 0,
    totalBytes: 0,
  })).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
}) {
  queue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _createImportBatch(args: {
    collectionTitle?: string;
    dateCreated: string;
    deleteOnImport: boolean;
    id: string;
    ignorePrevDeleted: boolean;
    imports: FileImport[];
    rootFolderPath: string;
    tagIds?: string[];
  }) {
    this.importBatches.push(
      new FileImportBatch({
        ...args,
        completedAt: null,
        imports: args.imports.map((imp) => clone(imp)),
        startedAt: null,
        tagIds: args.tagIds ?? [],
      }),
    );
  }

  @modelAction
  _deleteBatches(ids: string[]) {
    this.importBatches = this.importBatches.filter((batch) => !ids.includes(batch.id));
  }

  @modelAction
  clearQueue() {
    this.queue.cancel();
    this.queue = new PromiseQueue();
  }

  @modelAction
  editBatchTags({
    addedIds = [],
    batchIds = [],
    removedIds = [],
  }: {
    addedIds?: string[];
    batchIds?: string[];
    removedIds?: string[];
  }) {
    if (!addedIds?.length && !removedIds?.length) return false;

    this.importBatches.forEach((batch) => {
      if (!batchIds.length || batchIds.includes(batch.id))
        batch.update({
          tagIds: uniqueArrayMerge([...batch.tagIds].flat(), addedIds).filter(
            (id) => !removedIds.includes(id),
          ),
        });
    });
  }

  @modelAction
  queueImportBatch(batchId: string) {
    const DEBUG = false;

    this.queue.add(async () => {
      const { perfLog, perfLogTotal } = makePerfLog("[IMP]");

      const batch = this.getById(batchId);
      if (DEBUG)
        perfLog(
          `Starting importBatch: ${batch.id} (${batch.imports.length} files, ${batch.tagIds.length} tags)`,
        );

      const res = await trpc.startImportBatch.mutate({ id: batchId });
      if (!res.success) throw new Error(res.error);
      if (DEBUG) perfLog("Started importBatch");

      batch?.update({ startedAt: res.data });
      if (DEBUG) perfLog("Updated batch.startedAt in store");

      let done = false;
      const completeBatch = async () => {
        if (done) return;
        done = true;

        try {
          const batch = this.getById(batchId);
          const addedTagIds = [...batch.tagIds].flat();
          const duplicateFileIds = batch.imports
            .filter((file) => file.status === "DUPLICATE")
            .map((file) => file.fileId);

          if (addedTagIds.length && duplicateFileIds.length) {
            try {
              const res = await trpc.editFileTags.mutate({
                fileIds: duplicateFileIds,
                addedTagIds,
                withSub: false,
              });
              if (!res.success) throw new Error(res.error);
              if (DEBUG) perfLog("Added tags to duplicate files");
            } catch (err) {
              console.error("Error adding tags to duplicate files:", err);
            }
          }

          const res = await this.completeImportBatch({ batchId });
          if (!res.success) throw new Error(res.error);
          if (DEBUG) {
            perfLog(`Completed importBatch: ${batchId}`);
            perfLogTotal("Completed import queue cycle");
          }
        } catch (err) {
          console.error("Error completing import batch:", err);
        }
      };

      const imageQueue = new PromiseQueue({ concurrency: 4 });
      const videoQueue = new PromiseQueue({ concurrency: 1 });

      for (const file of batch.imports) {
        const queue = getIsVideo(file.extension) ? videoQueue : imageQueue;
        queue.add(async () => {
          try {
            const res = await this.importFile({ batchId, filePath: file.path });
            if (!res.success) throw new Error(res.error);
            if (DEBUG) perfLog(`Imported file: ${file.path}`);
          } catch (err) {
            const storageMsg = "No available file storage location found";
            if (err.message.includes(storageMsg)) {
              toast.error(storageMsg);
              this.clearQueue();
            } else console.error("Error importing file:", err);
          } finally {
            if (!batch.imports.some((f) => f.status === "PENDING")) completeBatch();
          }
        });
      }
    });
  }

  @modelAction
  queueNextImportBatch() {
    const nextBatch = this.incompleteBatches.find((batch) => batch.status === "PENDING");
    if (nextBatch) this.queueImportBatch(nextBatch.id);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  completeImportBatch = asyncAction(async ({ batchId }: { batchId: string }) => {
    const stores = getRootStore<RootStore>(this);
    const batch = this.getById(batchId);

    let collectionId: string = null;
    if (batch.collectionTitle && batch.completed.length) {
      const res = await stores.collection.createCollection({
        fileIdIndexes: batch.completed.map((f, i) => ({ fileId: f.fileId, index: i })),
        title: batch.collectionTitle,
      });
      if (!res.success) throw new Error(res.error);
      collectionId = res.data.id;
    }

    const completedAt = (
      await trpc.completeImportBatch.mutate({
        collectionId,
        fileIds: batch.completed.map((f) => f.fileId),
        id: batchId,
        tagIds: [
          ...new Set([...batch.tagIds, ...batch.imports.flatMap((imp) => imp.tagIds)].flat()),
        ],
      })
    )?.data;

    batch.update({ collectionId, completedAt });
    this.queueNextImportBatch();

    setTimeout(async () => {
      if (
        batch.deleteOnImport &&
        !this.incompleteBatches.some((b) => b.rootFolderPath === batch.rootFolderPath)
      ) {
        try {
          await removeEmptyFolders(batch.rootFolderPath);
          console.debug(`Removed empty folders: ${batch.rootFolderPath}`);
        } catch (err) {
          console.error("Error removing empty folders:", err);
        }
      }
    }, 1000);
  });

  @modelFlow
  createImportBatches = asyncAction(async (batches: CreateImportBatchesInput) => {
    this.clearQueue();

    const batchRes = await trpc.createImportBatches.mutate(
      batches.map((b) => ({
        ...b,
        tagIds: b.tagIds ? [...new Set(b.tagIds)].flat() : [],
      })),
    );
    if (!batchRes.success) throw new Error(batchRes?.error);

    await this.loadImportBatches();
  });

  @modelFlow
  deleteImportBatches = asyncAction(async (args: DeleteImportBatchesInput) => {
    this.clearQueue();

    const deleteRes = await trpc.deleteImportBatches.mutate(args);
    if (!deleteRes?.success) return false;
    this._deleteBatches(args.ids);
    this.queueNextImportBatch();
  });

  @modelFlow
  importFile = asyncAction(async ({ batchId, filePath }: { batchId: string; filePath: string }) => {
    const DEBUG = false;
    const { perfLog, perfLogTotal } = makePerfLog("[ImportStore.importFile]");

    const batch = this.getById(batchId);
    const fileImport = batch?.getByPath(filePath);

    if (!batch || !fileImport) {
      console.error({
        batch: batch?.toString?.({ withData: true }),
        fileImport: fileImport?.toString?.({ withData: true }),
      });
      throw new Error("Invalid batch or fileImport");
    }

    if (fileImport.status !== "PENDING") return;

    if (DEBUG) perfLog(`Importing file: ${fileImport.path}`);
    const originalPath = fileImport.path;
    const tagIds = [...new Set([...batch.tagIds, ...fileImport.tagIds].flat())];

    const importer = new FileImporter({
      dateCreated: fileImport.dateCreated,
      deleteOnImport: batch.deleteOnImport,
      ext: fileImport.extension,
      ignorePrevDeleted: batch.ignorePrevDeleted,
      originalName: fileImport.name,
      originalPath,
      size: fileImport.size,
      tagIds,
      withRemux: batch.remux,
    });
    const copyRes = await importer.import();
    if (DEBUG) perfLog("File imported");

    const errorMsg = copyRes.error ?? null;
    const fileId = copyRes.file?.id ?? null;
    const status = copyRes.status;
    const thumb = copyRes.file?.thumb ?? null;

    try {
      batch.updateImport(
        { originalPath, newPath: copyRes.file?.path },
        { errorMsg, fileId, status, thumb },
      );
      if (DEBUG) perfLog("Updated import in store");

      const updateRes = await trpc.updateFileImportByPath.mutate({
        batchId,
        errorMsg,
        fileId,
        filePath: originalPath,
        status,
        thumb,
      });
      if (!updateRes?.success) throw new Error(updateRes?.error);
      if (DEBUG) perfLog("Updated import in db");
    } catch (err) {
      console.error("Error updating import:", err);
    }

    if (DEBUG) perfLogTotal("File import completed");
  });

  @modelFlow
  loadImportBatches = asyncAction(async () => {
    this.clearQueue();

    const res = await trpc.listImportBatches.mutate();
    if (res.success) {
      const batches = res.data.map(
        (batch) =>
          new FileImportBatch({
            ...batch,
            imports: batch.imports.map((imp) => new FileImport(imp)),
          }),
      );

      this.setImportBatches(batches);
      this.queueNextImportBatch();
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get batches() {
    return [...this.importBatches].sort((a, b) => a.dateCreated.localeCompare(b.dateCreated));
  }

  @computed
  get completedBatches() {
    return this.batches.filter((batch) => batch.completedAt);
  }

  @computed
  get incompleteBatches() {
    return this.batches.filter((batch) => !batch.completedAt);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.importBatches.find((batch) => batch.id === id);
  }

  listByTagId(tagId: string) {
    return this.importBatches.filter((batch) => [...batch.tagIds].flat().includes(tagId));
  }
}
