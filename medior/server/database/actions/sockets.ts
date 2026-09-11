import { SocketEmitEvent } from "medior/_generated/server";
import {
  cancelRepair as cancelRepairRun,
  finishRepair as finishRepairRun,
  startRepair as startRepairRun,
} from "medior/server/database/repair-progress";
import { makeAction, socket } from "medior/utils/server";

export const _emitEvent = makeAction(async (args: { event: SocketEmitEvent; data: any }) => {
  socket.emit(args.event as any, args.data);
});

export const startRepair = makeAction(async ({ repairId }: { repairId: string }) => {
  await startRepairRun(repairId);
});

export const cancelRepair = makeAction(async ({ repairId }: { repairId: string }) => {
  await cancelRepairRun(repairId);
});

export const finishRepair = makeAction(async ({ repairId }: { repairId: string }) => {
  await finishRepairRun(repairId);
});
