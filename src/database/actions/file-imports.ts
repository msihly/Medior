import { useRef, useEffect } from "react";
import {
  copyFileTo,
  FileImportBatch,
  FileImportBatchModel,
  reloadDisplayedFiles,
  refreshAllTagCounts,
} from "database";
import { FileImport, ImportBatch, ImportStore, RootStore, useStores } from "store";
import { dayjs, PromiseQueue } from "utils";
import { OUTPUT_DIR } from "env";

export const FileInfoRefreshQueue = new PromiseQueue();

export const completeImportBatch = async ({
  rootStore,
  batch,
}: {
  rootStore: RootStore;
  batch: ImportBatch;
}) => {
  try {
    await reloadDisplayedFiles(rootStore);
    await refreshAllTagCounts(rootStore, true);

    const completedAt = dayjs().toISOString();
    await FileImportBatchModel.updateOne({ _id: batch.id }, { completedAt });
    batch.update({ completedAt });

    return { success: true, completedAt };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

export const createImportBatch = async ({
  createdAt,
  imports,
  importStore,
  tagIds = [],
}: {
  createdAt: string;
  imports: FileImport[];
  importStore: ImportStore;
  tagIds?: string[];
}) => {
  try {
    const batch = await FileImportBatchModel.create({
      createdAt,
      completedAt: null,
      imports,
      startedAt: null,
      tagIds,
    });

    importStore.addImportBatch({ createdAt, id: batch.id, imports, tagIds });

    return { success: true, batch };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

export const deleteImportBatch = async (importStore: ImportStore, id: string) => {
  try {
    await FileImportBatchModel.deleteOne({ _id: id });
    importStore.deleteImportBatch(id);
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

export const deleteAllImportBatches = async (importStore: ImportStore) => {
  try {
    await FileImportBatchModel.deleteMany({});
    importStore.deleteAllImportBatches();
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err?.message };
  }
};

export const getAllImportBatches = async () => {
  try {
    return (await FileImportBatchModel.find()).map((r) => {
      const batch = r.toJSON() as FileImportBatch;
      return { ...batch, imports: batch.imports as FileImport[] };
    });
  } catch (err) {
    console.error(err);
    return [];
  }
};

export const importFile = async ({
  batchId,
  filePath,
  importStore,
}: {
  batchId: string;
  filePath: string;
  importStore: ImportStore;
}) => {
  const batch = importStore.getById(batchId);
  const fileImport = batch?.getByPath(filePath);

  if (!batch || !fileImport) {
    console.error({
      batch: batch?.toString?.({ withData: true }),
      fileImport: fileImport?.toString?.({ withData: true }),
    });
    return false;
  }

  try {
    if (fileImport?.status !== "PENDING") return false;

    const res = await copyFileTo({
      fileObj: fileImport,
      importStore,
      targetDir: OUTPUT_DIR,
      tagIds: batch.tagIds,
    });

    const status = !res?.success ? "ERROR" : res?.isDuplicate ? "DUPLICATE" : "COMPLETE";
    const fileId = res.file?.id ?? null;
    const errorMsg = res.error ?? null;

    await FileImportBatchModel.updateOne(
      { _id: batch.id },
      {
        $set: {
          "imports.$[fileImport].errorMsg": errorMsg,
          "imports.$[fileImport].fileId": fileId,
          "imports.$[fileImport].status": status,
        },
      },
      { arrayFilters: [{ "fileImport.path": fileImport.path }] }
    );

    importStore.getById(batchId).updateImport(filePath, { errorMsg, fileId, status });

    return true;
  } catch (err) {
    console.error("importFile error:", err);
    return false;
  }
};

export const startImportBatch = async (batch: ImportBatch) => {
  try {
    const startedAt = dayjs().toISOString();
    await FileImportBatchModel.updateOne({ createdAt: batch.createdAt }, { startedAt });
    batch.update({ startedAt });
    return { success: true, startedAt };
  } catch (err) {
    console.error(err?.message);
    return { success: false, error: err?.message };
  }
};

export const useFileImportQueue = () => {
  const rootStore = useStores();
  const { importStore } = useStores();

  const currentImportPath = useRef<string>(null);

  const handlePhase = async () => {
    // console.debug("Import phase update:", {
    //   activeBatch: { ...importStore.activeBatch },
    //   currentPath: currentImportPath.current,
    //   incompleteBatches: importStore.incompleteBatches,
    // });

    const activeBatch = importStore.activeBatch;
    const nextPath = activeBatch?.nextImport?.path;

    if (currentImportPath.current === nextPath) {
      console.debug("Import phase skipped: current path matches next path.");
    } else if (nextPath) {
      console.debug("Importing file:", { ...activeBatch.nextImport });
      currentImportPath.current = nextPath;
      await importFile({ batchId: importStore.activeBatchId, filePath: nextPath, importStore });
    } else if (!activeBatch && importStore.incompleteBatches?.length > 0) {
      const batch = importStore.incompleteBatches[0];

      if (batch?.imports?.length > 0) {
        console.debug("Starting importBatch:", { ...batch.$ });
        await startImportBatch(batch);
        importStore.setActiveBatchId(batch.id);
      } else {
        console.debug("Import phase skipped: incomplete batch has no imports yet.");
        currentImportPath.current = null;
      }
    } else {
      currentImportPath.current = null;

      if (activeBatch && !activeBatch?.nextImport) {
        console.debug("Completing importBatch:", { ...activeBatch });
        await completeImportBatch({ rootStore, batch: activeBatch });
        importStore.setActiveBatchId(null);
      } else {
        // console.debug("Nothing happened.");
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
