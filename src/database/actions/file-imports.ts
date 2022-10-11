import { useRef, useEffect } from "react";
import { copyFileTo, FileImportBatch, FileImportBatchModel } from "database";
import { RootStore, useStores } from "store";
import { ImportStore, FileImportInstance, FileImportSnapshot } from "store/imports";
import { dayjs, PromiseQueue } from "utils";
import { OUTPUT_DIR } from "env";

export const FileInfoRefreshQueue = new PromiseQueue();

export const ImportQueue = new PromiseQueue();

export const addImportToBatch = async (
  importStore: ImportStore,
  addedAt: string,
  fileImport: FileImportSnapshot
) => {
  try {
    const batch = importStore.getByAddedAt(addedAt);

    await FileImportBatchModel.updateOne({ addedAt }, { imports: [...batch.imports, fileImport] });
    importStore.addImportToBatch(addedAt, fileImport);

    return { success: true, batch };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const completeImportBatch = async (importStore: ImportStore, addedAt: string) => {
  try {
    const batch = importStore.getByAddedAt(addedAt);
    const completedAt = dayjs().toISOString();

    await FileImportBatchModel.updateOne({ addedAt: batch.addedAt }, { completedAt });

    batch.setCompletedAt(completedAt);
    importStore.setActiveBatchAddedAt(null);
    importStore.setIsImporting(false);

    return { success: true, batch, completedAt };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const createImportBatch = async (
  importStore: ImportStore,
  addedAt: string,
  tagIds: string[]
) => {
  try {
    const batch = await FileImportBatchModel.create({
      addedAt,
      completedAt: null,
      imports: [],
      startedAt: null,
      tagIds,
    });

    importStore.addImportBatch({ addedAt, id: batch.id, tagIds });

    return { success: true, batch };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const deleteImportBatch = async (importStore: ImportStore, addedAt: string) => {
  try {
    await FileImportBatchModel.deleteOne({ addedAt });

    importStore.deleteImportBatch(addedAt);

    return { success: true };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const getAllImportBatches = async () => {
  try {
    const importBatches = (await FileImportBatchModel.find()).map(
      (r) => r.toJSON() as FileImportBatch
    );
    return importBatches;
  } catch (err) {
    console.error(err?.message ?? err);
    return [];
  }
};

export const importFile = async (
  rootStore: RootStore,
  addedAt: string,
  fileImport: FileImportInstance
) => {
  try {
    const { importStore } = rootStore;
    if (!addedAt || fileImport?.status !== "PENDING") return;

    const batch = importStore.getByAddedAt(addedAt);

    const res = await copyFileTo({
      fileObj: fileImport,
      targetDir: OUTPUT_DIR,
      tagIds: batch.tagIds,
    });
    if (!res?.success) throw new Error(res?.error);

    const status = !res?.success ? "ERROR" : res?.isDuplicate ? "DUPLICATE" : "COMPLETE";

    await FileImportBatchModel.updateOne(
      { addedAt },
      {
        imports: batch.imports.map((imp) =>
          imp.path === fileImport.path ? { ...imp, status } : imp
        ),
      }
    );

    fileImport.update({ status });
    return true;
  } catch (err) {
    console.log("importFile error:", err);
    return false;
  }
};

export const startImportBatch = async (importStore: ImportStore, addedAt: string) => {
  try {
    const batch = importStore.getByAddedAt(addedAt);
    const startedAt = dayjs().toISOString();

    await FileImportBatchModel.updateOne({ addedAt: batch.addedAt }, { startedAt });

    batch.setStartedAt(startedAt);
    importStore.setActiveBatchAddedAt(addedAt);
    importStore.setIsImporting(true);

    return { success: true, batch, startedAt };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const useFileImportQueue = () => {
  const rootStore = useStores();
  const { importStore } = useStores();

  const currentImportPath = useRef<string>(null);

  useEffect(() => {
    const handlePhase = async () => {
      if (!importStore.activeBatch && importStore.incompleteBatches?.length > 0) {
        await startImportBatch(importStore, importStore.incompleteBatches[0].addedAt);
      } else if (importStore.activeBatch?.nextImport) {
        if (!importStore.isImporting)
          await startImportBatch(importStore, importStore.activeBatch?.addedAt);

        if (currentImportPath.current === importStore.activeBatch?.nextImport?.path) return;
        currentImportPath.current = importStore.activeBatch?.nextImport?.path;

        await importFile(
          rootStore,
          importStore.activeBatch?.addedAt,
          importStore.activeBatch?.nextImport
        );
      } else if (importStore.isImporting) {
        if (!importStore.activeBatch) importStore.setIsImporting(false);
        else if (importStore.activeBatch.imports?.length > 0)
          await completeImportBatch(importStore, importStore.activeBatch?.addedAt);

        currentImportPath.current = null;
      }
    };

    handlePhase();
  }, [importStore.activeBatch?.nextImport, importStore.incompleteBatches, importStore.isImporting]);
};
