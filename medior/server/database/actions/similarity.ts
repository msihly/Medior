import * as models from "medior/_generated/server/models";
import { SimilarityCandidate, SimilarityVectorType } from "medior/server/vector-service";
import { leanModelToJson, makeAction, objectIds } from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";

export const findSimilarFiles = makeAction(
  async (args: { fileId: string; limit?: number; vectorTypes?: SimilarityVectorType[] }) => {
    const candidates = (await vectorTrpc.findSimilarVectorCandidates.mutate(args)).filter(
      (candidate) => candidate.fileId !== args.fileId,
    ) as SimilarityCandidate[];

    const fileIds = candidates.map((candidate) => candidate.fileId);
    if (!fileIds.length) return { candidates: [], items: [] };

    const files = (await models.FileModel.find({ _id: { $in: objectIds(fileIds) } }).lean()).map(
      leanModelToJson<models.FileSchema>,
    );

    const tagIds = [...new Set(files.flatMap((file) => file.tagIdsWithAncestors))];
    const tags = tagIds.length
      ? (await models.TagModel.find({ _id: { $in: objectIds(tagIds) } }).lean()).map(
          leanModelToJson<models.TagSchema>,
        )
      : [];

    const fileMap = new Map(
      files.map((file) => [
        file.id,
        {
          ...file,
          tags: tags.filter((tag) => file.tagIds.includes(tag.id)),
        },
      ]),
    );

    return {
      candidates,
      items: fileIds.map((id) => fileMap.get(id)).filter(Boolean),
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
      vectorTypes?: SimilarityVectorType[];
    } = {},
  ) => await vectorTrpc.startSimilarityBackfill.mutate(args),
);
