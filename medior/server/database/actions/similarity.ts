import * as models from "medior/_generated/server/models";
import { startRepairChild } from "medior/server/database/repair-progress";
import type { SimilarityVectorType } from "medior/server/vector-service";
import { makeAction, objectIds } from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";

export const findSimilarFiles = makeAction(
  async (args: {
    fileId: string;
    limit?: number;
    offset?: number;
    vectorType?: SimilarityVectorType;
  }) => {
    const { candidates, hasMore, nextOffset } =
      await vectorTrpc.findSimilarVectorCandidates.mutate(args);

    const fileIds = candidates.map((candidate) => candidate.fileId);
    const files = await models.FileModel.find({
      _id: { $in: objectIds(fileIds) },
      isArchived: { $ne: true },
    })
      .select({ _id: 1 })
      .lean();

    const availableIds = new Set(files.map((file) => String(file._id)));

    return {
      candidates: candidates.filter((candidate) => availableIds.has(candidate.fileId)),
      hasMore,
      nextOffset,
    };
  },
);

export const listFilesNeedingSimilarityIndex = makeAction(
  async (
    args: {
      afterFileId?: string;
      force?: boolean;
      includeTotal?: boolean;
      limit?: number;
      scanLimit?: number;
      vectorTypes?: SimilarityVectorType[];
    } = {},
  ) => await vectorTrpc.listFilesNeedingSimilarityIndex.mutate(args),
);

export const optimizeFileSimilarityIndex = makeAction(
  async (args: { vectorTypes?: SimilarityVectorType[] } = {}) =>
    await vectorTrpc.optimizeSimilarityTables.mutate(args),
);

export const cancelSimilarityBackfill = makeAction(
  async (args: { jobId: string }) => await vectorTrpc.cancelSimilarityBackfill.mutate(args),
);

export const getSimilarityBackfillProgress = makeAction(
  async (args: { jobId: string }) => await vectorTrpc.getSimilarityBackfillProgress.mutate(args),
);

export const getSimilaritySearchIndexStatus = makeAction(
  async () => await vectorTrpc.getSearchIndexStatus.mutate(),
);

export const rebuildFileSimilarityIndex = makeAction(
  async (
    args: {
      fileIds?: string[];
      force?: boolean;
      vectorTypes?: SimilarityVectorType[];
    } = {},
  ) => await vectorTrpc.startSimilarityBackfill.mutate(args),
);

export const startSimilarityBackfill = makeAction(
  async (
    args: {
      fileIds?: string[];
      force?: boolean;
      repairId?: string;
      vectorTypes?: SimilarityVectorType[];
    } = {},
  ) => {
    const { repairId, ...options } = args;

    const start = () => vectorTrpc.startSimilarityBackfill.mutate(options);

    return repairId
      ? startRepairChild(repairId, start, (job) =>
          vectorTrpc.cancelSimilarityBackfill.mutate({ jobId: job.jobId }),
        )
      : start();
  },
);

export const startSimilaritySearchIndexBuild = makeAction(
  async ({ repairId }: { repairId: string }) =>
    await startRepairChild(
      repairId,
      () => vectorTrpc.startSearchIndexBuild.mutate(),
      () => vectorTrpc.cancelSearchIndexBuild.mutate(),
    ),
);
