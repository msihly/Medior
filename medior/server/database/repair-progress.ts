import * as models from "medior/_generated/server/models";
import { fileLog } from "trabecula/utils/server";
import { runBackgroundExecution } from "medior/server/database/background-execution";
import { isServerStopping } from "medior/server/process-lifecycle";
import { dayjs } from "medior/utils/common";
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
  if (repairAbortControllers.has(repairId)) throw new Error("Repair is already active");

  cancelledRepairIds.delete(repairId);
  repairAbortControllers.set(repairId, new AbortController());

  const now = dayjs().toISOString();

  try {
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
  } catch (error) {
    repairAbortControllers.delete(repairId);
    throw error;
  }
};

export const cancelRepair = async (repairId: string) => {
  cancelledRepairIds.add(repairId);
  repairAbortControllers.get(repairId)?.abort(new RepairCancelledError());

  await updateRepairOperation(repairId, {
    completedAt: dayjs().toISOString(),
    message: "Repair cancelled by user.",
    status: "CANCELLED",
  });
};

export const pauseRepairs = () => Promise.all([...repairAbortControllers.keys()].map(cancelRepair));

export const finishRepair = async (repairId: string) => {
  repairAbortControllers.get(repairId)?.abort();
  cancelledRepairIds.delete(repairId);
  repairAbortControllers.delete(repairId);

  await updateRepairOperation(repairId, {
    completedAt: dayjs().toISOString(),
    message: "Database repair completed.",
    processedCount: 1,
    status: "COMPLETE",
  });
};

export const makeRepairReporter = (repairId: string, repairName: string) => {
  let progressMessage: string;

  const abortController =
    repairAbortControllers.get(repairId) ??
    repairAbortControllers.set(repairId, new AbortController()).get(repairId);

  const report = (message: string, status: RepairProgressStatus = "info", isTransient = false) => {
    if (!isTransient)
      fileLog(`[${repairName}] ${message}`, status === "error" ? { type: "error" } : undefined);

    socket.emitReliable("onRepairProgress", { message, repairId, status });
  };

  const checkCancelled = () => {
    if (cancelledRepairIds.has(repairId) || isServerStopping()) throw new RepairCancelledError();
  };

  const run = async <T>(action: () => Promise<T>) => {
    const progressTimer = setInterval(() => {
      if (progressMessage) report(progressMessage, "progress", true);
    }, 1000);

    try {
      checkCancelled();
      await updateRepairOperation(repairId, { message: `${repairName} started.` });

      const result = await runBackgroundExecution(action, abortController.signal, false);

      checkCancelled();
      await updateRepairOperation(repairId, { message: `${repairName} completed.` });

      return result;
    } catch (error) {
      if (abortController.signal.aborted || isServerStopping()) error = new RepairCancelledError();

      const message = error instanceof Error ? error.message : String(error);

      await updateRepairOperation(repairId, {
        completedAt: dayjs().toISOString(),
        error: error instanceof RepairCancelledError ? undefined : message,
        message,
        status: error instanceof RepairCancelledError ? "CANCELLED" : "ERROR",
      });

      report(
        error instanceof RepairCancelledError ? message : `Failed: ${message}`,
        error instanceof RepairCancelledError ? "cancelled" : "error",
      );

      throw error;
    } finally {
      clearInterval(progressTimer);
    }
  };

  const progress = (message: string) => {
    progressMessage = message;
  };

  return { checkCancelled, progress, report, run, signal: abortController.signal };
};
