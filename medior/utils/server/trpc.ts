import { createTRPCProxyClient, httpBatchLink, httpLink, splitLink } from "@trpc/client";
import { SocketEmitEvent, SocketEvents } from "medior/_generated/server/socket";
import { fileLog } from "trabecula/utils/server";
import { SocketClient } from "trabecula/utils/socket";
import { ServerRouter } from "medior/server/trpc";
import type { VectorRouter } from "medior/server/vector-process";
import { getConfig } from "medior/utils/server/config";

/* -------------------------------------------------------------------------- */
/*                                    TRPC                                    */
/* -------------------------------------------------------------------------- */
export let trpc: ReturnType<typeof createTRPCProxyClient<ServerRouter>>;
export let vectorTrpc: ReturnType<typeof createTRPCProxyClient<VectorRouter>>;

export const setupTRPC = () => {
  // @ts-expect-error
  trpc = createTRPCProxyClient<ServerRouter>({
    links: [httpLink({ url: `http://127.0.0.1:${getConfig().ports.server}` })],
  });
};

export const setupVectorTRPC = () => {
  const url = `http://127.0.0.1:${getConfig().ports.vector}`;

  // @ts-expect-error
  vectorTrpc = createTRPCProxyClient<VectorRouter>({
    links: [
      // Duplicate searches run several queries at once; batched, each would wait for the slowest.
      splitLink({
        condition: (op) => op.path === "findDuplicateCandidates",
        false: httpBatchLink({ url }),
        true: httpLink({ url }),
      }),
    ],
  });
};

/* -------------------------------------------------------------------------- */
/*                                   SOCKETS                                  */
/* -------------------------------------------------------------------------- */
export const socket = new SocketClient<SocketEvents, SocketEmitEvent>({
  getPort: () => getConfig().ports.socket,
  log: (message, type) => fileLog(message, { type }),
});
