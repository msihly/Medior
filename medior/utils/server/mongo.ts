import type { SocketEventOptions } from "medior/_generated/server/socket";
import mongoose, { LeanDocument, PipelineStage, Types } from "mongoose";
import { metadataWork } from "medior/server/database/metadata-context";
import { handleErrors } from "medior/utils/common";

export const getShiftSelectedItems = async <ModelType>({
  clickedId,
  filterPipeline,
  ids = [],
  model,
  searchPlan,
  selectedIds,
}: {
  clickedId: string;
  filterPipeline: { $match: mongoose.FilterQuery<ModelType>; $sort: Record<string, 1 | -1> };
  ids?: string[];
  model: mongoose.Model<ModelType>;
  searchPlan?: { options: Record<string, unknown>; pipeline: PipelineStage[] };
  selectedIds: string[];
}) => {
  const selected = new Set(selectedIds);
  let result: { idsToDeselect: string[]; idsToSelect: string[] };

  if (!selected.size) {
    result = { idsToDeselect: [], idsToSelect: [clickedId] };
  } else if (selected.size === 1 && selected.has(clickedId)) {
    result = { idsToDeselect: [clickedId], idsToSelect: [] };
  } else {
    const cursor = ids.length
      ? null
      : model
          .aggregate<{ _id: Types.ObjectId }>([
            ...(searchPlan?.pipeline ?? [
              { $match: filterPipeline.$match },
              { $sort: filterPipeline.$sort },
            ]),
            { $project: { _id: 1 } },
          ])
          .option(searchPlan?.options ?? {})
          .allowDiskUse(true)
          .cursor({ batchSize: 1000 });

    const items = cursor ?? (await listItemsByIds({ ids, model, select: { _id: 1 } }));
    const rangeIds: string[] = [];
    const remaining = new Set(selected);
    let clickedIndex = -1;
    let firstSelectedIndex = -1;
    let index = 0;
    let lastSelectedIndex = -1;
    let startIndex = -1;

    try {
      for await (const item of items) {
        const id = String(item._id);

        if (id === clickedId) clickedIndex = index;

        if (selected.has(id)) {
          if (firstSelectedIndex < 0) firstSelectedIndex = index;

          lastSelectedIndex = index;
          remaining.delete(id);
        }

        if (clickedIndex >= 0 || firstSelectedIndex >= 0) {
          if (startIndex < 0) startIndex = index;

          rangeIds.push(id);
        }

        if (
          clickedIndex >= 0 &&
          ((clickedIndex >= firstSelectedIndex && firstSelectedIndex >= 0) || !remaining.size)
        )
          break;

        index++;
      }
    } finally {
      await cursor?.close();
    }

    if (clickedIndex < 0) {
      throw new Error("The clicked item is no longer in the search results");
    } else if (clickedIndex === firstSelectedIndex) {
      result = { idsToDeselect: [clickedId], idsToSelect: [] };
    } else {
      const endIndex =
        firstSelectedIndex < 0
          ? clickedIndex
          : clickedIndex < firstSelectedIndex
            ? lastSelectedIndex
            : clickedIndex;

      const nextIds = rangeIds.slice(0, endIndex - startIndex + 1);
      const nextSelected = new Set(nextIds);

      result = {
        idsToDeselect: [...selected].filter((id) => !nextSelected.has(id)),
        idsToSelect: nextIds.filter((id) => !selected.has(id)),
      };
    }
  }

  return result;
};

export const leanModelToJson = <T>(
  doc: LeanDocument<T & { __v?: number; _id: Types.ObjectId }>,
) => {
  try {
    if (!doc) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, __v, ...rest } = doc;

    return { ...rest, id: _id.toString() } as unknown as T;
  } catch (err) {
    console.error(err.message);

    return null;
  }
};

/** Resolve membership in bounded batches and fetch metadata only for the requested page. */
export const listItemsByIds = async <ModelType>({
  ids,
  model,
  page,
  pageSize,
  select,
}: {
  ids: string[];
  model: mongoose.Model<ModelType>;
  page?: number;
  pageSize?: number;
  select?: Record<string, number>;
}) => {
  type Item = LeanDocument<ModelType & { _id: Types.ObjectId }>;

  const requestedIds = [...new Set(ids)];
  const items: Item[] = [];
  const isPaged = page !== undefined;
  const start = isPaged ? Math.max(0, page - 1) * pageSize : 0;
  const end = isPaged ? start + pageSize : Infinity;
  let matched = 0;

  for (let offset = 0; offset < requestedIds.length && matched < end; offset += 1000) {
    const batch = requestedIds.slice(offset, offset + 1000);
    const found = await model
      .find({ _id: { $in: objectIds(batch) } })
      .select(isPaged ? { _id: 1 } : select)
      .lean<Item[]>();

    const byId = new Map(found.map((item) => [String(item._id), item]));
    const ordered = batch.filter((id) => byId.has(id));
    const pageIds = ordered.slice(Math.max(0, start - matched), Math.max(0, end - matched));

    if (isPaged && pageIds.length && !(select?._id === 1 && Object.keys(select).length === 1)) {
      const documents = await model
        .find({ _id: { $in: objectIds(pageIds) } })
        .select(select)
        .lean<Item[]>();

      const documentsById = new Map(documents.map((item) => [String(item._id), item]));

      for (const id of pageIds) {
        const document = documentsById.get(id);

        if (document) items.push(document);
      }
    } else {
      for (const id of pageIds) items.push(byId.get(id));
    }

    matched += ordered.length;
  }

  return items;
};

export const makeAction =
  <Input, Output>(
    fn: (input: Input, opts?: SocketEventOptions) => Promise<Output>,
    onSuccess?: (input: Input, result: Output, opts?: SocketEventOptions) => void,
  ) =>
  (
    args: Input,
    opts?: SocketEventOptions,
  ): Promise<{ data?: Output; error?: string; success: boolean }> => {
    const execute = async () => {
      const result = await fn(args, opts);
      onSuccess?.(args, result, opts);

      return result;
    };

    return metadataWork.getStore()
      ? execute().then((data) => ({ data, success: true as const }))
      : handleErrors(execute);
  };

export const objectId = (id: string) => new Types.ObjectId(id);

export const objectIds = (ids: string[]) => ids.map(objectId);
