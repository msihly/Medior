import {
  applySnapshot,
  arrayActions,
  model,
  Model,
  modelAction,
  ModelCreationData,
  prop,
} from "mobx-keystone";
import { FileImport, ImportBatch } from ".";
import { computed } from "mobx";

@model("mediaViewer/ImportStore")
export class ImportStore extends Model({
  activeBatchAddedAt: prop<string>(null).withSetter(),
  importBatches: prop<ImportBatch[]>(() => []),
  isImporting: prop<boolean>(false).withSetter(),
}) {
  @modelAction
  addImportToBatch(addedAt: string, fileImport: FileImport) {
    const batch = this.getByAddedAt(addedAt);
    if (!batch) throw new Error(`Can't find ImportBatch with addedAt = ${addedAt}`);
    batch.imports.push(new FileImport(fileImport));
  }

  @modelAction
  addImportBatch({ addedAt, id, tagIds = [] }: { addedAt: string; id: string; tagIds?: string[] }) {
    this.importBatches.push(
      new ImportBatch({
        addedAt,
        completedAt: null,
        id,
        imports: [],
        startedAt: null,
        tagIds,
      })
    );
  }

  @modelAction
  deleteImportBatch(addedAt: string) {
    this.importBatches = this.importBatches.filter((batch) => batch.addedAt !== addedAt);
  }

  @modelAction
  overwrite(importBatches: ImportBatchInput[]) {
    this.importBatches = importBatches.map(
      (batch) =>
        new ImportBatch({ ...batch, imports: batch.imports.map((imp) => new FileImport(imp)) })
    );
  }

  getByAddedAt(addedAt: string) {
    return this.importBatches.find((batch) => batch.addedAt === addedAt);
  }

  getById(id: string) {
    return this.importBatches.find((batch) => batch.id === id);
  }

  listByTagId(tagId: string) {
    return this.importBatches.filter((batch) => batch.tagIds.includes(tagId));
  }

  @computed
  get batches() {
    return [...this.importBatches].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }

  @computed
  get activeBatch() {
    return this.getByAddedAt(this.activeBatchAddedAt);
  }

  @computed
  get completedBatches() {
    return this.batches.filter((batch) => batch.completedAt?.length > 0);
  }

  @computed
  get incompleteBatches() {
    return this.batches.filter((batch) => !batch.completedAt?.length);
  }
}

type ImportBatchInput = Omit<ModelCreationData<ImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};
