import Mongoose from "mongoose";
import {
  checkServerShutdown,
  closeHttpServer,
  registerProcessLifecycle,
} from "trabecula/utils/process";
import { createRpcServer } from "trabecula/utils/process/rpc";
import { fileLog } from "trabecula/utils/server";
import {
  SimilarityVectorType,
  VectorSimilarityService,
  vectorSimilarityService,
} from "medior/server/vector-service";
import { getConfig, loadConfig } from "medior/utils/server/config";

let server: ReturnType<typeof createRpcServer>;

export const vectorRouter = {
  cancelSearchIndexBuild: () => vectorSimilarityService.cancelSearchIndexBuild(),
  cancelSimilarityBackfill: (input: { jobId: string }) =>
    vectorSimilarityService.cancelSimilarityBackfill(input),
  findDuplicateCandidates: (input: {
    files: { fileId: string; hash: string }[];
    minSimilarity: number;
  }) => vectorSimilarityService.findDuplicateCandidates(input),
  findSimilarAudio: (input: Parameters<VectorSimilarityService["findSimilarAudio"]>[0]) =>
    vectorSimilarityService.findSimilarAudio(input),
  findSimilarVectorCandidates: (input: {
    fileId: string;
    limit?: number;
    offset?: number;
    vectorType?: SimilarityVectorType;
  }) => vectorSimilarityService.findSimilarVectorCandidates(input),
  getAudioLookupProgress: (input: { lookupId: string }) =>
    vectorSimilarityService.getAudioLookupProgress(input),
  getSearchIndexStatus: () => vectorSimilarityService.getSearchIndexStatus(),
  getSimilarityBackfillProgress: (input: { jobId: string }) =>
    vectorSimilarityService.getSimilarityBackfillProgress(input),
  listFilesNeedingSimilarityIndex: (input: {
    afterFileId?: string;
    force?: boolean;
    includeTotal?: boolean;
    limit?: number;
    scanLimit?: number;
    vectorTypes?: SimilarityVectorType[];
  }) => vectorSimilarityService.listFilesNeedingSimilarityIndex(input),
  optimizeSimilarityTables: (input: { vectorTypes?: SimilarityVectorType[] }) =>
    vectorSimilarityService.optimizeSimilarityTables(input),
  pauseSimilarityBackfills: () => vectorSimilarityService.pauseSimilarityBackfills(),
  pruneAudioVectors: (input: Parameters<VectorSimilarityService["pruneAudioVectors"]>[0]) =>
    vectorSimilarityService.pruneAudioVectors(input),
  scoreFileSimilarities: (input: { groups: { fileIds: string[]; referenceId: string }[] }) =>
    vectorSimilarityService.scoreFileSimilarities(input),
  startSearchIndexBuild: () => vectorSimilarityService.startSearchIndexBuild(),
  startSimilarityBackfill: (input: {
    fileIds?: string[];
    force?: boolean;
    vectorTypes?: SimilarityVectorType[];
  }) => vectorSimilarityService.startSimilarityBackfill(input),
  storeAudioVectors: (input: Parameters<VectorSimilarityService["storeAudioVectors"]>[0]) =>
    vectorSimilarityService.storeAudioVectors(input),
};

export type VectorRouter = typeof vectorRouter;

const createVectorServer = async () => {
  const port = getConfig().ports.vector;

  server = createRpcServer(vectorRouter);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);

    server.listen(port, "127.0.0.1", () => {
      fileLog(`[VECTOR] RPC server listening on ${port}`);
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
    await closeHttpServer(server);
    await Mongoose.connection.close(true);
    fileLog("[VECTOR] Shutdown complete.");
  },
});
