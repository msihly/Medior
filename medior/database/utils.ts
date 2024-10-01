import mongoose, { LeanDocument, PipelineStage, Types } from "mongoose";
import { handleErrors } from "medior/utils";

export const getShiftSelectedItems = async <ModelType>({
  clickedId,
  clickedIndex,
  filterPipeline,
  ids,
  model,
  selectedIds,
}: {
  clickedId: string;
  clickedIndex: number;
  filterPipeline: { $match: mongoose.FilterQuery<ModelType>; $sort: { [key: string]: 1 | -1 } };
  ids?: string[];
  model: mongoose.Model<ModelType>;
  selectedIds: string[];
}) => {
  if (selectedIds.length === 0) return { idsToDeselect: [], idsToSelect: [clickedId] };
  if (selectedIds.length === 1 && selectedIds[0] === clickedId)
    return { idsToDeselect: [clickedId], idsToSelect: [] };

  const createMainPipeline = (args: {
    endIndex: number;
    filterPipeline: mongoose.FilterQuery<ModelType>;
    isFirstAfterClicked: boolean;
    limit: number;
    selectedIds: string[];
    skip: number;
    startIndex: number;
  }): PipelineStage[] => [
    ...(ids.length > 0
      ? [
          { $match: { _id: { $in: objectIds(ids) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(ids), "$_id"] } } },
          { $sort: { __order: 1 } },
        ]
      : [{ $match: args.filterPipeline.$match }, { $sort: args.filterPipeline.$sort }]),
    ...(args.limit > -1 ? [{ $limit: args.limit }] : []),
    ...(args.skip > -1 ? [{ $skip: args.skip }] : []),
    { $project: { _id: 1 } },
    { $group: { _id: null, filteredIds: { $push: "$_id" } } },
    {
      $addFields: {
        selectedIdsNotInFiltered: {
          $filter: {
            input: objectIds(args.selectedIds),
            as: "id",
            cond: { $not: { $in: ["$$id", "$filteredIds"] } },
          },
        },
        selectedIdsInFiltered: {
          $filter: {
            input: objectIds(args.selectedIds),
            as: "id",
            cond: { $in: ["$$id", "$filteredIds"] },
          },
        },
      },
    },
    {
      $addFields: {
        newSelectedIds:
          args.startIndex === args.endIndex
            ? []
            : args.isFirstAfterClicked
              ? { $slice: ["$filteredIds", 0, args.limit] }
              : { $slice: ["$filteredIds", 0, args.limit - args.skip] },
      },
    },
    {
      $addFields: {
        idsToDeselect: {
          $concatArrays: [
            "$selectedIdsNotInFiltered",
            {
              $filter: {
                input: "$selectedIdsInFiltered",
                as: "id",
                cond: { $not: { $in: ["$$id", "$newSelectedIds"] } },
              },
            },
          ],
        },
        idsToSelect: {
          $filter: {
            input: "$newSelectedIds",
            as: "id",
            cond: { $not: { $in: ["$$id", objectIds(args.selectedIds)] } },
          },
        },
      },
    },
    { $project: { _id: 0, idsToDeselect: 1, idsToSelect: 1 } },
  ];

  const getSelectedIndex = async (type: "first" | "last") => {
    let selectedItems: any[];
    let sortKey;
    let sortOp;

    const hasIds = ids?.length > 0;

    if (hasIds) {
      selectedItems = await model
        .aggregate([
          { $match: { _id: { $in: objectIds(selectedIds) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(ids), "$_id"] } } },
          { $sort: { __order: 1 } },
        ])
        .allowDiskUse(true)
        .exec();
    } else {
      sortKey = Object.keys(filterPipeline.$sort)[0];
      sortOp = filterPipeline.$sort[sortKey] === -1 ? "$gt" : "$lt";

      selectedItems = await model
        .find({ _id: { $in: objectIds(selectedIds) } })
        .sort(filterPipeline.$sort)
        .lean();
    }

    if (!selectedItems || selectedItems.length === 0)
      throw new Error(`Failed to load selected tags`);

    const selectedItem =
      type === "first" ? selectedItems[0] : selectedItems[selectedItems.length - 1];

    if (hasIds) return ids.indexOf(selectedItem._id.toString());

    const selectedItemIndex = await model.countDocuments({
      ...filterPipeline.$match,
      $or: [
        { [sortKey]: selectedItem[sortKey], _id: { [sortOp]: selectedItem._id } },
        { [sortKey]: { [sortOp]: selectedItem[sortKey] } },
      ],
    });
    if (!(selectedItemIndex > -1)) throw new Error(`Failed to load ${type} selected index`);
    return selectedItemIndex;
  };

  const firstSelectedIndex = await getSelectedIndex("first");
  if (!(firstSelectedIndex > -1)) return { idsToDeselect: [], idsToSelect: [clickedId] };
  if (firstSelectedIndex === clickedIndex) return { idsToDeselect: [clickedId], idsToSelect: [] };

  const isFirstAfterClicked = firstSelectedIndex > clickedIndex;
  const lastSelectedIndex = isFirstAfterClicked ? await getSelectedIndex("last") : null;
  const endIndex = isFirstAfterClicked ? lastSelectedIndex : clickedIndex;
  const startIndex = isFirstAfterClicked ? clickedIndex : firstSelectedIndex;

  const mainPipeline = createMainPipeline({
    endIndex,
    filterPipeline,
    isFirstAfterClicked,
    limit: endIndex + 1,
    selectedIds,
    skip: startIndex,
    startIndex,
  });

  const mainRes: {
    idsToDeselect: string[];
    idsToSelect: string[];
  } = (await model.aggregate(mainPipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
  if (!mainRes) throw new Error("Failed to load shift selected item IDs");

  return mainRes;
};

export const leanModelToJson = <T>(
  doc: LeanDocument<T & { _id: Types.ObjectId; __v?: number }>
) => {
  try {
    if (!doc) return null;
    const { _id, __v, ...rest } = doc;
    return { ...rest, id: _id.toString() } as unknown as T;
  } catch (err) {
    console.error(err.stack);
    return null;
  }
};

export const makeAction =
  <Input, Output>(fn: (input: Input) => Promise<Output>) =>
  (args: Input) =>
    handleErrors(async () => await fn(args));

export const objectId = (id: string) => new Types.ObjectId(id);

export const objectIds = (ids: string[]) => ids.map(objectId);
