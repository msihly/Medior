import {
  _async,
  _await,
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
import { copyFileTo } from "./import-queue";
import { dayjs, handleErrors, trpc, uniqueArrayMerge } from "utils";
import env from "env";

export type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("mediaViewer/ImportStore")
export class ImportStore extends Model({
  activeBatchId: prop<string>(null).withSetter(),
  deleteOnImport: prop<boolean>(false).withSetter(),
  importBatches: prop<ImportBatch[]>(() => []),
}) {
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
  completeImportBatch = _async(function* (
    this: ImportStore,
    { id, rootStore }: { id: string; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const batch = this.getById(id);
        await rootStore.homeStore.reloadDisplayedFiles({ rootStore });
        await Promise.all(
          batch.tagIds.map((id) => rootStore.tagStore.refreshTagCount({ id, withRelated: true }))
        );

        const completedAt = (await trpc.completeImportBatch.mutate({ id }))?.data;
        batch.update({ completedAt });
      })
    );
  });

  @modelFlow
  createImportBatch = _async(function* (this: ImportStore, { imports }: { imports: FileImport[] }) {
    return yield* _await(
      handleErrors(async () => {
        const createdAt = dayjs().toISOString();

        const batchRes = await trpc.createImportBatch.mutate({ createdAt, imports });
        if (!batchRes.success) throw new Error(batchRes?.error);

        this._createImportBatch({
          createdAt,
          id: batchRes.data.id,
          imports,
          tagIds: batchRes.data.tagIds,
        });

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
          return false;
        }

        const copyRes = await copyFileTo({
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
        if (!updateRes?.success) return false;

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
      })
    );
  });

  @modelFlow
  startImportBatch = _async(function* (this: ImportStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const batch = this.getById(id);
        const res = await trpc.startImportBatch.mutate({ id });
        if (!res.success) throw new Error(res.error);

        const startedAt = res.data;
        batch.update({ startedAt });
        this.setActiveBatchId(id);
        return startedAt;
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
  get activeBatch() {
    return this.getById(this.activeBatchId);
  }

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
