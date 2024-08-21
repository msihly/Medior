import fs from "fs/promises";
import killPort from "kill-port";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Mongoose from "mongoose";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { Server } from "socket.io";
import { SocketEmitEvent, socketEvents, SocketEvents } from "./socket";
import { serverRouter } from "./trpc";
import { CONSTANTS, getConfig, logToFile, setupSocketIO, sleep } from "./utils";

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
      throw new Error(`Error creating database path: ${err}`);
    }

    if (mongoServer) {
      try {
        logToFile("debug", "Stopping existing Mongo server...");
        await Mongoose.disconnect();
        await mongoServer.stop();
        await killPort(port);
        logToFile("debug", "Existing Mongo server stopped.");
        await sleep(1000);
      } catch (err) {
        throw new Error(`Error stopping existing Mongo server: ${err}`);
      }
    }

    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        logToFile("debug", `Creating database server on port ${port} from path ${dbPath}...`);

        mongoServer = await MongoMemoryReplSet.create({
          instanceOpts: [{ dbPath, port, storageEngine: "wiredTiger" }],
          replSet: { dbName: "medior", name: "rs0" },
        });

        break;
      } catch (err) {
        retries++;
        if (retries === maxRetries) throw new Error(`Error creating Mongo server: ${err}`);
        else {
          logToFile(
            "error",
            `Error creating Mongo server: ${err}. Attempt ${retries} of ${maxRetries}.`
          );
          await sleep(100);
        }
      }
    }

    try {
      Mongoose.set("strictQuery", true);

      const databaseUri = mongoServer.getUri();
      logToFile("debug", "Connecting to database:", databaseUri);
      await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);
      logToFile("debug", "Connected to database.");
    } catch (err) {
      throw new Error(`Error connecting to database: ${err}`);
    }

    try {
      await Mongoose.syncIndexes();
      logToFile("debug", "Database indexes synced.");
    } catch (err) {
      throw new Error(`Error syncing database indexes: ${err}`);
    }
  } catch (error) {
    logToFile("error", error);
  }
};

/* -------------------------------------------------------------------------- */
/*                                 tRPC                                       */
/* -------------------------------------------------------------------------- */
/* --------------------------------- SERVER --------------------------------- */
let server: ReturnType<typeof createHTTPServer>;

const createTRPCServer = async () => {
  const config = getConfig();
  const serverPort = config.ports.server;

  try {
    logToFile("debug", `Creating tRPC server on port ${serverPort}...`);
    if (server) {
      server.server.close(() => logToFile("debug", `Server on port ${serverPort} closed.`));
      await sleep(1000);
    }

    server = createHTTPServer({ router: serverRouter });
    server.listen(
      serverPort,
      // @ts-expect-error
      () => logToFile("debug", `tRPC server listening on port ${serverPort}.`)
    );
  } catch (err) {
    logToFile("error", "Error creating tRPC server:", err);
  }
};

/* -------------------------------------------------------------------------- */
/*                                  SOCKET.IO                                 */
/* -------------------------------------------------------------------------- */
/* --------------------------------- SERVER --------------------------------- */
let io: Server;

const createSocketIOServer = async () => {
  const config = getConfig();
  const socketPort = config.ports.socket;

  try {
    logToFile("debug", `Creating socket server on port ${socketPort}...`);
    if (io) {
      io.close(() => logToFile("debug", `Socket server on port ${socketPort} closed.`));
      await sleep(1000);
    }

    io = new Server<SocketEvents, SocketEvents>(socketPort);
    io.on("connection", (socket) => {
      logToFile("debug", `Socket server listening on port ${socketPort}.`);
      socket.emit("connected");

      socketEvents.forEach((event) =>
        socket.on(event, (...args: any[]) => {
          socket.broadcast.emit(event, ...args);
        })
      );
    });

    setupSocketIO();
  } catch (err) {
    logToFile("error", "Error creating socket server:", err);
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

  logToFile("debug", "Servers created.");
};