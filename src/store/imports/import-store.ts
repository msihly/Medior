import fs from "fs/promises";
import path from "path";
import env from "env";
import {
  _async,
  _await,
  clone,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { computed } from "mobx";
import { RootStore } from "store";
import { FileImport, ImportBatch } from ".";
import { copyFileForImport } from "./import-queue";
import {
  dayjs,
  extendFileName,
  handleErrors,
  PromiseQueue,
  removeEmptyFolders,
  trpc,
  uniqueArrayMerge,
} from "utils";

export type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("mediaViewer/ImportStore")
export class ImportStore extends Model({
  editorFilePaths: prop<string[]>(() => []).withSetter(),
  editorRootFolderIndex: prop<number>(0).withSetter(),
  editorRootFolderPath: prop<string>("").withSetter(),
  editorImports: prop<FileImport[]>(() => []).withSetter(),
  importBatches: prop<ImportBatch[]>(() => []),
  isImportEditorOpen: prop<boolean>(false).withSetter(),
  isImportManagerOpen: prop<boolean>(false).withSetter(),
}) {
  queue: PromiseQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _createImportBatch({
    collectionTitle,
    createdAt,
    deleteOnImport,
    id,
    imports,
    tagIds = [],
  }: {
    collectionTitle?: string;
    createdAt: string;
    deleteOnImport: boolean;
    id: string;
    imports: FileImport[];
    tagIds?: string[];
  }) {
    this.importBatches.push(
      new ImportBatch({
        collectionTitle,
        completedAt: null,
        createdAt,
        deleteOnImport,
        id,
        imports: imports.map((imp) => clone(imp)),
        startedAt: null,
        tagIds,
      })
    );
  }

  @modelAction
  _deleteBatch(id: string) {
    this.importBatches = this.importBatches.filter((batch) => batch.id !== id);
  }

  @modelAction
  _deleteAllBatches() {
    this.importBatches = [];
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
          tagIds: uniqueArrayMerge(batch.tagIds, addedIds).filter((id) => !removedIds.includes(id)),
        });
    });
  }

  @modelAction
  overwrite(importBatches: ImportBatchInput[]) {
    this.importBatches = importBatches.map(
      (batch) =>
        new ImportBatch({ ...batch, imports: batch.imports.map((imp) => new FileImport(imp)) })
    );
  }

  @modelAction
  queueImportBatch(batchId: string) {
    const DEBUG = false;

    this.queue.add(async () => {
      const batch = this.getById(batchId);

      if (DEBUG)
        console.debug(
          "Starting importBatch:",
          JSON.stringify({ batchId, files: batch.imports }, null, 2)
        );

      const res = await trpc.startImportBatch.mutate({ id: batchId });
      if (!res.success) throw new Error(res.error);
      this.getById(batchId)?.update({ startedAt: res.data });

      batch.imports.forEach((file) => {
        this.queue.add(async () => {
          if (DEBUG) console.debug("Importing file:", JSON.stringify({ ...file }, null, 2));
          const res = await this.importFile({ batchId, filePath: file.path });
          if (!res.success) throw new Error(res.error);
        });
      });

      this.queue.add(async () => {
        const batch = this.getById(batchId);

        if (DEBUG) console.debug("Completing importBatch:", batchId);

        const duplicateFileIds = batch.imports
          .filter((file) => file.status === "DUPLICATE")
          .map((file) => file.fileId);
        if (duplicateFileIds.length) {
          try {
            const res = await trpc.addTagsToFiles.mutate({
              fileIds: duplicateFileIds,
              tagIds: batch.tagIds,
            });
            if (!res.success) throw new Error(res.error);
          } catch (err) {
            console.error("Error adding tags to duplicate files:", err);
          }
        }

        if (batch.deleteOnImport) {
          try {
            const parentDirs = [...new Set(batch.imports.map((file) => path.dirname(file.path)))];
            await Promise.all(parentDirs.map((dir) => removeEmptyFolders(dir)));
          } catch (err) {
            console.error("Error removing empty folders:", err);
          }
        }

        const res = await this.completeImportBatch({ id: batchId });
        if (!res.success) throw new Error(res.error);
        if (DEBUG) console.debug("Completed importBatch:", batchId);
      });
    });
  }

  @modelAction
  removeDiffusionParams() {
    this.editorImports.forEach(
      (imp) => imp.diffusionParams?.length > 0 && imp.update({ diffusionParams: null })
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  completeImportBatch = _async(function* (this: ImportStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const rootStore = getRootStore<RootStore>(this);
        const batch = this.getById(id);

        let collectionId: string = null;
        if (batch.collectionTitle) {
          const res = await rootStore.fileCollectionStore.createCollection({
            fileIdIndexes: batch.completed.map((f, i) => ({ fileId: f.fileId, index: i })),
            title: batch.collectionTitle,
          });
          if (!res.success) throw new Error(res.error);
          collectionId = res.data.id;
        }

        await rootStore.homeStore.reloadDisplayedFiles({ rootStore });

        await Promise.all(batch.tagIds.map((id) => rootStore.tagStore.refreshTagCount({ id })));

        const completedAt = (await trpc.completeImportBatch.mutate({ collectionId, id }))?.data;
        batch.update({ collectionId, completedAt });
      })
    );
  });

  @modelFlow
  createImportBatch = _async(function* (
    this: ImportStore,
    {
      collectionTitle,
      deleteOnImport,
      imports,
      tagIds,
    }: {
      collectionTitle?: string;
      deleteOnImport: boolean;
      imports: FileImport[];
      tagIds?: string[];
    }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const createdAt = dayjs().toISOString();

        const batchRes = await trpc.createImportBatch.mutate({
          collectionTitle,
          createdAt,
          deleteOnImport,
          imports: imports.map((imp) => imp.$ as ModelCreationData<FileImport>),
          tagIds,
        });
        if (!batchRes.success) throw new Error(batchRes?.error);
        const id = batchRes.data._id.toString();
        if (!id) throw new Error("No id returned from createImportBatch");

        this._createImportBatch({
          collectionTitle,
          createdAt,
          deleteOnImport,
          id,
          imports,
          tagIds,
        });
        this.queueImportBatch(id);

        return true;
      })
    );
  });

  @modelFlow
  deleteAllImportBatches = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        const deleteRes = await trpc.deleteAllImportBatches.mutate();
        if (!deleteRes?.success) return false;
        this._deleteAllBatches();
      })
    );
  });

  @modelFlow
  deleteImportBatch = _async(function* (this: ImportStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const deleteRes = await trpc.deleteImportBatch.mutate({ id });
        if (!deleteRes?.success) return false;
        this._deleteBatch(id);
      })
    );
  });

  @modelFlow
  importFile = _async(function* (
    this: ImportStore,
    { batchId, filePath }: { batchId: string; filePath: string }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const batch = this.getById(batchId);
        const fileImport = batch?.getByPath(filePath);

        if (!batch || !fileImport || fileImport?.status !== "PENDING") {
          console.error({
            batch: batch?.toString?.({ withData: true }),
            fileImport: fileImport?.toString?.({ withData: true }),
          });
          throw new Error("Invalid batch or fileImport");
        }

        const copyRes = await copyFileForImport({
          deleteOnImport: batch.deleteOnImport,
          fileObj: fileImport,
          targetDir: env.OUTPUT_DIR,
          tagIds: batch.tagIds,
        });

        const errorMsg = copyRes.error ?? null;
        const fileId = copyRes.file?.id ?? null;
        const status = !copyRes?.success
          ? "ERROR"
          : copyRes?.isDuplicate
          ? "DUPLICATE"
          : "COMPLETE";
        const thumbPaths = copyRes.file?.thumbPaths ?? [];

        const updateRes = await trpc.updateFileImportByPath.mutate({
          batchId,
          errorMsg,
          fileId,
          filePath,
          status,
          thumbPaths,
        });
        if (!updateRes?.success) throw new Error(updateRes?.error);

        try {
          batch.updateImport(filePath, { errorMsg, fileId, status, thumbPaths });
        } catch (err) {
          console.error("Error updating import:", err);
        }
      })
    );
  });

  @modelFlow
  loadDiffusionParams = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        const paramFilePaths = this.editorImports.reduce((acc, cur) => {
          if (cur.extension !== ".jpg") return acc;
          const paramFileName = extendFileName(cur.path, "txt");
          if (this.editorFilePaths.find((p) => p === paramFileName)) acc.push(paramFileName);
          return acc;
        }, [] as string[]);

        const paramFiles = await Promise.all(
          paramFilePaths.map(async (p) => {
            const params = await fs.readFile(p, { encoding: "utf8" });
            return { params, path: p };
          })
        );

        this.editorImports.forEach((imp) => {
          const paramFile = paramFiles.find((p) => p.path === extendFileName(imp.path, "txt"));
          if (paramFile) imp.update({ diffusionParams: paramFile.params });
        });
      })
    );
  });

  @modelFlow
  loadImportBatches = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listImportBatches.mutate();
        if (res.success) this.overwrite(res.data);

        this.batches.forEach(
          (batch) => batch.status === "PENDING" && this.queueImportBatch(batch.id)
        );
      })
    );
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getByCreatedAt(createdAt: string) {
    return this.importBatches.find((batch) => batch.createdAt === createdAt);
  }

  getById(id: string) {
    return this.importBatches.find((batch) => batch.id === id);
  }

  listByTagId(tagId: string) {
    return this.importBatches.filter((batch) => batch.tagIds.includes(tagId));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get batches() {
    return [...this.importBatches].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  @computed
  get completedBatches() {
    return this.batches.filter((batch) => batch.completedAt?.length > 0);
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
    return this.batches.filter((batch) => batch.imports?.length > 0 && batch.nextImport);
  }
}
