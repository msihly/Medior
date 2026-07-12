import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import killPort from "kill-port";
import Mongoose from "mongoose";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import { SimilarityVectorType, vectorSimilarityService } from "medior/server/vector-service";
import { sleep } from "medior/utils/common";
import { getConfig, loadConfig } from "medior/utils/server/config";

const trpc = initTRPC.create();

let server: ReturnType<typeof createHTTPServer>;

const getVectorService = () => {
  if (!vectorSimilarityService) throw new Error("Vector service not initialized");
  return vectorSimilarityService;
};

export const vectorRouter = trpc.router({
  findSimilarVectorCandidates: trpc.procedure
    .input(
      (input: { fileId: string; limit?: number; vectorTypes?: SimilarityVectorType[] }) => input,
    )
    .mutation(({ input }) => getVectorService().findSimilarVectorCandidates(input)),
  cancelSimilarityBackfill: trpc.procedure
    .input((input: { jobId: string }) => input)
    .mutation(({ input }) => getVectorService().cancelSimilarityBackfill(input)),
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

  if (server) {
    server.server.close();
    await sleep(500);
  }

  await killPort(port);
  await vectorSimilarityService.init();
  server = createHTTPServer({ router: vectorRouter });

  await new Promise<void>((resolve) => {
    // @ts-expect-error
    server.listen(port, () => {
      fileLog(`[VECTOR] tRPC server listening on ${port}`);
      resolve();
    });
  });
};

Mongoose.connection.on("error", (err) =>
  fileLog(`[VECTOR] DB Error: ${err.message}`, { type: "error" }),
);

process.on("message", async (msg: any) => {
  if (msg?.type === "start") {
    try {
      await loadConfig(process.env.CONFIG_PATH);
      await setLogsPath(process.env.LOGS_PATH);

      const uri = msg.uri;
      fileLog(`[VECTOR] Connecting to db: ${uri}`);

      Mongoose.set("strictQuery", true);
      await Mongoose.connect(uri, { family: 4 });

      fileLog("[VECTOR] Connected to db.");

      await createVectorServer();
      process.send?.({ type: "ready" });
    } catch (err: any) {
      process.send?.({ type: "error", error: err.message });
    }
  }
});
