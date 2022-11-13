import { useRef, useEffect } from "react";
import { copyFileTo, FileImportBatch, FileImportBatchModel } from "database";
import { FileImport, ImportStore, useStores } from "store";
import { dayjs, PromiseQueue } from "utils";
import { OUTPUT_DIR } from "env";

export const FileInfoRefreshQueue = new PromiseQueue();

export const completeImportBatch = async (addedAt: string) => {
  try {
    const completedAt = dayjs().toISOString();
    await FileImportBatchModel.updateOne({ addedAt }, { completedAt });
    return { success: true, completedAt };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const createImportBatch = async (
  addedAt: string,
  imports: FileImport[],
  tagIds: string[]
) => {
  try {
    const batch = await FileImportBatchModel.create({
      addedAt,
      completedAt: null,
      imports,
      startedAt: null,
      tagIds,
    });

    return { success: true, batch };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const deleteImportBatch = async (id: string) => {
  try {
    await FileImportBatchModel.deleteOne({ _id: id });
    return { success: true };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const getAllImportBatches = async () => {
  try {
    return (await FileImportBatchModel.find()).map((r) => {
      const batch = r.toJSON() as FileImportBatch;
      return { ...batch, imports: batch.imports as FileImport[] };
    });
  } catch (err) {
    console.error(err?.message ?? err);
    return [];
  }
};

export const importFile = async (
  importStore: ImportStore,
  addedAt: string,
  fileImport: FileImport
) => {
  if (!addedAt || fileImport?.status !== "PENDING") return false;
  const batch = importStore.getByAddedAt(addedAt);

  try {
    const res = await copyFileTo({
      fileObj: fileImport,
      importStore,
      targetDir: OUTPUT_DIR,
      tagIds: batch.tagIds,
    });
    console.debug("CopyFileTo res:", res);
    if (!res?.success) throw new Error(res?.error);

    const status = !res?.success ? "ERROR" : res?.isDuplicate ? "DUPLICATE" : "COMPLETE";

    await FileImportBatchModel.updateOne(
      { addedAt },
      { $set: { "imports.$[fileImport].status": status } },
      { arrayFilters: [{ "fileImport.path": fileImport.path }] }
    );

    return true;
  } catch (err) {
    console.log("importFile error:", err);

    await FileImportBatchModel.updateOne(
      { addedAt },
      { $set: { "imports.$[fileImport].status": "ERROR" } },
      { arrayFilters: [{ "fileImport.path": fileImport.path }] }
    );

    return false;
  }
};

export const startImportBatch = async (addedAt: string) => {
  try {
    const startedAt = dayjs().toISOString();
    await FileImportBatchModel.updateOne({ addedAt }, { startedAt });
    return { success: true, startedAt };
  } catch (err) {
    console.error(err?.message ?? err);
    return { success: false, error: err?.message ?? err };
  }
};

export const useFileImportQueue = () => {
  const { importStore } = useStores();

  const currentImportPath = useRef<string>(null);

  const handlePhase = async () => {
    console.debug("Import phase update:", {
      activeBatch: { ...importStore.activeBatch },
      currentPath: currentImportPath.current,
      incompleteBatches: importStore.incompleteBatches,
    });

    const activeBatch = importStore.activeBatch;
    const nextPath = activeBatch?.nextImport?.path;

    if (currentImportPath.current === nextPath) {
      console.debug("Import phase skipped: current path matches next path.");
    } else if (activeBatch?.nextImport) {
      console.debug("Importing file:", { ...activeBatch?.nextImport });

      await importFile(importStore, activeBatch?.addedAt, activeBatch?.nextImport);
      currentImportPath.current = nextPath;
    } else if (!activeBatch && importStore.incompleteBatches?.length > 0) {
      const batch = importStore.incompleteBatches[0];

      if (batch?.imports?.length > 0) {
        console.debug("Starting importBatch:", batch.addedAt);
        await startImportBatch(batch.addedAt);
        importStore.setActiveBatchId(batch.id);
      } else {
        console.debug("Import phase skipped: incomplete batch has no imports yet.");
        currentImportPath.current = null;
      }
    } else {
      currentImportPath.current = null;

      if (activeBatch && !activeBatch?.nextImport) {
        console.debug("Completing importBatch:", activeBatch?.addedAt);
        await completeImportBatch(activeBatch?.addedAt);
        importStore.setActiveBatchId(null);
      } else {
        console.debug("Nothing happened.");
      }
    }
  };

  useEffect(() => {
    handlePhase();
  }, [handlePhase, importStore.activeBatch?.nextImport, importStore.incompleteBatches]);
};

export const watchImportBatchModel = (importStore: ImportStore) => {
  FileImportBatchModel.watch(null, { fullDocument: "updateLookup" }).on("change", (data: any) => {
    const id = Buffer.from(data.documentKey?._id).toString();
    console.debug(`[FileImportBatch] ${id}:`, data);

    if (data.operationType === "delete") importStore.deleteImportBatch(id);
    else {
      const batch = {
        ...data.fullDocument,
        id,
        imports: data.fullDocument.imports.map(({ _id, ...rest }) => ({
          ...rest,
          id: Buffer.from(_id).toString(),
        })),
      };

      delete batch._id;
      delete batch.__v;

      if (data.operationType === "insert") importStore.addImportBatch(batch);
      else if (data.operationType === "update") importStore.getById(id).update(batch);
    }
  });
};
