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
    const dbPath = config.mongo.dbPath;
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
const tProc = t.procedure;

/** All resources defined as mutation to deal with max length URLs in GET requests.
 * @see https://github.com/trpc/trpc/discussions/1936
 */
const trpcRouter = tRouter({
  completeImportBatch: tProc
    .input((input: unknown) => input as db.CompleteImportBatchInput)
    .mutation(({ input }) => db.completeImportBatch(input)),
  createCollection: tProc
    .input((input: unknown) => input as db.CreateCollectionInput)
    .mutation(({ input }) => db.createCollection(input)),
  createImportBatches: tProc
    .input((input: unknown) => input as db.CreateImportBatchesInput)
    .mutation(({ input }) => db.createImportBatches(input)),
  createTag: tProc
    .input((input: unknown) => input as db.CreateTagInput)
    .mutation(({ input }) => db.createTag(input)),
  deleteCollection: tProc
    .input((input: unknown) => input as db.DeleteCollectionInput)
    .mutation(({ input }) => db.deleteCollection(input)),
  deleteFiles: tProc
    .input((input: unknown) => input as db.DeleteFilesInput)
    .mutation(({ input }) => db.deleteFiles(input)),
  deleteImportBatches: tProc
    .input((input: unknown) => input as db.DeleteImportBatchesInput)
    .mutation(({ input }) => db.deleteImportBatches(input)),
  deleteTag: tProc
    .input((input: unknown) => input as db.DeleteTagInput)
    .mutation(({ input }) => db.deleteTag(input)),
  detectFaces: tProc
    .input((input: unknown) => input as db.DetectFacesInput)
    .mutation(({ input }) => db.detectFaces(input)),
  editFileTags: tProc
    .input((input: unknown) => input as db.EditFileTagsInput)
    .mutation(({ input }) => db.editFileTags(input)),
  editTag: tProc
    .input((input: unknown) => input as db.EditTagInput)
    .mutation(({ input }) => db.editTag(input)),
  getDeletedFile: tProc
    .input((input: unknown) => input as db.GetDeletedFileInput)
    .mutation(({ input }) => db.getDeletedFile(input)),
  getFileByHash: tProc
    .input((input: unknown) => input as db.GetFileByHashInput)
    .mutation(({ input }) => db.getFileByHash(input)),
  getShiftSelectedFiles: tProc
    .input((input: unknown) => input as db.GetShiftSelectedFilesInput)
    .mutation(({ input }) => db.getShiftSelectedFiles(input)),
  importFile: tProc
    .input((input: unknown) => input as db.ImportFileInput)
    .mutation(({ input }) => db.importFile(input)),
  listAllCollectionIds: tProc.mutation(db.listAllCollectionIds),
  listDeletedFiles: tProc.mutation(db.listDeletedFiles),
  listFilteredCollections: tProc
    .input((input: unknown) => input as db.ListFilteredCollectionsInput)
    .mutation(({ input }) => db.listFilteredCollections(input)),
  listFaceModels: tProc
    .input((input: unknown) => input as db.ListFaceModelsInput)
    .mutation(({ input }) => db.listFaceModels(input)),
  listFiles: tProc
    .input((input: unknown) => input as db.ListFilesInput)
    .mutation(({ input }) => db.listFiles(input)),
  listFilesByTagIds: tProc
    .input((input: unknown) => input as db.ListFilesByTagIdsInput)
    .mutation(({ input }) => db.listFilesByTagIds(input)),
  listFilteredFiles: tProc
    .input((input: unknown) => input as db.ListFilteredFilesInput)
    .mutation(({ input }) => db.listFilteredFiles(input)),
  listFileIdsForCarousel: tProc
    .input((input: unknown) => input as db.ListFileIdsForCarouselInput)
    .mutation(({ input }) => db.listFileIdsForCarousel(input)),
  listImportBatches: tProc.mutation(db.listImportBatches),
  listTags: tProc.mutation(db.listTags),
  loadFaceApiNets: tProc.mutation(db.loadFaceApiNets),
  mergeTags: tProc
    .input((input: unknown) => input as db.MergeTagsInput)
    .mutation(({ input }) => db.mergeTags(input)),
  recalculateTagCounts: tProc
    .input((input: unknown) => input as db.RecalculateTagCountsInput)
    .mutation(({ input }) => db.recalculateTagCounts(input)),
  refreshTagRelations: tProc
    .input((input: unknown) => input as db.RefreshTagRelationsInput)
    .mutation(({ input }) => db.refreshTagRelations(input)),
  regenCollAttrs: tProc
    .input((input: unknown) => input as db.RegenCollAttrsInput)
    .mutation(({ input }) => db.regenCollAttrs(input)),
  reloadServers: tProc
    .input((input: unknown) => input as db.StartServersInput)
    .mutation(({ input }) => startServers(input)),
  setFileFaceModels: tProc
    .input((input: unknown) => input as db.SetFileFaceModelsInput)
    .mutation(({ input }) => db.setFileFaceModels(input)),
  setFileIsArchived: tProc
    .input((input: unknown) => input as db.SetFileIsArchivedInput)
    .mutation(({ input }) => db.setFileIsArchived(input)),
  setFileRating: tProc
    .input((input: unknown) => input as db.SetFileRatingInput)
    .mutation(({ input }) => db.setFileRating(input)),
  setTagCount: tProc
    .input((input: unknown) => input as db.SetTagCountInput)
    .mutation(({ input }) => db.setTagCount(input)),
  startImportBatch: tProc
    .input((input: unknown) => input as db.StartImportBatchInput)
    .mutation(({ input }) => db.startImportBatch(input)),
  updateFile: tProc
    .input((input: unknown) => input as db.UpdateFileInput)
    .mutation(({ input }) => db.updateFile(input)),
  updateFileImportByPath: tProc
    .input((input: unknown) => input as db.UpdateFileImportByPathInput)
    .mutation(({ input }) => db.updateFileImportByPath(input)),
  updateCollection: tProc
    .input((input: unknown) => input as db.UpdateCollectionInput)
    .mutation(({ input }) => db.updateCollection(input)),
  upsertTag: tProc
    .input((input: unknown) => input as db.UpsertTagInput)
    .mutation(({ input }) => db.upsertTag(input)),
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
  reloadFileCollections: () => void;
  reloadFiles: () => void;
  reloadImportBatches: () => void;
  reloadRegExMaps: () => void;
  reloadTags: () => void;
  tagCreated: (args: { tag: db.Tag }) => void;
  tagDeleted: (args: { tagId: string }) => void;
  tagsUpdated: (args: { tagId: string; updates: Partial<db.Tag> }[]) => void;
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
        "reloadFileCollections",
        "reloadFiles",
        "reloadImportBatches",
        "reloadRegExMaps",
        "reloadTags",
        "tagCreated",
        "tagDeleted",
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
