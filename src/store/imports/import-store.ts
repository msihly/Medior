import {
  _async,
  _await,
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
  handleErrors,
  PromiseQueue,
  removeEmptyFolders,
  trpc,
  uniqueArrayMerge,
} from "utils";
import env from "env";
import path from "path";

export type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("mediaViewer/ImportStore")
export class ImportStore extends Model({
  deleteOnImport: prop<boolean>(true).withSetter(),
  folderToTags: prop<boolean>(false).withSetter(),
  folderToTagsMode: prop<"parent" | "multi">("parent").withSetter(),
  importBatches: prop<ImportBatch[]>(() => []),
  isImporterOpen: prop<boolean>(false).withSetter(),
}) {
  queue: PromiseQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _createImportBatch({
    createdAt,
    id,
    imports,
    tagIds = [],
  }: {
    createdAt: string;
    id: string;
    imports: FileImport[];
    tagIds?: string[];
  }) {
    this.importBatches.push(
      new ImportBatch({
        createdAt,
        completedAt: null,
        id,
        imports,
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
  addImportBatch({ batchId, files }: { batchId: string; files: ModelCreationData<FileImport>[] }) {
    this.queue.add(async () => {
      // console.debug(
      //   "Starting importBatch:",
      //   JSON.stringify({ batchId, files, tagIds, targetDir }, null, 2)
      // );

      const res = await trpc.startImportBatch.mutate({ id: batchId });
      if (!res.success) throw new Error(res.error);
      this.getById(batchId)?.update({ startedAt: res.data });
    });

    files.forEach((file) => {
      this.queue.add(async () => {
        // console.debug("Importing file:", JSON.stringify({ ...file }, null, 2));

        const res = await this.importFile({ batchId, filePath: file.path });
        if (!res.success) throw new Error(res.error);
      });
    });

    this.queue.add(async () => {
      // console.debug("Completing importBatch:", batchId);

      if (this.deleteOnImport) {
        try {
          const parentDirs = [...new Set(files.map((file) => path.dirname(file.path)))];
          await Promise.all(parentDirs.map((dir) => removeEmptyFolders(dir)));
        } catch (err) {
          console.error("Error removing empty folders:", err);
        }
      }

      const res = await this.completeImportBatch({ id: batchId });
      if (!res.success) throw new Error(res.error);

      // console.debug("Completed importBatch:", batchId);
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
    if (!addedIds?.length && removedIds?.length) return false;

    this.importBatches.forEach((batch) => {
      if (!batchIds.length || batchIds.includes(batch.id))
        batch.tagIds = uniqueArrayMerge(batch.tagIds, addedIds).filter(
          (id) => !removedIds.includes(id)
        );
    });
  }

  @modelAction
  overwrite(importBatches: ImportBatchInput[]) {
    this.importBatches = importBatches.map(
      (batch) =>
        new ImportBatch({ ...batch, imports: batch.imports.map((imp) => new FileImport(imp)) })
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  completeImportBatch = _async(function* (this: ImportStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const rootStore = getRootStore<RootStore>(this);
        await rootStore.homeStore.reloadDisplayedFiles({ rootStore });

        const batch = this.getById(id);
        await Promise.all(batch.tagIds.map((id) => rootStore.tagStore.refreshTagCount({ id })));

        const completedAt = (await trpc.completeImportBatch.mutate({ id }))?.data;
        batch.update({ completedAt });
      })
    );
  });

  @modelFlow
  createImportBatch = _async(function* (
    this: ImportStore,
    { imports, tagIds }: { imports: FileImport[]; tagIds?: string[] }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const createdAt = dayjs().toISOString();

        const batchRes = await trpc.createImportBatch.mutate({ createdAt, imports, tagIds });
        if (!batchRes.success) throw new Error(batchRes?.error);
        const id = batchRes.data._id.toString();

        this._createImportBatch({ createdAt, id, imports, tagIds });
        this.addImportBatch({ batchId: id, files: imports });

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
          deleteOnImport: this.deleteOnImport,
          fileObj: fileImport,
          targetDir: env.OUTPUT_DIR,
          tagIds: batch.tagIds,
        });

        const status = !copyRes?.success
          ? "ERROR"
          : copyRes?.isDuplicate
          ? "DUPLICATE"
          : "COMPLETE";
        const fileId = copyRes.file?.id ?? null;
        const errorMsg = copyRes.error ?? null;

        const updateRes = await trpc.updateFileImportByPath.mutate({
          batchId,
          filePath,
          errorMsg,
          fileId,
          status,
        });
        if (!updateRes?.success) throw new Error(updateRes?.error);

        batch.updateImport(filePath, { errorMsg, fileId, status });
        return true;
      })
    );
  });

  @modelFlow
  loadImportBatches = _async(function* (this: ImportStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listImportBatches.mutate();
        if (res.success) this.overwrite(res.data);
        this.batches.forEach((batch) => {
          if (batch.status !== "PENDING") return;
          this.addImportBatch({ batchId: batch.id, files: batch.imports });
        });
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
  get incompleteBatches() {
    return this.batches.filter((batch) => batch.imports?.length > 0 && batch.nextImport);
  }
}
