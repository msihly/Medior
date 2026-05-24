import { SocketEmitEvent } from "medior/_generated/server";
import { makeAction, socket } from "medior/utils/server";

export const _emitEvent = makeAction(async (args: { event: SocketEmitEvent; data: any }) => {
  socket.emit(args.event as any, args.data);
});
