import { Socket, io } from "socket.io-client";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import env from "../env";
import { SocketEvents, TRPCRouter } from "../server.js";
import { logToFile } from "./logging";

export let socket: Socket<SocketEvents, SocketEvents>;

export const setupSocketIO = () => {
  socket = io(`ws://localhost:${env.SOCKET_PORT}`);
  socket.on("connected", () =>
    logToFile("debug", `Socket.io connected on port ${env.SOCKET_PORT}. ID: ${socket.id}`)
  );
  return socket;
};

// @ts-expect-error
export const trpc = createTRPCProxyClient<TRPCRouter>({
  links: [httpBatchLink({ url: `http://localhost:${+env?.SERVER_PORT || 3738}` })],
});
