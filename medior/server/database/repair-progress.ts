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

export const startRepair = (repairId: string) => cancelledRepairIds.delete(repairId);
export const cancelRepair = (repairId: string) => cancelledRepairIds.add(repairId);
export const finishRepair = (repairId: string) => cancelledRepairIds.delete(repairId);

export const makeRepairReporter = (repairId: string, repairName: string) => {
  const report = (message: string, status: RepairProgressStatus = "info") => {
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

  return { checkCancelled, report, run };
};
