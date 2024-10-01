import fs from "fs/promises";
import path from "path";
import {
  clone,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import * as db from "medior/database";
import { computed } from "mobx";
import { asyncAction, RootStore } from "medior/store";
import { copyFileForImport } from "./import-queue";
import { FileImport, FileImportBatch, ImportEditor } from ".";
import {
  CONSTANTS,
  extendFileName,
  makePerfLog,
  PromiseQueue,
  removeEmptyFolders,
  trpc,
  uniqueArrayMerge,
} from "medior/utils";

export type ImportBatchInput = Omit<ModelCreationData<FileImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("medior/ImportStore")
export class ImportStore extends Model({
  deletedFileHashes: prop<string[]>(() => []).withSetter(),
  editor: prop<ImportEditor>(() => new ImportEditor({})),
  editorFilePaths: prop<string[]>(() => []).withSetter(),
  editorFlattenTo: prop<number>(null).withSetter(),
  editorImports: prop<FileImport[]>(() => []).withSetter(),
  editorRootFolderIndex: prop<number>(0).withSetter(),
  editorRootFolderPath: prop<string>("").withSetter(),
  editorWithFlattenTo: prop<boolean>(false).withSetter(),
  importBatches: prop<FileImportBatch[]>(() => []),
  importStats: prop<db.ImportStats>(() => ({
    completedBytes: 0,
    elapsedTime: 0,
    rateInBytes: 0,
    totalBytes: 0,
  })).withSetter(),
  isImportEditorOpen: prop<boolean>(false).withSetter(),
  isImportManagerOpen: prop<boolean>(false).withSetter(),
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
      })
    );
  }

  @modelAction
  _deleteBatches(ids: string[]) {
    this.importBatches = this.importBatches.filter((batch) => !ids.includes(batch.id));
  }

  @modelAction
  addDeletedFileHashes(hashes: string[]) {
    this.deletedFileHashes = [...new Set(...this.deletedFileHashes, ...hashes)];
  }

  @modelAction
  clearQueue() {
    this.queue.cancel();
    this.queue = new PromiseQueue();
  }

  @modelAction
  clearValues({ diffusionParams = false, tagIds = false, tagsToUpsert = false } = {}) {
    this.editorImports.forEach((imp) => {
      if (diffusionParams && imp.diffusionParams?.length) imp.diffusionParams = null;
      if (tagIds && imp.tagIds?.length) imp.tagIds = null;
      if (tagsToUpsert && imp.tagsToUpsert?.length) imp.tagsToUpsert = null;
    });
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
            (id) => !removedIds.includes(id)
          ),
        });
    });
  }

  @modelAction
  overwriteBatches(batches: FileImportBatch[]) {
    this.importBatches = batches;
  }

  @modelAction
  queueImportBatch(batchId: string) {
    const DEBUG = false;

    this.queue.add(async () => {
      const { perfLog, perfLogTotal } = makePerfLog("[IMP]");

      const batch = this.getById(batchId);
      if (DEBUG)
        console.log(
          `Starting importBatch: ${batch.id} (${batch.imports.length} files, ${batch.tagIds.length} tags)`
        );

      const res = await trpc.startImportBatch.mutate({ id: batchId });
      if (!res.success) throw new Error(res.error);
      if (DEBUG) perfLog("Started importBatch");

      this.getById(batchId)?.update({ startedAt: res.data });
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

      const videoRegEx = new RegExp(`${CONSTANTS.VIDEO_TYPES.join("|")}`, "i");

      for (const file of batch.imports) {
        const queue = videoRegEx.test(file.extension) ? videoQueue : imageQueue;
        queue.add(async () => {
          try {
            const res = await this.importFile({ batchId, filePath: file.path });
            if (!res.success) throw new Error(res.error);
            if (DEBUG) perfLog(`Imported file: ${file.path}`);
            if (!batch.imports.some((f) => f.status === "PENDING")) completeBatch();
          } catch (err) {
            console.error("Error importing file:", err);
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
  createImportBatches = asyncAction(async (batches: db.CreateImportBatchesInput) => {
    this.clearQueue();

    const batchRes = await trpc.createImportBatches.mutate(
      batches.map((b) => ({
        ...b,
        tagIds: b.tagIds ? [...new Set(b.tagIds)].flat() : [],
      }))
    );
    if (!batchRes.success) throw new Error(batchRes?.error);

    await this.loadImportBatches();
  });

  @modelFlow
  deleteImportBatches = asyncAction(async ({ ids }: db.DeleteImportBatchesInput) => {
    this.clearQueue();

    const deleteRes = await trpc.deleteImportBatches.mutate({ ids });
    if (!deleteRes?.success) return false;
    this._deleteBatches(ids);
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

    if (fileImport.status !== "PENDING")
      return console.warn(`File already imported (Status: ${fileImport.status}):`, fileImport.path);

    if (DEBUG) perfLog(`Importing file: ${fileImport.path}`);
    const tagIds = [...new Set([...batch.tagIds, ...fileImport.tagIds].flat())];

    const copyRes = await copyFileForImport({
      deleteOnImport: batch.deleteOnImport,
      fileImport,
      ignorePrevDeleted: batch.ignorePrevDeleted,
      tagIds,
    });
    if (DEBUG) perfLog("File imported");

    const errorMsg = copyRes.error ?? null;
    const fileId = copyRes.file?.id ?? null;
    const status = !copyRes?.success
      ? "ERROR"
      : copyRes?.isPrevDeleted
        ? "DELETED"
        : copyRes?.isDuplicate
          ? "DUPLICATE"
          : "COMPLETE";
    const thumbPaths = copyRes.file?.thumbPaths ?? [];

    try {
      batch.updateImport(filePath, { errorMsg, fileId, status, thumbPaths });
      if (DEBUG) perfLog("Updated import in store");

      const updateRes = await trpc.updateFileImportByPath.mutate({
        batchId,
        errorMsg,
        fileId,
        filePath,
        status,
        thumbPaths,
      });
      if (!updateRes?.success) throw new Error(updateRes?.error);
      if (DEBUG) perfLog("Updated import in db");
    } catch (err) {
      console.error("Error updating import:", err);
    }

    if (DEBUG) perfLogTotal("File import completed");
  });

  @modelFlow
  loadDeletedFiles = asyncAction(async () => {
    const res = await trpc.listDeletedFiles.mutate();
    if (res.success) this.deletedFileHashes = res.data.map((f) => f.hash);
  });

  @modelFlow
  loadDiffusionParams = asyncAction(async () => {
    const editorFilePathMap = new Map(this.editorFilePaths.map((p) => [path.resolve(p), p]));

    for (const imp of this.editorImports) {
      if (imp.extension !== ".jpg") continue;

      const paramFileName = path.resolve(extendFileName(imp.path, "txt"));
      if (!editorFilePathMap.has(paramFileName)) continue;

      try {
        const params = await fs.readFile(paramFileName, { encoding: "utf8" });
        imp.setDiffusionParams(params);
      } catch (err) {
        console.error("Error reading diffusion params:", err);
      }
    }
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
          })
      );

      this.overwriteBatches(batches);
      this.queueNextImportBatch();
    }
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.importBatches.find((batch) => batch.id === id);
  }

  listByTagId(tagId: string) {
    return this.importBatches.filter((batch) => [...batch.tagIds].flat().includes(tagId));
  }

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
  get editorRootFolder() {
    return (
      this.editorRootFolderPath.length &&
      this.editorRootFolderPath.split(path.sep)[this.editorRootFolderIndex]
    );
  }

  @computed
  get incompleteBatches() {
    return this.batches.filter((batch) => !batch.completedAt);
  }
}
