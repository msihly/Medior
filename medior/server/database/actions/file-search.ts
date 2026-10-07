import {
  createFileFilterPipeline,
  CreateFileFilterPipelineInput,
} from "medior/_generated/server/actions";
import { FileModel } from "medior/_generated/server/models";
import { Types } from "mongoose";
import {
  createFileSearchPlan,
  createFileSearchSortStages,
} from "medior/server/database/file-search";
import { listItemsByIds, makeAction } from "medior/utils/server";

export const listFileSearchIds = makeAction(
  async ({
    forcePages,
    limit,
    ...filterParams
  }: CreateFileFilterPipelineInput & {
    forcePages?: boolean;
    limit?: number;
  }) => {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
      throw new Error("Enter a positive whole number");

    let ids: string[] = [];

    if (forcePages || filterParams.ids?.length) {
      const files = await listItemsByIds({
        ids: filterParams.ids ?? [],
        model: FileModel,
        ...(limit ? { page: 1, pageSize: limit } : {}),
        select: { _id: 1 },
      });

      ids = files.map((file) => String(file._id));
    } else {
      const filterPipeline = await createFileFilterPipeline(filterParams);
      const searchPlan = await createFileSearchPlan(
        filterPipeline.$match,
        Object.fromEntries(Object.keys(filterPipeline.$sort).map((field) => [field, 1])),
      );
      const cursor = FileModel.aggregate<{ _id: Types.ObjectId }>([
        ...searchPlan.pipeline,
        ...createFileSearchSortStages(filterPipeline.$sort, searchPlan.hasRegex),
        ...(limit ? [{ $limit: limit }] : []),
        { $project: { _id: 1 } },
      ])
        .option(searchPlan.options)
        .allowDiskUse(true)
        .cursor({ batchSize: 1000 });

      try {
        for await (const file of cursor) ids.push(String(file._id));
      } finally {
        await cursor.close();
      }
    }

    return ids;
  },
);
