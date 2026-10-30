import { SocketEmitEvent, SocketEvents } from "medior/_generated/server/socket";
import { createHttpRpcClient, RpcClient } from "trabecula/utils/rpc";
import { fileLog } from "trabecula/utils/server";
import { SocketClient } from "trabecula/utils/socket";
import { ServerRouter } from "medior/server/rpc";
import type { VectorRouter } from "medior/server/vector-process";
import { getConfig } from "medior/utils/server/config";

/* -------------------------------------------------------------------------- */
/*                                     RPC                                    */
/* -------------------------------------------------------------------------- */
export let rpc: RpcClient<ServerRouter>;
export let vectorRpc: RpcClient<VectorRouter>;

export const setupRpc = () => {
  rpc = createHttpRpcClient<ServerRouter>({ url: `http://127.0.0.1:${getConfig().ports.server}` });
};

export const setupVectorRpc = () => {
  vectorRpc = createHttpRpcClient<VectorRouter>({
    // Duplicate searches run several queries at once; batched, each would wait for the slowest.
    batch: { exclude: ["findDuplicateCandidates"] },
    url: `http://127.0.0.1:${getConfig().ports.vector}`,
  });
};

/* -------------------------------------------------------------------------- */
/*                                   SOCKETS                                  */
/* -------------------------------------------------------------------------- */
export const socket = new SocketClient<SocketEvents, SocketEmitEvent>({
  getPort: () => getConfig().ports.socket,
  log: (message, type) => fileLog(message, { type }),
});
