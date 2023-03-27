import { model, Model, modelAction, ModelCreationData, prop } from "mobx-keystone";
import { FileImport, ImportBatch } from ".";
import { computed } from "mobx";
import { uniqueArrayMerge } from "utils";

@model("mediaViewer/ImportStore")
export class ImportStore extends Model({
  activeBatchId: prop<string>(null).withSetter(),
  deleteOnImport: prop<boolean>(false).withSetter(),
  importBatches: prop<ImportBatch[]>(() => []),
}) {
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

  getByCreatedAt(createdAt: string) {
    return this.importBatches.find((batch) => batch.createdAt === createdAt);
  }

  getById(id: string) {
    return this.importBatches.find((batch) => batch.id === id);
  }

  listByTagId(tagId: string) {
    return this.importBatches.filter((batch) => batch.tagIds.includes(tagId));
  }

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

type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};
