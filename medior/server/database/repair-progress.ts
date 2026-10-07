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
const repairChildren = new Map<string, Set<() => Promise<unknown>>>();

export const startRepairChild = async <T>(
  repairId: string,
  start: () => Promise<T>,
  cancel: (child: T) => Promise<unknown>,
) => {
  const controller = repairAbortControllers.get(repairId);

  if (!controller) throw new Error("Repair is no longer active.");

  controller.signal.throwIfAborted();

  let started = false;
  const pending = start().then((child) => {
    started = true;

    return child;
  });
  let cancellation: Promise<unknown>;

  const stop = () =>
    (cancellation ??= pending
      .then(cancel, () => undefined)
      .catch((error) => {
        cancellation = undefined;

        throw error;
      }));

  if (!repairChildren.has(repairId)) repairChildren.set(repairId, new Set());

  repairChildren.get(repairId).add(stop);

  try {
    const child = await pending;

    if (controller.signal.aborted) {
      await stop();
      controller.signal.throwIfAborted();
    }

    return child;
  } catch (error) {
    if (!started) repairChildren.get(repairId)?.delete(stop);

    throw error;
  }
};

const cancelRepairChildren = async (repairId: string) => {
  const children = repairChildren.get(repairId);
  const callbacks = [...(children ?? [])];
  const results = await Promise.allSettled(callbacks.map((cancel) => cancel()));
  const failure = results.find((result) => result.status === "rejected");

  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") children.delete(callbacks[index]);
  }

  if (!children?.size) repairChildren.delete(repairId);

  if (failure?.status === "rejected") throw failure.reason;
};

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
  retryFailed = false,
) => {
  const operation = await models.BackgroundOperationModel.findOneAndUpdate(
    {
      status: retryFailed ? { $in: ["ERROR", "RUNNING"] } : "RUNNING",
      targetIds: repairId,
      type: "repair",
    },
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

  try {
    await cancelRepairChildren(repairId);
  } catch (error) {
    const message = `Child cancellation failed: ${error?.message ?? String(error)}`;

    await updateRepairOperation(repairId, { error: message, message, status: "ERROR" }, true);

    throw error;
  }

  await updateRepairOperation(
    repairId,
    {
      completedAt: dayjs().toISOString(),
      error: null,
      message: "Repair cancelled by user.",
      status: "CANCELLED",
    },
    true,
  );
};

export const pauseRepairs = () => Promise.all([...repairAbortControllers.keys()].map(cancelRepair));

export const finishRepair = async (repairId: string, error?: string) => {
  let cancelled = cancelledRepairIds.has(repairId);
  let cancellationFailed = false;

  repairAbortControllers.get(repairId)?.abort();

  if (error || cancelled) {
    try {
      await cancelRepairChildren(repairId);
    } catch (cancelError) {
      cancellationFailed = true;
      cancelled = false;
      error = `${error ? `${error} ` : ""}Child cancellation failed: ${cancelError?.message ?? String(cancelError)}`;
    }
  }

  if (!cancellationFailed) {
    cancelledRepairIds.delete(repairId);
    repairAbortControllers.delete(repairId);
    repairChildren.delete(repairId);
  }

  await updateRepairOperation(
    repairId,
    {
      completedAt: dayjs().toISOString(),
      error: cancelled ? null : error,
      message: cancelled ? "Repair cancelled by user." : error || "Database repair completed.",
      processedCount: cancelled || error ? 0 : 1,
      status: cancelled ? "CANCELLED" : error ? "ERROR" : "COMPLETE",
    },
    !!error || cancelled,
  );
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

      const isCancelled = error?.name === "RepairCancelledError";
      const message = error?.message ?? String(error);

      await updateRepairOperation(repairId, {
        completedAt: dayjs().toISOString(),
        error: isCancelled ? undefined : message,
        message,
        status: isCancelled ? "CANCELLED" : "ERROR",
      });

      report(isCancelled ? message : `Failed: ${message}`, isCancelled ? "cancelled" : "error");

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
