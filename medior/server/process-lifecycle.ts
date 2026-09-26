import { setMaxListeners } from "events";
import { Server } from "http";
import { fileLog } from "trabecula/utils/server";
import { ownProcessTree } from "medior/server/process-job";

export interface ServerProcessMessage {
  error?: string;
  requestId?: string;
  type:
    | "config-reloaded"
    | "error"
    | "ready"
    | "relaunch"
    | "reload-config"
    | "shutdown-error"
    | "start"
    | "stop";
  uri?: string;
}

let stopping = false;
const shutdownController = new AbortController();
export const serverShutdownSignal = shutdownController.signal;

export const checkServerShutdown = () => {
  if (stopping) throw new Error("Server task cancelled for shutdown.");
};

export const closeHttpServer = async (server?: Server) => {
  if (!server?.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // The shutdown signal interrupts active work while HTTP connections close.
    server.closeAllConnections();
  });
};

export const isServerStopping = () => stopping;

/** Interrupt worker startup and active work before closing its resources. */
export const registerProcessLifecycle = ({
  reload,
  start,
  stop,
}: {
  reload: () => Promise<void>;
  start: (message: ServerProcessMessage) => Promise<Pick<ServerProcessMessage, "uri"> | void>;
  stop: () => Promise<void>;
}) => {
  ownProcessTree();
  setMaxListeners(0, serverShutdownSignal);

  let shutdown: Promise<void>;
  let startup: Promise<Pick<ServerProcessMessage, "uri"> | void>;

  const reply = (message: ServerProcessMessage) => {
    if (!process.connected) return;

    process.send(message, (error) => {
      if (error) console.error("Lifecycle response could not be delivered:", error);
    });
  };

  const shutdownProcess = (code = 0) => {
    if (shutdown) return shutdown;

    stopping = true;
    shutdownController.abort(new Error("Server is shutting down."));

    shutdown = (async () => {
      await stop();
      process.stdout.write("", () => process.stderr.write("", () => process.exit(code)));
    })().catch((error) => {
      console.error("Graceful shutdown failed:", error);
      reply({ error: error.message, type: "shutdown-error" });
      process.exit(1);
    });

    return shutdown;
  };

  process.on("message", async (message: ServerProcessMessage) => {
    try {
      if (message?.type === "stop") {
        await shutdownProcess();

        return;
      }

      if (stopping) throw new Error("Process is shutting down.");

      if (message?.type === "start") {
        startup ??= start(message);

        const response = await startup;

        if (!shutdown) reply({ ...response, requestId: message.requestId, type: "ready" });
      } else if (message?.type === "reload-config") {
        await reload();
        reply({ requestId: message.requestId, type: "config-reloaded" });
      }
    } catch (error) {
      console.error(`[${message?.type}] Failed:`, error);

      reply({
        error: error.stack ?? error.message,
        requestId: message?.requestId,
        type: "error",
      });

      if (message?.type === "start") void shutdownProcess(1).catch(() => {});
    }
  });

  process.on("disconnect", () => void shutdownProcess().catch(() => {}));

  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      // The connected parent coordinates client shutdown before storage shutdown.
      if (!process.connected) void shutdownProcess().catch(() => {});
      else fileLog(`Waiting for parent shutdown after ${signal}.`);
    });
};
