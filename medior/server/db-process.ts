import fs from "fs/promises";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Mongoose from "mongoose";
import { sleep } from "medior/utils/common";
import { fileLog, getConfig, loadConfig, setLogsPath } from "medior/utils/server";

let mongoServer: MongoMemoryReplSet;

const createDbServer = async () => {
  const config = getConfig();
  const dbPath = config.db.path;
  const port = config.ports.db;

  const exists = await fs.stat(dbPath).catch(() => false);
  if (!exists) await fs.mkdir(dbPath, { recursive: true });

  if (mongoServer) {
    fileLog("Disconnecting from db...");
    await Mongoose.disconnect();
    await mongoServer.stop();
    await sleep(1000);
  }

  fileLog("Starting db...");
  mongoServer = await MongoMemoryReplSet.create({
    instanceOpts: [{ dbPath, port, storageEngine: "wiredTiger" }],
    replSet: { dbName: "medior", name: "rs0" },
  });

  await mongoServer.waitUntilRunning();

  const uri = mongoServer.getUri();
  fileLog(`Connecting to db: ${uri}`);

  Mongoose.set("strictQuery", true);
  await Mongoose.connect(uri, { family: 4 });
  Mongoose.connection.on("error", (err) => fileLog(`DB Error: ${err.message}`, { type: "error" }));

  for (const m of Object.keys(Mongoose.models)) Mongoose.models[m].syncIndexes();

  fileLog("Connected to db.");
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
