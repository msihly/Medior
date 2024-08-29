import { Socket, io } from "socket.io-client";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { SocketEvents } from "../_generated/socket.js";
import { ServerRouter } from "../trpc.js";
import { getConfig } from "./config.js";

export let socket: Socket<SocketEvents, SocketEvents>;

export const getSocket = () => socket;

export const connectSocket = () => {
  if (socket) return socket;

  const port = getConfig().ports.socket;
  socket = io(`ws://localhost:${port}`);

  socket.on("connected", () =>
    console.debug(`Socket.io connected on port ${port}. ID: ${socket.id}`)
  );

  socket.on("connect_error", (error) => console.error(`Socket.io error on port ${port}:`, error));

  socket.on("disconnect", () => console.debug(`Socket.io disconnected on port ${port}.`));

  return socket;
};

export let trpc: ReturnType<typeof createTRPCProxyClient<ServerRouter>>;

export const setupTRPC = () => {
  // @ts-expect-error
  trpc = createTRPCProxyClient<ServerRouter>({
    links: [httpBatchLink({ url: `http://localhost:${getConfig().ports.server}` })],
  });
};
