import * as models from "medior/_generated/server/models";
import { fileLog } from "trabecula/utils/server";
import { dayjs, PromiseQueue } from "medior/utils/common";
import { leanModelToJson, socket } from "medior/utils/server";

export type RepairProgressStatus = "cancelled" | "error" | "info" | "progress" | "success";

class RepairCancelledError extends Error {
  constructor() {
    super("Repair cancelled by user.");
    this.name = "RepairCancelledError";
  }
}

const cancelledRepairIds = new Set<string>();
const repairAbortControllers = new Map<string, AbortController>();
const repairOperationQueue = new PromiseQueue();

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

const emitRepairOperation = async (id: string) => {
  const operation = leanModelToJson<models.BackgroundOperationSchema>(
    await models.BackgroundOperationModel.findById(id).lean(),
  );
  socket.emit("onBackgroundOperationUpdated", { id, updates: operation });
};

const updateRepairOperation = async (
  repairId: string,
  updates: Partial<models.BackgroundOperationSchema>,
) => {
  const operation = await models.BackgroundOperationModel.findOneAndUpdate(
    { status: "RUNNING", targetIds: repairId, type: "repair" },
    { $set: { ...updates, dateModified: dayjs().toISOString() } },
    { new: true },
  );
  if (operation) await emitRepairOperation(operation._id.toString());
};

export const startRepair = async (repairId: string) => {
  cancelledRepairIds.delete(repairId);
  repairAbortControllers.set(repairId, new AbortController());
  const now = dayjs().toISOString();
  const operation = await models.BackgroundOperationModel.create({
    dateCreated: now,
    dateModified: now,
    label: "Database repair",
    processedCount: 0,
    startedAt: now,
    status: "RUNNING",
    targetIds: [repairId],
    totalCount: 1,
    type: "repair",
  });
  await emitRepairOperation(operation._id.toString());
};

export const cancelRepair = async (repairId: string) => {
  cancelledRepairIds.add(repairId);
  repairAbortControllers.get(repairId)?.abort(new RepairCancelledError());
  await repairOperationQueue.resolve();
  await updateRepairOperation(repairId, {
    completedAt: dayjs().toISOString(),
    message: "Repair cancelled by user.",
    status: "CANCELLED",
  });
};

export const finishRepair = async (repairId: string) => {
  cancelledRepairIds.delete(repairId);
  repairAbortControllers.delete(repairId);
  await repairOperationQueue.resolve();
  await updateRepairOperation(repairId, {
    completedAt: dayjs().toISOString(),
    message: "Database repair completed.",
    processedCount: 1,
    status: "COMPLETE",
  });
};

export const makeRepairReporter = (repairId: string, repairName: string) => {
  const abortController =
    repairAbortControllers.get(repairId) ??
    repairAbortControllers.set(repairId, new AbortController()).get(repairId);
  const report = (message: string, status: RepairProgressStatus = "info", isTransient = false) => {
    if (!isTransient)
      fileLog(`[${repairName}] ${message}`, status === "error" ? { type: "error" } : undefined);
    socket.emitReliable("onRepairProgress", { message, repairId, status });
    repairOperationQueue
      .add(() =>
        updateRepairOperation(repairId, {
          ...(status === "error"
            ? { completedAt: dayjs().toISOString(), error: message, status: "ERROR" }
            : status === "cancelled"
              ? { completedAt: dayjs().toISOString(), status: "CANCELLED" }
              : {}),
          message,
        }),
      )
      .catch((error) =>
        fileLog(`Failed to persist repair progress: ${error.message}`, { type: "error" }),
      );
  };

  const checkCancelled = () => {
    if (cancelledRepairIds.has(repairId)) throw new RepairCancelledError();
  };

  const run = async <T>(action: () => Promise<T>) => {
    try {
      checkCancelled();
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report(
        error instanceof RepairCancelledError ? message : `Failed: ${message}`,
        error instanceof RepairCancelledError ? "cancelled" : "error",
      );
      throw error;
    }
  };

  return { checkCancelled, report, run, signal: abortController.signal };
};
