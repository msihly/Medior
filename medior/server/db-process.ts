import fs from "fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import Mongoose from "mongoose";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import { isServerStopping, registerProcessLifecycle } from "medior/server/process-lifecycle";
import { sleep } from "medior/utils/common";
import { getConfig, loadConfig } from "medior/utils/server/config";

let mongoServer: MongoMemoryServer;

registerProcessLifecycle({
  reload: async () => {
    await loadConfig(process.env.CONFIG_PATH);
  },

  start: async () => {
    await loadConfig(process.env.CONFIG_PATH);
    await setLogsPath(process.env.LOGS_PATH);

    const { db, ports } = getConfig();

    await fs.mkdir(db.path, { recursive: true });
    fileLog("[DB] Starting persistent WiredTiger replica-set member rs0...");

    mongoServer = new MongoMemoryServer({
      instance: {
        args: ["--wiredTigerCacheSizeGB", "2"],
        dbPath: db.path,
        // Recovery must not be killed by the library's short test-server deadline.
        launchTimeout: 2147483647,
        port: ports.db,
        replSet: "rs0",
        storageEngine: "wiredTiger",
      },
      // The worker owns mongod through its Windows job; terminal Ctrl+C must stop clients first.
      spawn: { detached: true, windowsHide: true },
    });

    await mongoServer.start(true);

    if (isServerStopping()) return;

    const client = new Mongoose.mongo.MongoClient(mongoServer.getUri("admin"), {
      directConnection: true,
      family: 4,
      serverSelectionTimeoutMS: 30000,
    });

    try {
      await client.connect();

      const admin = client.db("admin");

      try {
        const { config } = await admin.command({ replSetGetConfig: 1 });

        if (config._id !== "rs0" || config.members.length !== 1)
          throw new Error(
            "Expected the existing single-member rs0 configuration. No reconfiguration was attempted.",
          );
      } catch (error) {
        if (error.code !== 94) throw error;

        await admin.command({
          replSetInitiate: {
            _id: "rs0",
            members: [{ _id: 0, host: `localhost:${ports.db}` }],
            writeConcernMajorityJournalDefault: true,
          },
        });
      }

      const deadline = Date.now() + 5 * 60 * 1000;

      while (!(await admin.command({ hello: 1 })).isWritablePrimary) {
        if (isServerStopping()) return;

        if (Date.now() >= deadline)
          throw new Error(
            "rs0 did not become PRIMARY. Existing replication metadata was preserved; review the database startup log.",
          );

        await sleep(1000);
      }

      fileLog("[DB] rs0 is PRIMARY; application database is test.");

      return { uri: `${mongoServer.getUri("test")}?replicaSet=rs0&w=majority&journal=true` };
    } finally {
      await client.close();
    }
  },

  stop: async () => {
    const native = mongoServer?.instanceInfo?.instance.mongodProcess;
    if (!native || native.exitCode !== null || native.signalCode !== null) return;

    // Windows kill() is forced termination. A direct connection also works before election.
    const client = new Mongoose.mongo.MongoClient(mongoServer.getUri("admin"), {
      directConnection: true,
      family: 4,
      serverSelectionTimeoutMS: 30000,
    });

    let resolveExit: () => void;

    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });

    const handleExit = () => resolveExit();

    native.once("exit", handleExit);

    try {
      await client.connect();
      fileLog("[DB] Requesting clean shutdown...");

      try {
        // MongoDB treats the first key as the command name; shutdown must precede its options.
        await client.db("admin").command({ shutdown: 1, force: true, timeoutSecs: 0 });
      } catch (error) {
        if (!(error instanceof Mongoose.mongo.MongoNetworkError)) throw error;
      }

      if (native.exitCode === null && native.signalCode === null) await exited;

      if (native.exitCode !== 0)
        throw new Error(
          `Database shutdown exited with code ${native.exitCode}, signal ${native.signalCode}.`,
        );

      // The native process has exited; library cleanup must not attempt a second shutdown connection.
      mongoServer.instanceInfo.instance.mongodProcess = undefined;
      await mongoServer.stop({ doCleanup: false });
    } finally {
      native.off("exit", handleExit);
      await client.close();
    }

    fileLog("[DB] Clean shutdown completed.");
  },
});
