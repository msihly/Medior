import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import Mongoose from "mongoose";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import {
  checkServerShutdown,
  closeHttpServer,
  registerProcessLifecycle,
} from "medior/server/process-lifecycle";
import { SimilarityVectorType, vectorSimilarityService } from "medior/server/vector-service";
import { getConfig, loadConfig } from "medior/utils/server/config";

const trpc = initTRPC.create();

let server: ReturnType<typeof createHTTPServer>;

const getVectorService = () => {
  if (!vectorSimilarityService) throw new Error("Vector service not initialized");

  return vectorSimilarityService;
};

export const vectorRouter = trpc.router({
  cancelSearchIndexBuild: trpc.procedure.mutation(() =>
    getVectorService().cancelSearchIndexBuild(),
  ),
  cancelSimilarityBackfill: trpc.procedure
    .input((input: { jobId: string }) => input)
    .mutation(({ input }) => getVectorService().cancelSimilarityBackfill(input)),
  findDuplicateCandidates: trpc.procedure
    .input(
      (input: {
        files: { fileId: string; hash: string }[];
        minSimilarity: number;
        useSearchIndex: boolean;
      }) => input,
    )
    .mutation(({ input }) => getVectorService().findDuplicateCandidates(input)),
  findSimilarVectorCandidates: trpc.procedure
    .input(
      (input: {
        fileId: string;
        limit?: number;
        offset?: number;
        vectorType?: SimilarityVectorType;
      }) => input,
    )
    .mutation(({ input }) => getVectorService().findSimilarVectorCandidates(input)),
  getSearchIndexStatus: trpc.procedure.mutation(() => getVectorService().getSearchIndexStatus()),
  getSimilarityBackfillProgress: trpc.procedure
    .input((input: { jobId: string }) => input)
    .mutation(({ input }) => getVectorService().getSimilarityBackfillProgress(input)),
  listFilesNeedingSimilarityIndex: trpc.procedure
    .input(
      (input: {
        afterFileId?: string;
        force?: boolean;
        includeTotal?: boolean;
        limit?: number;
        scanLimit?: number;
        vectorTypes?: SimilarityVectorType[];
      }) => input,
    )
    .mutation(({ input }) => getVectorService().listFilesNeedingSimilarityIndex(input)),
  optimizeSimilarityTables: trpc.procedure
    .input((input: { vectorTypes?: SimilarityVectorType[] }) => input)
    .mutation(({ input }) => getVectorService().optimizeSimilarityTables(input)),
  pauseSimilarityBackfills: trpc.procedure.mutation(() =>
    getVectorService().pauseSimilarityBackfills(),
  ),
  scoreFileSimilarities: trpc.procedure
    .input((input: { groups: { fileIds: string[]; referenceId: string }[] }) => input)
    .mutation(({ input }) => getVectorService().scoreFileSimilarities(input)),
  startSearchIndexBuild: trpc.procedure.mutation(() => getVectorService().startSearchIndexBuild()),
  startSimilarityBackfill: trpc.procedure
    .input(
      (input: { fileIds?: string[]; force?: boolean; vectorTypes?: SimilarityVectorType[] }) =>
        input,
    )
    .mutation(({ input }) => getVectorService().startSimilarityBackfill(input)),
});

export type VectorRouter = typeof vectorRouter;

const createVectorServer = async () => {
  const port = getConfig().ports.vector;

  server = createHTTPServer({ router: vectorRouter });

  await new Promise<void>((resolve, reject) => {
    server.server.once("error", reject);

    server.server.listen(port, "127.0.0.1", () => {
      fileLog(`[VECTOR] tRPC server listening on ${port}`);
      resolve();
    });
  });
};

Mongoose.connection.on("error", (err) =>
  fileLog(`[VECTOR] DB Error: ${err.message}`, { type: "error" }),
);

registerProcessLifecycle({
  reload: async () => {
    await loadConfig(process.env.CONFIG_PATH);
  },

  start: async (message) => {
    await loadConfig(process.env.CONFIG_PATH);
    await setLogsPath(process.env.LOGS_PATH);
    checkServerShutdown();
    Mongoose.set("strictQuery", true);
    await Mongoose.connect(message.uri, { autoIndex: false, family: 4 });
    checkServerShutdown();
    await createVectorServer();
    checkServerShutdown();
  },

  stop: async () => {
    fileLog("[VECTOR] Closing HTTP connections and cancelling background jobs...");
    vectorSimilarityService.cancelAllJobs();
    await closeHttpServer(server?.server);
    await Mongoose.connection.close(true);
    fileLog("[VECTOR] Shutdown complete.");
  },
});
