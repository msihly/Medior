import { FileModel, FileSchema } from "medior/_generated/server/models";
import { FilterQuery, PipelineStage } from "mongoose";
import { getBackgroundSession } from "medior/server/database/database-context";
import { resolveAncestorFilter } from "medior/server/database/tag-ancestry";
import { FILE_PATH_SEARCH_INDEX } from "medior/utils/common/constants";

let originalPathIndexPromise: Promise<string>;

export const countFileSearchResults = async (filter: FilterQuery<FileSchema>, limit?: number) => {
  const searchPlan = await createFileSearchPlan(filter, { _id: 1 });
  let count: number;

  if (searchPlan.options.hint) {
    const [result] = await FileModel.aggregate<{ count: number }>([
      ...searchPlan.pipeline,
      ...(limit > 0 ? [{ $limit: limit }] : []),
      { $count: "count" },
    ])
      .option(searchPlan.options)
      .allowDiskUse(true)
      .exec();

    count = result?.count ?? 0;
  } else {
    count = await FileModel.countDocuments(filter, { limit }).allowDiskUse(true);
  }

  return count;
};

export const createFileSearchPlan = async (
  filter: FilterQuery<FileSchema>,
  projection?: Record<string, 1>,
) => {
  const plan: {
    hasRegex: boolean;
    options: { hint?: Record<string, 1> };
    pipeline: PipelineStage[];
  } = {
    hasRegex: hasFileSearchRegex(filter),
    options: {},
    pipeline: [{ $match: filter }],
  };
  const requiredFilters = getRequiredFileSearchFilters(filter);
  const hasRequiredOriginalPath = requiredFilters.some(
    (part) => part.originalPath?.$regex instanceof RegExp,
  );
  const isCovered =
    projection &&
    Object.keys(projection).every((field) => Object.hasOwn(FILE_PATH_SEARCH_INDEX, field)) &&
    isCoveredFileSearchFilter(filter);

  const hasIndexedConstraint = requiredFilters.some((part) =>
    FileModel.schema.indexes().some((index) => {
      const field = Object.keys(index[0])[0];
      const condition = part[field];

      return (
        !["isArchived", "originalPath"].includes(field) &&
        condition !== undefined &&
        (condition === null ||
          typeof condition !== "object" ||
          ["$all", "$eq", "$gt", "$gte", "$in", "$lt", "$lte"].some(
            (operator) => condition[operator] !== undefined,
          ))
      );
    }),
  );

  // Preserve index selection for searches narrowed by IDs, tags, dates, or other indexed fields.
  if (
    !requiredFilters.some((part) => part._id?.$in) &&
    ((isCovered && hasFileSearchRegex(filter, ["originalPath"])) ||
      (hasRequiredOriginalPath && !hasIndexedConstraint))
  ) {
    // The API disables automatic index creation. Concurrent searches share this build.
    originalPathIndexPromise ??= FileModel.collection
      .createIndex(FILE_PATH_SEARCH_INDEX, { unique: false })
      .catch((error) => {
        originalPathIndexPromise = undefined;

        throw error;
      });

    await originalPathIndexPromise;

    plan.options.hint = FILE_PATH_SEARCH_INDEX;

    if (isCovered) {
      plan.pipeline = [{ $match: filter }, { $project: projection }];
    } else {
      const indexFilters = requiredFilters.flatMap((part) =>
        Object.entries(part)
          .filter(([field]) => Object.hasOwn(FILE_PATH_SEARCH_INDEX, field))
          .map(([field, condition]) => ({ [field]: condition })),
      );
      // Aggregate middleware does not resolve inherited tags inside lookup pipelines.
      const lookupFilter = await resolveAncestorFilter(filter, getBackgroundSession());

      plan.pipeline = [
        // Keep the first match and projection covered by the compact path index. Even an
        // unanchored, case-insensitive regex can scan keys without loading every file.
        { $match: { $and: indexFilters } },
        { $project: { _id: 1 } },
        {
          $lookup: {
            as: "file",
            foreignField: "_id",
            from: FileModel.collection.name,
            localField: "_id",
            pipeline: [{ $match: lookupFilter }, ...(projection ? [{ $project: projection }] : [])],
          },
        },
        { $unwind: "$file" },
        { $replaceRoot: { newRoot: "$file" } },
      ];
    }
  }

  return plan;
};

export const createFileSearchSortStages = (
  sort: Record<string, 1 | -1>,
  hasRegex: boolean,
): PipelineStage[] => {
  let stages: PipelineStage[];

  if (hasRegex) {
    // Computed sort keys keep regex filtering ahead of sorting and discard large metadata.
    stages = [
      {
        $replaceRoot: {
          newRoot: {
            _id: "$_id",
            sort: Object.fromEntries(Object.keys(sort).map((field) => [field, "$" + field])),
          },
        },
      },
      {
        $sort: Object.fromEntries(
          Object.entries(sort).map(([field, direction]) => ["sort." + field, direction]),
        ),
      },
    ];
  } else {
    stages = [{ $sort: sort }];
  }

  return stages;
};

const getRequiredFileSearchFilters = (
  filter: FilterQuery<FileSchema>,
): FilterQuery<FileSchema>[] => [
  filter,
  ...(filter.$and ?? []).flatMap(getRequiredFileSearchFilters),
  ...(filter.$or?.length === 1 ? getRequiredFileSearchFilters(filter.$or[0]) : []),
];

const hasFileSearchRegex = (
  filter: FilterQuery<FileSchema>,
  fields = ["diffusionParams", "originalPath", "transcription.text"],
): boolean =>
  fields.some((field) => filter[field]?.$regex instanceof RegExp) ||
  ["$and", "$nor", "$or"].some((operator) =>
    filter[operator]?.some((part: FilterQuery<FileSchema>) => hasFileSearchRegex(part, fields)),
  );

const isCoveredFileSearchFilter = (filter: FilterQuery<FileSchema>): boolean =>
  Object.entries(filter).every(([field, condition]) =>
    ["$and", "$nor", "$or"].includes(field)
      ? condition.every(isCoveredFileSearchFilter)
      : Object.hasOwn(FILE_PATH_SEARCH_INDEX, field),
  );
