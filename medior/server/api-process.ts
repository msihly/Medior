import { createHTTPServer } from "@trpc/server/adapters/standalone";
import killPort from "kill-port";
import Mongoose from "mongoose";
import { serverRouter } from "medior/server/trpc";
import { sleep } from "medior/utils/common";
import { fileLog, getConfig, loadConfig, setLogsPath, setupTRPC } from "medior/utils/server";

let server: ReturnType<typeof createHTTPServer>;

const createTRPCServer = async () => {
  const port = getConfig().ports.server;

  if (server) {
    server.server.close();
    await sleep(500);
  }

  await killPort(port);
  server = createHTTPServer({ router: serverRouter });

  await new Promise<void>((resolve) => {
    // @ts-expect-error
    server.listen(port, () => {
      fileLog(`tRPC server listening on ${port}`);
      resolve();
    });
  });
};

Mongoose.connection.on("error", (err) => fileLog(`DB Error: ${err.message}`, { type: "error" }));

process.on("message", async (msg: any) => {
  if (msg?.type === "start") {
    try {
      await loadConfig(process.env.CONFIG_PATH);
      await setLogsPath(process.env.LOGS_PATH);

      const uri = msg.uri;
      fileLog(`Connecting to db: ${uri}`);

      Mongoose.set("strictQuery", true);
      await Mongoose.connect(uri, { family: 4 });

      fileLog("Connected to db.");

      await createTRPCServer();
      setupTRPC();
      process.send?.({ type: "ready" });
    } catch (err: any) {
      process.send?.({ type: "error", error: err.message });
    }
  }
});
