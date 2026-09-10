import { fileLog } from "trabecula/utils/server";
import { socket } from "medior/utils/server";

export type RepairProgressStatus = "cancelled" | "error" | "info" | "progress" | "success";

class RepairCancelledError extends Error {
  constructor() {
    super("Repair cancelled by user.");
    this.name = "RepairCancelledError";
  }
}

const cancelledRepairIds = new Set<string>();
const repairAbortControllers = new Map<string, AbortController>();

export const startRepair = (repairId: string) => {
  cancelledRepairIds.delete(repairId);
  repairAbortControllers.set(repairId, new AbortController());
};

export const cancelRepair = (repairId: string) => {
  cancelledRepairIds.add(repairId);
  repairAbortControllers.get(repairId)?.abort(new RepairCancelledError());
};

export const finishRepair = (repairId: string) => {
  cancelledRepairIds.delete(repairId);
  repairAbortControllers.delete(repairId);
};

export const makeRepairReporter = (repairId: string, repairName: string) => {
  const abortController =
    repairAbortControllers.get(repairId) ??
    repairAbortControllers.set(repairId, new AbortController()).get(repairId);
  const report = (message: string, status: RepairProgressStatus = "info", isTransient = false) => {
    if (!isTransient)
      fileLog(`[${repairName}] ${message}`, status === "error" ? { type: "error" } : undefined);
    socket.emitReliable("onRepairProgress", { message, repairId, status });
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
