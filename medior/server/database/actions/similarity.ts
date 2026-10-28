import * as models from "medior/_generated/server/models";
import { QueryFilter } from "mongoose";
import { fileLog } from "trabecula/utils/server";
import { startRepairChild } from "medior/server/database/repair-progress";
import { getFileFilterMatch } from "medior/server/lower-resolution";
import type { SimilarityVectorType } from "medior/server/vector-service";
import { embedAudioSegment, getConfig, makeAction, objectIds, socket } from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";
import { workSignal } from "medior/utils/server/work-signal";

/** Leaves out candidates that are archived, deleted, or not chosen by the filter menu's filter. */
const filterAvailableCandidates = async <Candidate extends { fileId: string }>(
  candidates: Candidate[],
  filterMatch: QueryFilter<models.FileSchema> | null,
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
 * Progress is sent each second under `lookupId`, with the search's own progress from the vector
 * process.
 */
export const findSimilarAudio = makeAction(
  async ({
    end,
    fileId,
    filter = null,
    limit = getConfig().file.similarity.defaultLimit,
    lookupId,
    offset = 0,
    start,
  }: {
    end: number;
    fileId: string;
    filter?: string | null;
    limit?: number;
    lookupId?: string;
    offset?: number;
    start: number;
  }) => {
    if (!(start >= 0 && end > start))
      throw new Error("Mark In (A) must be set before Mark Out (B) to compare audio.");

    const startedAt = performance.now();
    const timings: string[] = [];
    let stageStartedAt = startedAt;

    let isFinished = false;
    let isPolling = false;
    let isSearching = false;
    let message = "Loading the file.";
    let progress: number;

    const reportProgress = (nextMessage: string, nextProgress?: number) => {
      message = nextMessage;
      progress = nextProgress;
    };

    const recordTiming = (stage: string) => {
      const now = performance.now();

      timings.push(`${stage}: ${Math.round(now - stageStartedAt)}ms`);
      stageStartedAt = now;
    };

    const emitProgress = () =>
      socket.emitVolatile("onSimilarAudioProgress", {
        elapsed: Math.floor((performance.now() - startedAt) / 1000),
        lookupId,
        message,
        progress,
      });

    // A slow reply skips later ticks rather than overlapping them, so progress stays in order.
    const updateProgress = async () => {
      if (isPolling) return;

      isPolling = true;

      try {
        if (isSearching) {
          const searchProgress = await vectorTrpc.getAudioLookupProgress.mutate({ lookupId });

          if (isSearching && searchProgress)
            reportProgress(searchProgress.message, searchProgress.progress);
        }
      } catch (error) {
        console.error("Failed to read audio lookup progress:", error);
      } finally {
        isPolling = false;
      }

      if (!isFinished) emitProgress();
    };

    const progressTimer = lookupId ? setInterval(updateProgress, 1000) : null;

    if (progressTimer) emitProgress();

    try {
      const file = await models.FileModel.findById(fileId)
        .select({ audioCodec: 1, path: 1 })
        .lean();
      if (!file) throw new Error("File not found.");
      if (!file.audioCodec || file.audioCodec === "None")
        throw new Error("This file has no audio.");

      if (filter) reportProgress("Finding the files the filter chooses.");

      const filterMatch = await getFileFilterMatch(filter);
      const fileIds = filterMatch
        ? (
            await models.FileModel.find({ $and: [filterMatch, { isArchived: { $ne: true } }] })
              .select({ _id: 1 })
              .lean()
          ).map((match) => String(match._id))
        : undefined;
      if (fileIds && !fileIds.length) return { candidates: [], hasMore: false, nextOffset: offset };

      recordTiming("file and filter lookup");

      const vector = await embedAudioSegment(
        file.path,
        { end, start },
        workSignal.getStore(),
        reportProgress,
      );

      recordTiming("audio embedding");
      reportProgress("Searching audio vectors.");
      isSearching = true;

      const { candidates, hasMore, nextOffset } = await vectorTrpc.findSimilarAudio.mutate({
        exclude: { end, fileId, start },
        fileIds,
        limit,
        lookupId,
        offset,
        vector,
      });

      isSearching = false;
      recordTiming("vector search");
      reportProgress("Checking matches.");

      const available = await filterAvailableCandidates(candidates, null);

      recordTiming("match check");

      return { candidates: available, hasMore, nextOffset };
    } finally {
      isFinished = true;

      if (progressTimer) clearInterval(progressTimer);

      fileLog(
        `[Similar audio] ${Math.round(performance.now() - startedAt)}ms; ${timings.join("; ")}`,
      );
    }
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
