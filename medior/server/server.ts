import fs from "fs/promises";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import killPort from "kill-port";
import { SocketEmitEvent, SocketEvents, socketEvents } from "medior/_generated/socket";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Mongoose from "mongoose";
import { Server } from "socket.io";
import { serverRouter } from "medior/server/trpc";
import { getConfig } from "medior/utils/client";
import { CONSTANTS, sleep } from "medior/utils/common";
import { fileLog, socket } from "medior/utils/server";

/* -------------------------------------------------------------------------- */
/*                                  DATABASE                                  */
/* -------------------------------------------------------------------------- */
let mongoServer: MongoMemoryReplSet;

const createDbServer = async () => {
  try {
    const config = getConfig();
    const dbPath = config.db.path;
    const port = config.ports.db;

    try {
      const dbPathExists = await fs.stat(dbPath).catch(() => false);
      if (!dbPathExists) await fs.mkdir(dbPath, { recursive: true });
    } catch (err) {
      throw new Error(`Error creating database path: ${err.message}`);
    }

    if (mongoServer) {
      try {
        fileLog("Stopping existing Mongo server...");
        await Mongoose.disconnect();
        await mongoServer.stop();
        await killPort(port);
        fileLog("Existing Mongo server stopped.");
        await sleep(1000);
      } catch (err) {
        throw new Error(`Error stopping existing Mongo server: ${err.message}`);
      }
    }

    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        fileLog(`Creating database server on port ${port} from path ${dbPath}...`);

        mongoServer = await MongoMemoryReplSet.create({
          instanceOpts: [{ dbPath, port, storageEngine: "wiredTiger" }],
          replSet: { dbName: "medior", name: "rs0" },
        });

        break;
      } catch (err) {
        retries++;
        if (retries === maxRetries) throw new Error(`Error creating Mongo server: ${err.message}`);
        else {
          fileLog(`Error creating Mongo server: ${err.message}. Attempt ${retries} of ${maxRetries}.`, {
            type: "error",
          });
          await sleep(100);
        }
      }
    }

    try {
      Mongoose.set("strictQuery", true);

      const databaseUri = mongoServer.getUri();
      fileLog(`Connecting to database: ${databaseUri}`);
      await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);
      fileLog("Connected to database.");

      Mongoose.connection.on("error", (err) => fileLog(`MongoDB Error: ${err.message}`, { type: "error" }));
    } catch (err) {
      throw new Error(`Error connecting to database: ${err.message}`);
    }

    try {
      await Mongoose.syncIndexes();
      fileLog("Database indexes synced.");
    } catch (err) {
      throw new Error(`Error syncing database indexes: ${err.message}`);
    }
  } catch (error) {
    fileLog(error, { type: "error" });
  }
};

/* -------------------------------------------------------------------------- */
/*                                 tRPC                                       */
/* -------------------------------------------------------------------------- */
let server: ReturnType<typeof createHTTPServer>;

const createTRPCServer = async () => {
  const port = getConfig().ports.server;

  try {
    fileLog(`Creating tRPC server on port ${port}...`);
    if (server) {
      server.server.close(() => fileLog(`Server on port ${port} closed.`));
      await sleep(1000);
    }

    await killPort(port);

    server = createHTTPServer({ router: serverRouter });
    server.listen(
      port,
      // @ts-expect-error
      () => fileLog(`tRPC server listening on port ${port}.`)
    );
  } catch (err) {
    fileLog(`Error creating tRPC server: ${err.message}`, { type: "error" })
  }
};

/* -------------------------------------------------------------------------- */
/*                                  SOCKET.IO                                 */
/* -------------------------------------------------------------------------- */
let io: Server;

const createSocketIOServer = async () => {
  const port = getConfig().ports.socket;

  try {
    fileLog(`Creating socket server on port ${port}...`);
    if (io) {
      io.close(() => fileLog(`Socket server on port ${port} closed.`));
      await sleep(1000);
    }

    io = new Server<SocketEvents, SocketEvents>(port);
    io.on("connection", (socket) => {
      fileLog(`Socket server listening on port ${port}.`);
      socket.emit("connected");

      socketEvents.forEach((event) =>
        socket.on(event, (...args: any[]) => {
          socket.broadcast.emit(event, ...args);
        })
      );
    });

    socket.connect();
  } catch (err) {
    fileLog(`Error creating socket server: ${err.message}`, { type: "error" });
  }
};

/* -------------------------------------------------------------------------- */
/*                                START SERVERS                               */
/* -------------------------------------------------------------------------- */
export const startServers = async (
  args: {
    emitReloadEvents?: boolean;
    withDatabase?: boolean;
    withServer?: boolean;
    withSocket?: boolean;
  } = {
    emitReloadEvents: false,
    withDatabase: true,
    withServer: true,
    withSocket: true,
  }
) => {
  if (args.withDatabase) await createDbServer();
  if (args.withServer) await createTRPCServer();
  if (args.withSocket) await createSocketIOServer();

  if (args.emitReloadEvents) {
    [
      "reloadFileCollections",
      "reloadFiles",
      "reloadImportBatches",
      "reloadRegExMaps",
      "reloadTags",
    ].forEach((event: SocketEmitEvent) => io.emit(event));
  }

  fileLog("Servers created.");
};
