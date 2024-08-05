import fs from "fs/promises";
import killPort from "kill-port";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Mongoose from "mongoose";
import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { Server } from "socket.io";
import * as db from "./database";
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
/* ----------------------------- API / ROUTER ------------------------------ */
const t = initTRPC.create();
const tRouter = t.router;

/** All resources defined as mutation to deal with max length URLs in GET requests.
 * @see https://github.com/trpc/trpc/discussions/1936
 */
const endpoint = <Input, Output>(fn: (input: Input) => Output) =>
  t.procedure.input((input: Input) => input).mutation(({ input }) => fn(input));

const trpcRouter = tRouter({
  completeImportBatch: endpoint(db.completeImportBatch),
  createCollection: endpoint(db.createCollection),
  createImportBatches: endpoint(db.createImportBatches),
  createTag: endpoint(db.createTag),
  deleteCollection: endpoint(db.deleteCollection),
  deleteEmptyCollections: endpoint(db.deleteEmptyCollections),
  deleteFiles: endpoint(db.deleteFiles),
  deleteImportBatches: endpoint(db.deleteImportBatches),
  deleteTag: endpoint(db.deleteTag),
  detectFaces: endpoint(db.detectFaces),
  editFileTags: endpoint(db.editFileTags),
  editMultiTagRelations: endpoint(db.editMultiTagRelations),
  editTag: endpoint(db.editTag),
  emitImportStatsUpdated: endpoint(db.emitImportStatsUpdated),
  getDeletedFile: endpoint(db.getDeletedFile),
  getDiskStats: endpoint(db.getDiskStats),
  getFileByHash: endpoint(db.getFileByHash),
  getShiftSelectedFiles: endpoint(db.getShiftSelectedFiles),
  getShiftSelectedTags: endpoint(db.getShiftSelectedTags),
  importFile: endpoint(db.importFile),
  listAllCollectionIds: endpoint(db.listAllCollectionIds),
  listDeletedFiles: endpoint(db.listDeletedFiles),
  listFaceModels: endpoint(db.listFaceModels),
  listFileIdsForCarousel: endpoint(db.listFileIdsForCarousel),
  listFilePaths: endpoint(db.listFilePaths),
  listFiles: endpoint(db.listFiles),
  listFilesByTagIds: endpoint(db.listFilesByTagIds),
  listFilteredCollections: endpoint(db.listFilteredCollections),
  listFilteredFiles: endpoint(db.listFilteredFiles),
  listFilteredTags: endpoint(db.listFilteredTags),
  listImportBatches: endpoint(db.listImportBatches),
  listTags: endpoint(db.listTags),
  loadFaceApiNets: endpoint(db.loadFaceApiNets),
  mergeTags: endpoint(db.mergeTags),
  recalculateTagCounts: endpoint(db.recalculateTagCounts),
  refreshTag: endpoint(db.refreshTag),
  refreshTagRelations: endpoint(db.refreshTagRelations),
  regenCollAttrs: endpoint(db.regenCollAttrs),
  regenTags: endpoint(db.regenTags),
  regenTagThumbPaths: endpoint(db.regenTagThumbPaths),
  relinkFiles: endpoint(db.relinkFiles),
  reloadServers: endpoint((args) => startServers(args)),
  setFileFaceModels: endpoint(db.setFileFaceModels),
  setFileIsArchived: endpoint(db.setFileIsArchived),
  setFileRating: endpoint(db.setFileRating),
  setTagCount: endpoint(db.setTagCount),
  startImportBatch: endpoint(db.startImportBatch),
  updateFile: endpoint(db.updateFile),
  updateCollection: endpoint(db.updateCollection),
  updateFileImportByPath: endpoint(db.updateFileImportByPath),
  upsertTag: endpoint(db.upsertTag),
});
export type TRPCRouter = typeof trpcRouter;

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

    server = createHTTPServer({ router: trpcRouter });
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
/* ------------------------------ EVENTS ----------------------------- */
export interface SocketEmitEvents {
  collectionCreated: (args: { collection: db.FileCollection }) => void;
  collectionDeleted: (args: { collectionId: string }) => void;
  collectionUpdated: (args: { collectionId: string; updates: Partial<db.FileCollection> }) => void;
  filesArchived: (args: { fileIds: string[] }) => void;
  filesDeleted: (args: { fileHashes: string[]; fileIds: string[] }) => void;
  filesUpdated: (args: { fileIds: string[]; updates: Partial<db.File> }) => void;
  fileTagsUpdated: (args: {
    addedTagIds: string[];
    batchId?: string;
    fileIds?: string[];
    removedTagIds: string[];
  }) => void;
  importBatchCompleted: () => void;
  importStatsUpdated: (args: { importStats: db.ImportStats }) => void;
  reloadFileCollections: () => void;
  reloadFiles: () => void;
  reloadImportBatches: () => void;
  reloadRegExMaps: () => void;
  reloadTags: () => void;
  tagCreated: (args: { tag: db.Tag }) => void;
  tagDeleted: (args: { tagId: string }) => void;
  tagMerged: (args: { oldTagId: string; newTagId: string }) => void;
  tagsUpdated: (args: {
    tags: Array<{ tagId: string; updates: Partial<db.Tag> }>;
    withFileReload: boolean;
  }) => void;
}

export type SocketEmitEvent = keyof SocketEmitEvents;

export interface SocketEvents extends SocketEmitEvents {
  connected: () => void;
}

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

      const socketEvents: SocketEmitEvent[] = [
        "collectionCreated",
        "collectionDeleted",
        "collectionUpdated",
        "filesArchived",
        "filesDeleted",
        "filesUpdated",
        "fileTagsUpdated",
        "importBatchCompleted",
        "importStatsUpdated",
        "reloadFileCollections",
        "reloadFiles",
        "reloadImportBatches",
        "reloadRegExMaps",
        "reloadTags",
        "tagCreated",
        "tagDeleted",
        "tagMerged",
        "tagsUpdated",
      ];

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
const startServers = async (
  { emitReloadEvents, withDatabase, withServer, withSocket }: db.StartServersInput = {
    emitReloadEvents: false,
    withDatabase: true,
    withServer: true,
    withSocket: true,
  }
) => {
  if (withDatabase) await createDbServer();
  if (withServer) await createTRPCServer();
  if (withSocket) await createSocketIOServer();

  if (emitReloadEvents) {
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

startServers();
