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
import { FileImport, ImportBatch } from ".";
import { computed } from "mobx";
import { RootStore } from "store";
import { handleErrors, trpc, uniqueArrayMerge } from "utils";
import env from "env";
import { copyFileTo } from "./import-queue";

type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
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
  addImportBatch({
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
  deleteImportBatch(id: string) {
    this.importBatches = this.importBatches.filter((batch) => batch.id !== id);
  }

  @modelAction
  deleteAllImportBatches() {
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
        await rootStore.homeStore.reloadDisplayedFiles({ rootStore });
        await rootStore.tagStore.refreshAllTagCounts({ silent: true });

        const completedAt = (await trpc.completeImportBatch.mutate({ id }))?.data;
        this.getById(id).update({ completedAt });
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

        const res = await copyFileTo({
          deleteOnImport: this.deleteOnImport,
          fileObj: fileImport,
          targetDir: env.OUTPUT_DIR,
          tagIds: batch.tagIds,
        });

        const status = !res?.success ? "ERROR" : res?.isDuplicate ? "DUPLICATE" : "COMPLETE";
        const fileId = res.file?.id ?? null;
        const errorMsg = res.error ?? null;

        await trpc.updateFileImportByPath.mutate({
          batchId,
          filePath,
          errorMsg,
          fileId,
          status,
        });

        batch.updateImport(filePath, { errorMsg, fileId, status });
        return true;
      })
    );
  });

  @modelFlow
  startImportBatch = _async(function* (this: ImportStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const batch = this.getById(id);
        const startedAt = (await trpc.startImportBatch.mutate({ id }))?.data;
        batch.update({ startedAt });
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
