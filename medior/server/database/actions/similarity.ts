import * as models from "medior/_generated/server/models";
import { FilterQuery } from "mongoose";
import { startRepairChild } from "medior/server/database/repair-progress";
import { getFileFilterMatch } from "medior/server/lower-resolution";
import type { SimilarityVectorType } from "medior/server/vector-service";
import { embedAudioSegment, getConfig, makeAction, objectIds } from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";

/** Leaves out candidates that are archived, deleted, or not chosen by the filter menu's filter. */
const filterAvailableCandidates = async <Candidate extends { fileId: string }>(
  candidates: Candidate[],
  filterMatch: FilterQuery<models.FileSchema> | null,
) => {
  const files = await models.FileModel.find({
    $and: [
      filterMatch ?? {},
      {
        _id: { $in: objectIds(candidates.map((candidate) => candidate.fileId)) },
        isArchived: { $ne: true },
      },
    ],
  })
    .select({ _id: 1 })
    .lean();

  const availableIds = new Set(files.map((file) => String(file._id)));

  return candidates.filter((candidate) => availableIds.has(candidate.fileId));
};

/**
 * The files whose audio best matches a stretch of one file's audio, each with its closest moment.
 * Only the files the filter menu's saved filter chooses are searched, rather than filtering results.
 */
export const findSimilarAudio = makeAction(
  async ({
    end,
    fileId,
    filter = null,
    limit = getConfig().file.similarity.defaultLimit,
    offset = 0,
    start,
  }: {
    end: number;
    fileId: string;
    filter?: string | null;
    limit?: number;
    offset?: number;
    start: number;
  }) => {
    if (!(start >= 0 && end > start))
      throw new Error("Mark In (A) must be set before Mark Out (B) to compare audio.");

    const file = await models.FileModel.findById(fileId).select({ audioCodec: 1, path: 1 }).lean();
    if (!file) throw new Error("File not found.");
    if (!file.audioCodec || file.audioCodec === "None") throw new Error("This file has no audio.");

    const filterMatch = await getFileFilterMatch(filter);
    const fileIds = filterMatch
      ? (
          await models.FileModel.find({ $and: [filterMatch, { isArchived: { $ne: true } }] })
            .select({ _id: 1 })
            .lean()
        ).map((match) => String(match._id))
      : undefined;
    if (fileIds && !fileIds.length) return { candidates: [], hasMore: false, nextOffset: offset };

    const vector = await embedAudioSegment(file.path, { end, start });

    const { candidates, hasMore, nextOffset } = await vectorTrpc.findSimilarAudio.mutate({
      exclude: { end, fileId, start },
      fileIds,
      limit,
      offset,
      vector,
    });

    return { candidates: await filterAvailableCandidates(candidates, null), hasMore, nextOffset };
  },
);

/** The files most similar to one file, restricted to those the filter menu's saved filter chooses. */
export const findSimilarFiles = makeAction(
  async ({
    filter = null,
    ...args
  }: {
    fileId: string;
    filter?: string | null;
    limit?: number;
    offset?: number;
    vectorType?: SimilarityVectorType;
  }) => {
    const { candidates, hasMore, nextOffset } =
      await vectorTrpc.findSimilarVectorCandidates.mutate(args);

    return {
      candidates: await filterAvailableCandidates(candidates, await getFileFilterMatch(filter)),
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
