import { Socket, io } from "socket.io-client";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { SocketEvents, TRPCRouter } from "../server.js";
import { getConfig } from "./config.js";

export let socket: Socket<SocketEvents, SocketEvents>;

export const setupSocketIO = () => {
  const port = getConfig().ports.socket;

  if (socket) {
    socket.disconnect();
    console.debug(`Socket.io existing connection closed on port ${port}.`);
  }

  socket = io(`ws://localhost:${port}`);

  socket.on("connected", () =>
    console.debug(`Socket.io connected on port ${port}. ID: ${socket.id}`)
  );

  socket.on("disconnect", () => console.debug(`Socket.io disconnected on port ${port}.`));

  return socket;
};

export let trpc: ReturnType<typeof createTRPCProxyClient<TRPCRouter>>;

export const setupTRPC = () => {
  // @ts-expect-error
  trpc = createTRPCProxyClient<TRPCRouter>({
    links: [httpBatchLink({ url: `http://localhost:${getConfig().ports.server}` })],
  });
};
