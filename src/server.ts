import path from "path";
import fs from "fs/promises";
import killPort from "kill-port";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Mongoose from "mongoose";
import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { Server } from "socket.io";
import * as db from "./database";
import { CONSTANTS, logToFile, setupSocketIO } from "./utils";
import env from "./env";

/* ----------------------------- DATABASE SERVER ---------------------------- */
const createDbServer = async () => {
  logToFile("debug", "Creating Mongo server...");
  const dbPath = env.DB_PATH || path.join(path.resolve(), "MongoDB", "media-viewer");
  const port = +env.DB_PORT || 27070;

  const dbPathExists = await fs.stat(dbPath).catch(() => false);
  if (!dbPathExists) await fs.mkdir(dbPath, { recursive: true });

  const mongoServer = await MongoMemoryReplSet.create({
    instanceOpts: [{ dbPath, port, storageEngine: "wiredTiger" }],
    replSet: { dbName: "media-viewer", name: "rs0" },
  });

  const databaseUri = mongoServer.getUri();
  logToFile("debug", "Mongo server created:", databaseUri);

  Mongoose.set("strictQuery", true);

  logToFile("debug", "Connecting to database:", databaseUri, "...");
  await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);
  logToFile("debug", "Connected to database.");

  // logToFile("debug", "Creating database indexes...");
  // await db.FileModel.ensureIndexes();
  // logToFile("debug", "Database indexes created.");

  // logToFile("debug", "Syncing database indexes...");
  // await Mongoose.syncIndexes();
  // logToFile("debug", "Database indexes synced.");
};

/* ----------------------------- API / tRPC ROUTER ------------------------------ */
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
  createRegExMaps: tProc
    .input((input: unknown) => input as db.CreateRegExMapsInput)
    .mutation(({ input }) => db.createRegExMaps(input)),
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
  deleteRegExMaps: tProc
    .input((input: unknown) => input as db.DeleteRegExMapsInput)
    .mutation(({ input }) => db.deleteRegExMaps(input)),
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
  getFileByHash: tProc
    .input((input: unknown) => input as db.GetFileByHashInput)
    .mutation(({ input }) => db.getFileByHash(input)),
  getShiftSelectedFiles: tProc
    .input((input: unknown) => input as db.GetShiftSelectedFilesInput)
    .mutation(({ input }) => db.getShiftSelectedFiles(input)),
  importFile: tProc
    .input((input: unknown) => input as db.ImportFileInput)
    .mutation(({ input }) => db.importFile(input)),
  listCollections: tProc
    .input((input: unknown) => input as db.ListCollectionsInput)
    .mutation(({ input }) => db.listCollections(input)),
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
  listRegExMaps: tProc.mutation(db.listRegExMaps),
  listTags: tProc.mutation(db.getAllTags),
  loadFaceApiNets: tProc.mutation(db.loadFaceApiNets),
  mergeTags: tProc
    .input((input: unknown) => input as db.MergeTagsInput)
    .mutation(({ input }) => db.mergeTags(input)),
  onCollectionCreated: tProc
    .input((input: unknown) => input as db.OnCollectionCreatedInput)
    .mutation(({ input }) => db.onCollectionCreated(input)),
  recalculateTagCounts: tProc
    .input((input: unknown) => input as db.RecalculateTagCountsInput)
    .mutation(({ input }) => db.recalculateTagCounts(input)),
  refreshTagRelations: tProc
    .input((input: unknown) => input as db.RefreshTagRelationsInput)
    .mutation(({ input }) => db.refreshTagRelations(input)),
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
  updateRegExMaps: tProc
    .input((input: unknown) => input as db.UpdateRegExMapsInput)
    .mutation(({ input }) => db.updateRegExMaps(input)),
});
export type TRPCRouter = typeof trpcRouter;

/* ----------------------------- CREATE SERVER ----------------------------- */
export interface SocketEmitEvents {
  collectionCreated: (args: { collection: db.FileCollection }) => void;
  filesArchived: (args: { fileIds: string[] }) => void;
  filesDeleted: (args: { fileIds: string[] }) => void;
  filesUpdated: (args: { fileIds: string[]; updates: Partial<db.File> }) => void;
  fileTagsUpdated: (args: {
    addedTagIds: string[];
    batchId?: string;
    fileIds?: string[];
    removedTagIds: string[];
  }) => void;
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

let io: Server, server: ReturnType<typeof createHTTPServer>;

const startServers = async () => {
  logToFile("debug", "Creating database server...");
  await createDbServer();
  logToFile("debug", "Database server created.");

  logToFile("debug", "Creating tRPC server...");
  server = createHTTPServer({ router: trpcRouter });

  const serverPort = +env.SERVER_PORT || 3334;
  await killPort(serverPort);

  // @ts-expect-error
  server.listen(serverPort, () =>
    logToFile("debug", `tRPC server listening on port ${serverPort}...`)
  );

  const socketPort = +env.SOCKET_PORT || 3335;
  await killPort(socketPort);
  io = new Server<SocketEvents, SocketEvents>(+env.SOCKET_PORT || 3335);

  io.on("connection", (socket) => {
    logToFile("debug", `Socket server listening on port ${socketPort}.`);
    socket.emit("connected");

    const socketEvents: SocketEmitEvent[] = [
      "collectionCreated",
      "filesArchived",
      "filesDeleted",
      "filesUpdated",
      "fileTagsUpdated",
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

  logToFile("debug", "Servers created.");
};

startServers();
