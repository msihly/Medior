import { copyFileTo, FileImportBatch, FileImportBatchModel } from "database";
import { RootStore } from "store";
import { ImportStore, FileImportInstance, FileImportSnapshot } from "store/imports";
import { PromiseQueue } from "utils";
import dayjs from "dayjs";
import { OUTPUT_DIR } from "env";

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

    importStore.addImportBatch(addedAt);

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
    const { fileStore, importStore } = rootStore;

    if (!addedAt || fileImport?.status !== "PENDING") return;

    const batch = importStore.getByAddedAt(addedAt);

    const res = await copyFileTo(fileImport, OUTPUT_DIR);

    if (!res?.success) console.error(res?.error);
    else if (!res?.isDuplicate) fileStore.addFiles(res?.file);

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
  } catch (err) {
    console.log("importFile error:", err);
  }
};

export const startImportBatch = async (importStore: ImportStore, addedAt: string) => {
  try {
    const batch = importStore.getByAddedAt(addedAt);
    const startedAt = dayjs().toISOString();

    await FileImportBatchModel.updateOne({ addedAt: batch.addedAt }, { startedAt });

    batch.setStartedAt(startedAt);
    importStore.setIsImporting(true);

    return { success: true, batch, startedAt };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};
