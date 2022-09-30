import { applySnapshot, cast, Instance, SnapshotOrInstance, types } from "mobx-state-tree";
import { ImportBatchModel } from "./import-batch";
import { FileImportInstance, FileImportSnapshot, ImportBatch } from ".";
import { dayjs } from "utils";

export const defaultImportStore = {
  importBatches: [],
  isImporting: false,
};

export const ImportStoreModel = types
  .model("FileStore")
  .props({
    activeBatchAddedAt: types.maybeNull(types.string),
    importBatches: types.array(ImportBatchModel),
    isImporting: types.boolean,
  })
  .views((self) => ({
    get batches(): ImportBatch[] {
      return [...self.importBatches].sort((a, b) =>
        dayjs(a.addedAt).isBefore(b.addedAt) ? 1 : -1
      );
    },
    getByAddedAt: (addedAt: string) => {
      return self.importBatches.find((batch) => batch.addedAt === addedAt);
    },
  }))
  .views((self) => ({
    get activeBatch(): ImportBatch {
      return self.getByAddedAt(self.activeBatchAddedAt);
    },
    get completedBatches(): ImportBatch[] {
      return self.batches.filter((batch) => batch.completedAt?.length > 0);
    },
    get incompleteBatches(): ImportBatch[] {
      return self.batches.filter((batch) => !batch.completedAt?.length);
    },
  }))
  .actions((self) => ({
    addImportToBatch: (addedAt: string, fileImport: FileImportSnapshot) => {
      const batch = self.importBatches.find((batch) => batch.addedAt === addedAt);
      if (!batch)
        throw new Error(
          `ImportBatch (addedAt: ${addedAt}) does not exist in importStore.addImportToBatch`
        );
      batch.imports.push(fileImport);
    },
    addImportBatch: (addedAt: string, tagIds = [], ...fileImports: FileImportInstance[]) => {
      self.importBatches.push({
        addedAt,
        completedAt: null,
        imports: fileImports,
        startedAt: null,
        tagIds,
      });
    },
    deleteImportBatch: (addedAt: string) => {
      self.importBatches = cast(self.importBatches.filter((batch) => batch.addedAt !== addedAt));
    },
    overwrite: (importBatches: SnapshotOrInstance<ImportBatch>[]) => {
      self.importBatches = cast(importBatches);
    },
    reset: () => {
      applySnapshot(self, defaultImportStore);
    },
    setActiveBatchAddedAt: (addedAt: string) => {
      self.activeBatchAddedAt = addedAt;
    },
    setIsImporting: (isImporting: boolean) => {
      self.isImporting = isImporting;
    },
  }));

export interface ImportStore extends Instance<typeof ImportStoreModel> {}
