import {
  FileImportBatchModel,
  FileImportBatchSchema,
  FileImportModel,
} from "medior/_generated/server/models";
import type { FilterQuery, PipelineStage } from "mongoose";

/** Resolve file-path clauses against entries without materializing a library-sized ID list. */
export const createImportBatchSearchPipeline = (filter: FilterQuery<FileImportBatchSchema>) => {
  const aliases: string[] = [];
  const lookups: PipelineStage[] = [];

  const transform = (clause: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(clause)) {
      if (["$and", "$nor", "$or"].includes(key)) {
        result[key] = value.map(transform);
      } else if (key === "imports") {
        const alias = `matchingImports${aliases.length}`;

        aliases.push(alias);
        lookups.push({
          $lookup: {
            as: alias,
            foreignField: "batchId",
            from: FileImportModel.collection.name,
            localField: "_id",
            pipeline: [{ $match: value.$elemMatch }, { $limit: 1 }, { $project: { _id: 1 } }],
          },
        });
        result[`${alias}.0`] = { $exists: true };
      } else {
        result[key] = value;
      }
    }

    return result;
  };

  const match = transform(filter);
  const pipeline: PipelineStage[] = [];

  if (lookups.length && filter.isCompleted !== undefined)
    pipeline.push({ $match: { isCompleted: filter.isCompleted } });

  pipeline.push(...lookups, { $match: match });

  if (aliases.length) pipeline.push({ $unset: aliases });

  return pipeline;
};

export const countImportBatchSearchResults = async (
  filter: FilterQuery<FileImportBatchSchema>,
  limit?: number,
) => {
  const pipeline = createImportBatchSearchPipeline(filter);

  if (limit) pipeline.push({ $limit: limit });

  const [result] = await FileImportBatchModel.aggregate<{ count: number }>([
    ...pipeline,
    { $count: "count" },
  ]).allowDiskUse(true);

  return result?.count ?? 0;
};
