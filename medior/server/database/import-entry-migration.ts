import {
  BackgroundOperationModel,
  FileImportBatchModel,
  FileImportModel,
  FileImportSchema,
} from "medior/_generated/server/models";
import { Types } from "mongoose";
import { fileLog } from "trabecula/utils/server";
import {
  emitBackgroundOperation,
  setBackgroundOperationStatus,
} from "medior/server/database/actions/background-operations";
import { checkBackgroundExecution } from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";
import {
  areImportEntriesReady,
  IMPORT_ENTRY_CHECKPOINT_ID,
  IMPORT_ENTRY_MIGRATION_ID,
} from "medior/server/database/import-entry-state";
import { PersistenceModel } from "medior/server/database/persistence";
import { dayjs } from "medior/utils/common";
import { socket } from "medior/utils/server";
import { getCommonSourceFolder } from "medior/utils/server/source-folders";

interface ImportEntryCheckpoint {
  offset: number;
  processedCount: number;
  processedSize: number;
  size: number;
  sourceFolderPath: null | string;
}

const MIGRATION_PAGE_SIZE = 1000;

/** Copy entries within storage; publish a batch only after its last durable checkpoint. */
export const runImportEntryMigrationQueue = async () => {
  if (await areImportEntriesReady()) return true;

  const id = String(IMPORT_ENTRY_MIGRATION_ID);
  const operation = await BackgroundOperationModel.findOneAndUpdate(
    { _id: IMPORT_ENTRY_MIGRATION_ID },
    {
      $setOnInsert: {
        dateCreated: dayjs().toISOString(),
        dateModified: dayjs().toISOString(),
        label: "Import history upgrade",
        message: "Preparing import history in the background. Library browsing remains available.",
        processedCount: 0,
        status: "PENDING",
        targetIds: [],
        totalCount: 0,
        type: "importEntryMigration",
      },
    },
    { new: true, upsert: true },
  ).lean();

  if (!["PENDING", "RUNNING"].includes(operation.status)) return false;

  const session = getBackgroundSession();
  let completedBatches = 0;
  let copiedEntries = 0;
  let lastProgressAt = 0;

  const report = async (message: string) => {
    checkBackgroundExecution();
    await BackgroundOperationModel.updateOne(
      { _id: IMPORT_ENTRY_MIGRATION_ID, status: "RUNNING" },
      { $set: { dateModified: dayjs().toISOString(), message, processedCount: copiedEntries } },
    );

    await emitBackgroundOperation(id);
    fileLog(`[Import history upgrade] ${message}`);
  };

  const started = await setBackgroundOperationStatus(id, "RUNNING", {
    error: null,
    processedCount: 0,
  });

  if (started?.status !== "RUNNING") return false;

  // Only the merge key is required here. The existing background index queue handles the rest.
  await report("Preparing the import entry index. Library browsing remains available.");
  await FileImportModel.collection.createIndex({ batchId: 1, index: 1 }, { session, unique: true });
  checkBackgroundExecution();
  await report("Looking for import batches to upgrade...");

  const batches = FileImportBatchModel.collection.find<{
    _id: Types.ObjectId;
    entryMigration?: ImportEntryCheckpoint;
  }>(
    { imports: { $exists: true } },
    {
      batchSize: 20,
      hint: { _id: 1 },
      projection: { _id: 1, entryMigration: 1 },
      session,
      sort: { _id: 1 },
    },
  );

  try {
    for await (const batch of batches) {
      let checkpoint: ImportEntryCheckpoint = batch.entryMigration ?? {
        offset: 0,
        processedCount: 0,
        processedSize: 0,
        size: 0,
        sourceFolderPath: null,
      };

      while (true) {
        checkBackgroundExecution();

        // Return only the small fields needed for counters and common-folder calculation.
        const [page] = await FileImportBatchModel.collection
          .aggregate<{
            entries: Pick<FileImportSchema, "path" | "size" | "status">[];
            total: number;
          }>(
            [
              { $match: { _id: batch._id } },
              {
                $project: {
                  _id: 0,
                  entries: {
                    $map: {
                      as: "entry",
                      in: {
                        path: "$$entry.path",
                        size: { $ifNull: ["$$entry.size", 0] },
                        status: { $ifNull: ["$$entry.status", "PENDING"] },
                      },
                      input: {
                        $slice: [
                          { $ifNull: ["$imports", []] },
                          checkpoint.offset,
                          MIGRATION_PAGE_SIZE,
                        ],
                      },
                    },
                  },
                  total: { $size: { $ifNull: ["$imports", []] } },
                },
              },
            ],
            { session },
          )
          .toArray();

        if (!page) throw new Error("Import batch disappeared during its history upgrade.");

        if (checkpoint.offset > page.total)
          throw new Error("Import history checkpoint exceeds the source batch size.");

        if (Date.now() - lastProgressAt >= 5000) {
          await report(
            `${completedBatches.toLocaleString()} batches upgraded this run; current batch ${checkpoint.offset.toLocaleString()} / ${page.total.toLocaleString()} entries. Library browsing remains available.`,
          );
          lastProgressAt = Date.now();
        }

        if (!page.entries.length) break;

        await FileImportBatchModel.collection
          .aggregate(
            [
              { $match: { _id: batch._id } },
              {
                $project: {
                  imports: { $slice: ["$imports", checkpoint.offset, MIGRATION_PAGE_SIZE] },
                },
              },
              { $unwind: { includeArrayIndex: "index", path: "$imports" } },
              {
                $replaceWith: {
                  $mergeObjects: [
                    "$imports",
                    {
                      batchId: "$_id",
                      index: { $add: [checkpoint.offset, "$index"] },
                      progressRevision: 0,
                      status: { $ifNull: ["$imports.status", "PENDING"] },
                      tagIds: { $ifNull: ["$imports.tagIds", []] },
                    },
                  ],
                },
              },
              { $unset: ["_id", "id"] },
              {
                $merge: {
                  into: FileImportModel.collection.name,
                  on: ["batchId", "index"],
                  whenMatched: "keepExisting",
                  whenNotMatched: "insert",
                },
              },
            ],
            { session, writeConcern: { j: true, w: "majority" } },
          )
          .toArray();

        checkBackgroundExecution();

        const folder = getCommonSourceFolder(page.entries.map(({ path }) => path));
        const processed = page.entries.filter(({ status }) => status !== "PENDING");

        checkpoint = {
          offset: checkpoint.offset + page.entries.length,
          processedCount: checkpoint.processedCount + processed.length,
          processedSize:
            checkpoint.processedSize + processed.reduce((total, entry) => total + entry.size, 0),
          size: checkpoint.size + page.entries.reduce((total, entry) => total + entry.size, 0),
          sourceFolderPath: !checkpoint.offset
            ? folder
            : checkpoint.sourceFolderPath && folder
              ? getCommonSourceFolder([checkpoint.sourceFolderPath, folder], true)
              : null,
        };

        copiedEntries += page.entries.length;

        // The final header update is itself the checkpoint for the last page.
        if (checkpoint.offset === page.total) break;

        // A failed merge leaves the old checkpoint intact; retry keeps already copied entries.
        await FileImportBatchModel.collection.updateOne(
          { _id: batch._id },
          { $set: { entryMigration: checkpoint } },
          { session, writeConcern: { j: true, w: "majority" } },
        );
      }

      checkBackgroundExecution();
      await FileImportBatchModel.collection.updateOne(
        { _id: batch._id },
        {
          $set: {
            fileCount: checkpoint.offset,
            isReady: true,
            processedCount: checkpoint.processedCount,
            processedSize: checkpoint.processedSize,
            progressRevision: 0,
            size: checkpoint.size,
            sourceFolderPath: checkpoint.sourceFolderPath,
          },
          $unset: { entryMigration: "", imports: "" },
        },
        { session, writeConcern: { j: true, w: "majority" } },
      );
      completedBatches++;
    }
  } finally {
    await batches.close();
  }

  checkBackgroundExecution();
  await PersistenceModel.collection.updateOne(
    { _id: IMPORT_ENTRY_CHECKPOINT_ID, recordType: "Checkpoint" },
    { $set: { complete: true } },
    { session, upsert: true, writeConcern: { j: true, w: "majority" } },
  );

  await setBackgroundOperationStatus(id, "COMPLETE", {
    message: `Import history is ready. ${completedBatches.toLocaleString()} batches upgraded this run.`,
    processedCount: copiedEntries,
    totalCount: copiedEntries,
  });

  socket.emit("onImporterStatusUpdated");

  return true;
};
