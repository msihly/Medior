import {
  BackgroundOperationModel,
  BackgroundOperationSchema,
} from "medior/_generated/server/models";
import {
  canRunBackgroundQueues,
  completeBackgroundOperationTargets,
  completeEmptyBackgroundOperation,
  failBackgroundOperation,
  makeBackgroundOperationRunner,
  queueBackgroundOperation,
  setBackgroundOperationStatus,
} from "medior/server/database/actions/background-operations";
import {
  backgroundExecution,
  checkBackgroundExecution,
  runBackgroundExecution,
} from "medior/server/database/background-execution";
import { FileOperationModel, finishFileOperation } from "medior/server/database/file-operations";
import { metadataWriteOptions } from "medior/server/database/metadata-work";
import { leanModelToJson } from "medior/utils/server";
import { runConcurrent, workSignal } from "medior/utils/server/work-signal";

const processImportCleanup = async () => {
  while (canRunBackgroundQueues()) {
    let operation: BackgroundOperationSchema;

    try {
      operation = leanModelToJson<BackgroundOperationSchema>(
        await BackgroundOperationModel.findOne({
          status: { $in: ["PENDING", "RUNNING"] },
          type: "importCleanup",
        })
          .select({ failures: 1, processedCount: 1, status: 1, targetIds: 1, totalCount: 1 })
          .sort({ dateCreated: 1 })
          .lean(),
      );

      if (!operation) return;

      backgroundExecution.getStore().operationId = operation.id;

      const failedIds = new Set(operation.failures?.map((failure) => failure.targetId));
      const ids = operation.targetIds.filter((id) => !failedIds.has(id)).slice(0, 32);

      if (!ids.length) {
        if (failedIds.size)
          await failBackgroundOperation(
            operation.id,
            [...failedIds],
            `${failedIds.size} imports could not be cleaned up. See the individual failures below.`,
          );
        else await completeEmptyBackgroundOperation(operation.id, "Import cleanup completed.");

        continue;
      }

      if (operation.status === "PENDING")
        await setBackgroundOperationStatus(operation.id, "RUNNING");

      const completedIds: string[] = [];
      const failures: BackgroundOperationSchema["failures"] = [];

      const cleanTarget = async (id: string) => {
        try {
          // Paused targets stay queued for the next pass.
          const result = await finishFileOperation(id);
          checkBackgroundExecution();

          if (result === "DONE") completedIds.push(id);
          else if (result === "WAITING") {
            const remaining = await FileOperationModel.findById(id)
              .select({ emptyFolderPath: 1, sourcePath: 1 })
              .lean();

            if (!remaining) completedIds.push(id);
            else
              failures.push({
                message: `Cleanup for ${remaining.sourcePath ?? remaining.emptyFolderPath} is waiting on files still referenced by the library or a tag thumbnail.`,
                targetId: id,
              });
          }
        } catch (error) {
          checkBackgroundExecution();
          failures.push({ message: error.message, targetId: id });
        }
      };

      await runConcurrent(ids, 4, cleanTarget, workSignal.getStore(), (run) =>
        runBackgroundExecution(run, workSignal.getStore(), false),
      );

      checkBackgroundExecution();

      if (failures.length)
        await BackgroundOperationModel.updateOne(
          { _id: operation.id, status: { $in: ["PENDING", "RUNNING"] } },
          { $push: { failures: { $each: failures } } },
          metadataWriteOptions(),
        );

      await completeBackgroundOperationTargets(
        operation.id,
        completedIds,
        `Cleaned up ${operation.processedCount + completedIds.length} of ${operation.totalCount} imports.`,
      );
    } catch (error) {
      if (!canRunBackgroundQueues()) return;

      if (!operation) throw error;

      await setBackgroundOperationStatus(operation.id, "ERROR", { error: error.message });
    }
  }
};

const runImportCleanup = makeBackgroundOperationRunner(
  "import source cleanup",
  processImportCleanup,
);

/**
 * Queues committed import operations whose sources and leftovers still need deleting.
 * Queueing ignores the caller's cancellation so a committed operation is never left unqueued.
 */
export const queueImportCleanup = (operationIds: string[]) =>
  backgroundExecution.exit(async () => {
    await queueBackgroundOperation({
      label: "Import source cleanup",
      targetIds: operationIds,
      type: "importCleanup",
    });

    runImportCleanup();
  });
