import fs from "fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import { sleep } from "medior/utils/common";
import { getConfig, loadConfig } from "medior/utils/server/config";

let mongoServer: MongoMemoryServer;

const createDbServer = async () => {
  const config = getConfig();
  const dbPath = config.db.path;
  const port = config.ports.db;

  const exists = await fs.stat(dbPath).catch(() => false);
  if (!exists) await fs.mkdir(dbPath, { recursive: true });

  if (mongoServer) {
    fileLog("[DB] Stopping db...");
    await mongoServer.stop();
    await sleep(1000);
  }

  fileLog("[DB] Starting db...");
  mongoServer = await MongoMemoryServer.create({
    instance: {
      args: ["--wiredTigerCacheSizeGB", "2"],
      dbPath,
      port,
      storageEngine: "wiredTiger",
    },
  });

  const uri = mongoServer.getUri();
  fileLog(`[DB] Connecting to db: ${uri}`);

  fileLog("[DB] Started db.");
};

process.on("message", async (msg: any) => {
  if (msg?.type === "start") {
    try {
      await loadConfig(process.env.CONFIG_PATH);
      await setLogsPath(process.env.LOGS_PATH);
      await createDbServer();
      process.send?.({ type: "ready", uri: mongoServer.getUri() });
    } catch (err: any) {
      process.send?.({ type: "error", error: err.message });
    }
  }
});
