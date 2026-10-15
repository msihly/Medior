import * as models from "medior/_generated/server/models";
import { startRepairChild } from "medior/server/database/repair-progress";
import { findVariations } from "medior/server/duplicate-quality";
import { getFileFilterMatch, getLibraryVariationSettings } from "medior/server/lower-resolution";
import type { SimilarityVectorType } from "medior/server/vector-service";
import {
  leanModelToJson,
  makeAction,
  objectIds,
  sortByStoredNtfsIdentity,
} from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";

/**
 * The files most similar to one file, restricted to those the filter menu's saved filter chooses.
 * Each is compared with the file the way Find Duplicates marks variations, so copies can be told
 * apart from edited versions that score as high.
 */
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

    const variationFields = { height: 1, thumb: 1, width: 1 };
    const [filterMatch, settings] = await Promise.all([
      getFileFilterMatch(filter),
      getLibraryVariationSettings(),
    ]);
    const [source, files] = await Promise.all([
      models.FileModel.findById(args.fileId).select(variationFields).lean(),
      models.FileModel.find({
        $and: [
          filterMatch ?? {},
          {
            _id: { $in: objectIds(candidates.map((candidate) => candidate.fileId)) },
            isArchived: { $ne: true },
          },
        ],
      })
        .select(variationFields)
        .lean(),
    ]);
    const available = files.map((file) => leanModelToJson<models.FileSchema>(file));

    // Thumbnails are read in disk order, which keeps a hard drive from seeking between them.
    const variations = source
      ? await findVariations(
          leanModelToJson<models.FileSchema>(source),
          sortByStoredNtfsIdentity(available, (file) => ({
            fileId: file.thumb?.ntfsFileId,
            volumeId: file.thumb?.ntfsVolumeId,
          })),
          settings,
        )
      : new Map<string, { difference: number | null; isVariation: boolean }>();
    const availableIds = new Set(available.map((file) => file.id));

    return {
      candidates: candidates
        .filter((candidate) => availableIds.has(candidate.fileId))
        .map((candidate) => ({
          ...candidate,
          difference: variations.get(candidate.fileId)?.difference ?? null,
          isVariation: !!variations.get(candidate.fileId)?.isVariation,
        })),
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
