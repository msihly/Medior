import { createHash } from "crypto";
import { Schema, Types } from "mongoose";
import { PersistenceModel } from "medior/server/database/persistence";

export const IMPORT_ENTRY_CHECKPOINT_ID = "checkpoint:import-entries:v1";
export const IMPORT_ENTRY_MIGRATION_ID = new Types.ObjectId(
  createHash("sha256").update("file-import-entries-v1").digest("hex").slice(0, 24),
);

let importEntriesReady = false;

export const areImportEntriesReady = async () => {
  if (
    !importEntriesReady &&
    (await PersistenceModel.collection.findOne({
      _id: IMPORT_ENTRY_CHECKPOINT_ID,
      complete: true,
      recordType: "Checkpoint",
    }))
  )
    importEntriesReady = true;

  return importEntriesReady;
};

export const assertImportEntriesReady = async () => {
  if (!(await areImportEntriesReady()))
    throw new Error(
      "Import history is upgrading in the background. This action will be available when it finishes. Check Activity for progress or Retry; library browsing remains available.",
    );
};

/** Legacy arrays and partially copied entries must never escape through normal model access. */
export const importEntriesPlugin = (schema: Schema) => {
  schema.pre(/^(find|count|distinct|update|delete|replace)/, async function () {
    await assertImportEntriesReady();
  });

  schema.pre("aggregate", async function () {
    await assertImportEntriesReady();
  });

  schema.pre("insertMany", async function () {
    await assertImportEntriesReady();
  });

  schema.pre("save", async function () {
    await assertImportEntriesReady();
  });
};
