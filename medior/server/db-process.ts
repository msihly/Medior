import { registerMongoProcess } from "trabecula/utils/process/mongo";
import { getConfig, loadConfig } from "medior/utils/server/config";

registerMongoProcess(async () => {
  await loadConfig(process.env.CONFIG_PATH);

  const { db, ports } = getConfig();
  return {
    args: ["--wiredTigerCacheSizeGB", "2"],
    binary: { version: "5.0.19" },
    dbName: "test",
    dbPath: db.path,
    port: ports.db,
    replicaSet: "rs0",
  };
});
