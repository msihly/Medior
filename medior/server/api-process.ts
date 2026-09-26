import { createHTTPServer } from "@trpc/server/adapters/standalone";
import Mongoose from "mongoose";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import {
  startBackgroundQueues,
  stopBackgroundQueues,
} from "medior/server/database/actions/background-operations";
import { stopImporter } from "medior/server/database/actions/file-imports";
import { stopFileTransformer } from "medior/server/database/actions/file-transforms";
import {
  checkServerShutdown,
  closeHttpServer,
  registerProcessLifecycle,
} from "medior/server/process-lifecycle";
import { serverRouter } from "medior/server/trpc";
import { getConfig, loadConfig, setupTRPC, setupVectorTRPC, socket } from "medior/utils/server";

let server: ReturnType<typeof createHTTPServer>;

Mongoose.connection.on("error", (error) =>
  fileLog(`[API] DB Error: ${error.message}`, { type: "error" }),
);

registerProcessLifecycle({
  reload: async () => {
    await loadConfig(process.env.CONFIG_PATH);
  },

  start: async (message) => {
    await loadConfig(process.env.CONFIG_PATH);
    await setLogsPath(process.env.LOGS_PATH);
    checkServerShutdown();
    Mongoose.set("strictQuery", true);

    await Mongoose.connect(message.uri, {
      autoIndex: false,
      family: 4,
      writeConcern: { j: true, w: "majority" },
    });

    checkServerShutdown();

    const hello = await Mongoose.connection.db.admin().command({ hello: 1 });
    checkServerShutdown();
    if (hello.setName !== "rs0" || !hello.isWritablePrimary)
      throw new Error("The configured rs0 database is not PRIMARY yet.");

    setupTRPC();
    setupVectorTRPC();

    server = createHTTPServer({ router: serverRouter });

    await new Promise<void>((resolve, reject) => {
      server.server.once("error", reject);
      // @ts-expect-error
      server.listen(getConfig().ports.server, resolve);
    });

    checkServerShutdown();
    startBackgroundQueues();
    fileLog("[API] Ready for requests.");
  },

  stop: async () => {
    fileLog("[API] Closing HTTP connections and stopping the transformer...");

    await Promise.all([
      closeHttpServer(server?.server).then(() => fileLog("[API] HTTP connections closed.")),
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
