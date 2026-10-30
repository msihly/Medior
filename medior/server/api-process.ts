import Mongoose from "mongoose";
import {
  checkServerShutdown,
  closeHttpServer,
  listenHttpServer,
  registerProcessLifecycle,
  reportStartupProgress,
} from "trabecula/utils/process";
import { connectMongoPrimary } from "trabecula/utils/process/mongo-client";
import { createRpcServer } from "trabecula/utils/process/rpc";
import { fileLog } from "trabecula/utils/server";
import {
  startBackgroundQueues,
  stopBackgroundQueues,
} from "medior/server/database/actions/background-operations";
import { stopImporter } from "medior/server/database/actions/file-imports";
import { stopFileTransformer } from "medior/server/database/actions/file-transforms";
import { serverRouter } from "medior/server/rpc";
import { getConfig, loadConfig, setupRpc, setupVectorRpc, socket } from "medior/utils/server";

let server: ReturnType<typeof createRpcServer>;

Mongoose.connection.on("error", (error) =>
  fileLog(`[API] DB Error: ${error.message}`, { type: "error" }),
);

registerProcessLifecycle({
  reload: async () => {
    await loadConfig(process.env.CONFIG_PATH);
  },

  start: async (message) => {
    reportStartupProgress("Loading API configuration...");
    await loadConfig(process.env.CONFIG_PATH);
    checkServerShutdown();

    await connectMongoPrimary(message.uri, "rs0");

    reportStartupProgress("Opening the API listener...");
    setupRpc();
    setupVectorRpc();

    server = createRpcServer(serverRouter);
    await listenHttpServer(server, getConfig().ports.server);

    checkServerShutdown();
    startBackgroundQueues();
    fileLog("[API] Ready for requests.");
  },

  stop: async () => {
    fileLog("[API] Closing HTTP connections and stopping the transformer...");

    await Promise.all([
      closeHttpServer(server).then(() => fileLog("[API] HTTP connections closed.")),
      stopFileTransformer().then(() => fileLog("[API] Transformer stopped.")),
      stopImporter().then(() => fileLog("[API] Importer stopped.")),
      stopBackgroundQueues().then(() => fileLog("[API] Background queues stopped.")),
    ]);

    socket.disconnect();
    fileLog("[API] Disconnecting MongoDB client...");
    await Mongoose.connection.close(true);
    fileLog("[API] Shutdown complete.");
  },
});
