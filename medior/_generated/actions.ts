/* --------------------------------------------------------------------------- */
/*                               THIS IS A GENERATED FILE. DO NOT EDIT.
/* --------------------------------------------------------------------------- */
import * as models from "medior/_generated/models";
import { SocketEventOptions } from "medior/_generated/socket";
import { FilterQuery } from "mongoose";
import * as Types from "medior/server/database/types";
import {
  getShiftSelectedItems,
  leanModelToJson,
  makeAction,
  objectIds,
} from "medior/server/database/utils";
import { SortMenuProps } from "medior/components";
import { dayjs, isDeepEqual, LogicalOp, logicOpsToMongo, setObj } from "medior/utils/common";
import { socket } from "medior/utils/server";

/* --------------------------------------------------------------------------- */
/*                               SEARCH ACTIONS
/* --------------------------------------------------------------------------- */

export type CreateFileCollectionFilterPipelineInput = {
  dateCreatedEnd?: string;
  dateCreatedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedStart?: string;
  excludedDescTagIds?: string[];
  excludedTagIds?: string[];
  fileCount?: { logOp: LogicalOp | ""; value: number };
  ids?: string[];
  optionalTagIds?: string[];
  rating?: { logOp: LogicalOp | ""; value: number };
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  sortValue?: SortMenuProps["value"];
  title?: string;
};

export const createFileCollectionFilterPipeline = (
  args: CreateFileCollectionFilterPipelineInput,
) => {
  const $match: FilterQuery<models.FileCollectionSchema> = {};

  if (!isDeepEqual(args.dateCreatedEnd, ""))
    setObj($match, ["dateCreated", "$lte"], args.dateCreatedEnd);
  if (!isDeepEqual(args.dateCreatedStart, ""))
    setObj($match, ["dateCreated", "$gte"], args.dateCreatedStart);
  if (!isDeepEqual(args.dateModifiedEnd, ""))
    setObj($match, ["dateModified", "$lte"], args.dateModifiedEnd);
  if (!isDeepEqual(args.dateModifiedStart, ""))
    setObj($match, ["dateModified", "$gte"], args.dateModifiedStart);
  if (!isDeepEqual(args.fileCount, { logOp: "", value: 0 }))
    setObj($match, ["fileCount", logicOpsToMongo(args.fileCount.logOp)], args.fileCount.value);
  if (!isDeepEqual(args.ids, [])) setObj($match, ["_id", "$in"], objectIds(args.ids));
  if (!isDeepEqual(args.rating, { logOp: "", value: 0 }))
    setObj($match, ["rating", logicOpsToMongo(args.rating.logOp)], args.rating.value);
  if (!isDeepEqual(args.title, ""))
    setObj($match, ["title", "$regex"], new RegExp(args.title, "i"));

  if (args.excludedDescTagIds?.length)
    setObj($match, ["tagIdsWithAncestors", "$nin"], objectIds(args.excludedDescTagIds));
  if (args.excludedTagIds?.length)
    setObj($match, ["tagIds", "$nin"], objectIds(args.excludedTagIds));
  if (args.optionalTagIds?.length)
    setObj($match, ["tagIds", "$in"], objectIds(args.optionalTagIds));
  if (args.requiredDescTagIds?.length)
    setObj($match, ["tagIdsWithAncestors", "$all"], objectIds(args.requiredDescTagIds));
  if (args.requiredTagIds?.length)
    setObj($match, ["tagIds", "$all"], objectIds(args.requiredTagIds));

  const sortDir = args.sortValue.isDesc ? -1 : 1;

  return {
    $match,
    $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export type GetShiftSelectedFileCollectionInput = CreateFileCollectionFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  selectedIds: string[];
};

export const getShiftSelectedFileCollection = makeAction(
  async ({
    clickedId,
    clickedIndex,
    selectedIds,
    ...filterParams
  }: GetShiftSelectedFileCollectionInput) => {
    const filterPipeline = createFileCollectionFilterPipeline(filterParams);
    return getShiftSelectedItems({
      clickedId,
      clickedIndex,
      filterPipeline,
      ids: filterParams.ids,
      model: models.FileCollectionModel,
      selectedIds,
    });
  },
);

export type GetFilteredFileCollectionCountInput = CreateFileCollectionFilterPipelineInput & {
  pageSize: number;
};

export const getFilteredFileCollectionCount = makeAction(
  async ({ pageSize, ...filterParams }: GetFilteredFileCollectionCountInput) => {
    const filterPipeline = createFileCollectionFilterPipeline(filterParams);
    const count = await models.FileCollectionModel.countDocuments(
      filterPipeline.$match,
    ).allowDiskUse(true);
    if (!(count > -1)) throw new Error("Failed to load filtered FileCollection");
    return { count, pageCount: Math.ceil(count / pageSize) };
  },
);

export type ListFilteredFileCollectionInput = CreateFileCollectionFilterPipelineInput & {
  forcePages?: boolean;
  page: number;
  pageSize: number;
  select?: Record<string, 1 | -1>;
};

export const listFilteredFileCollection = makeAction(
  async ({
    forcePages,
    page,
    pageSize,
    select,
    ...filterParams
  }: ListFilteredFileCollectionInput) => {
    const filterPipeline = createFileCollectionFilterPipeline(filterParams);
    const hasIds = forcePages || filterParams.ids?.length > 0;

    const items = await (hasIds
      ? models.FileCollectionModel.aggregate([
          { $match: { _id: { $in: objectIds(filterParams.ids) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
          { $sort: { __order: 1 } },
          ...(forcePages
            ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }]
            : []),
        ])
          .allowDiskUse(true)
          .exec()
      : models.FileCollectionModel.find(filterPipeline.$match)
          .sort(filterPipeline.$sort)
          .select(select)
          .skip(Math.max(0, page - 1) * pageSize)
          .limit(pageSize)
          .allowDiskUse(true)
          .lean());

    if (!items) throw new Error("Failed to load filtered FileCollection");
    return items.map((i) => leanModelToJson<models.FileCollectionSchema>(i));
  },
);

export type CreateFileImportBatchFilterPipelineInput = {
  collectionTitle?: string;
  completedAtEnd?: string;
  completedAtStart?: string;
  dateCreatedEnd?: string;
  dateCreatedStart?: string;
  excludedDescTagIds?: string[];
  excludedTagIds?: string[];
  fileCount?: { logOp: LogicalOp | ""; value: number };
  ids?: string[];
  isCompleted?: boolean;
  optionalTagIds?: string[];
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  rootFolderPath?: string;
  sortValue?: SortMenuProps["value"];
  startedAtEnd?: string;
  startedAtStart?: string;
};

export const createFileImportBatchFilterPipeline = (
  args: CreateFileImportBatchFilterPipelineInput,
) => {
  const $match: FilterQuery<models.FileImportBatchSchema> = {};

  if (!isDeepEqual(args.collectionTitle, ""))
    setObj($match, ["collectionTitle", "$regex"], new RegExp(args.collectionTitle, "i"));
  if (!isDeepEqual(args.completedAtEnd, ""))
    setObj($match, ["completedAt", "$lte"], args.completedAtEnd);
  if (!isDeepEqual(args.completedAtStart, ""))
    setObj($match, ["completedAt", "$gte"], args.completedAtStart);
  if (!isDeepEqual(args.dateCreatedEnd, ""))
    setObj($match, ["dateCreated", "$lte"], args.dateCreatedEnd);
  if (!isDeepEqual(args.dateCreatedStart, ""))
    setObj($match, ["dateCreated", "$gte"], args.dateCreatedStart);
  if (!isDeepEqual(args.fileCount, { logOp: "", value: 0 }))
    setObj($match, ["fileCount", logicOpsToMongo(args.fileCount.logOp)], args.fileCount.value);
  if (!isDeepEqual(args.ids, [])) setObj($match, ["_id", "$in"], objectIds(args.ids));
  if (!isDeepEqual(args.isCompleted, true))
    setObj(
      $match,
      ["$expr"],
      args.isCompleted
        ? { $eq: ["$isCompleted", true] }
        : { $eq: [{ $ifNull: ["$isCompleted", false] }, false] },
    );
  if (!isDeepEqual(args.rootFolderPath, ""))
    setObj($match, ["rootFolderPath", "$regex"], new RegExp(args.rootFolderPath, "i"));
  if (!isDeepEqual(args.startedAtEnd, "")) setObj($match, ["startedAt", "$lte"], args.startedAtEnd);
  if (!isDeepEqual(args.startedAtStart, ""))
    setObj($match, ["startedAt", "$gte"], args.startedAtStart);

  if (args.excludedDescTagIds?.length)
    setObj($match, ["tagIdsWithAncestors", "$nin"], objectIds(args.excludedDescTagIds));
  if (args.excludedTagIds?.length)
    setObj($match, ["tagIds", "$nin"], objectIds(args.excludedTagIds));
  if (args.optionalTagIds?.length)
    setObj($match, ["tagIds", "$in"], objectIds(args.optionalTagIds));
  if (args.requiredDescTagIds?.length)
    setObj($match, ["tagIdsWithAncestors", "$all"], objectIds(args.requiredDescTagIds));
  if (args.requiredTagIds?.length)
    setObj($match, ["tagIds", "$all"], objectIds(args.requiredTagIds));

  const sortDir = args.sortValue.isDesc ? -1 : 1;

  return {
    $match,
    $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export type GetShiftSelectedFileImportBatchInput = CreateFileImportBatchFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  selectedIds: string[];
};

export const getShiftSelectedFileImportBatch = makeAction(
  async ({
    clickedId,
    clickedIndex,
    selectedIds,
    ...filterParams
  }: GetShiftSelectedFileImportBatchInput) => {
    const filterPipeline = createFileImportBatchFilterPipeline(filterParams);
    return getShiftSelectedItems({
      clickedId,
      clickedIndex,
      filterPipeline,
      ids: filterParams.ids,
      model: models.FileImportBatchModel,
      selectedIds,
    });
  },
);

export type GetFilteredFileImportBatchCountInput = CreateFileImportBatchFilterPipelineInput & {
  pageSize: number;
};

export const getFilteredFileImportBatchCount = makeAction(
  async ({ pageSize, ...filterParams }: GetFilteredFileImportBatchCountInput) => {
    const filterPipeline = createFileImportBatchFilterPipeline(filterParams);
    const count = await models.FileImportBatchModel.countDocuments(
      filterPipeline.$match,
    ).allowDiskUse(true);
    if (!(count > -1)) throw new Error("Failed to load filtered FileImportBatch");
    return { count, pageCount: Math.ceil(count / pageSize) };
  },
);

export type ListFilteredFileImportBatchInput = CreateFileImportBatchFilterPipelineInput & {
  forcePages?: boolean;
  page: number;
  pageSize: number;
  select?: Record<string, 1 | -1>;
};

export const listFilteredFileImportBatch = makeAction(
  async ({
    forcePages,
    page,
    pageSize,
    select,
    ...filterParams
  }: ListFilteredFileImportBatchInput) => {
    const filterPipeline = createFileImportBatchFilterPipeline(filterParams);
    const hasIds = forcePages || filterParams.ids?.length > 0;

    const items = await (hasIds
      ? models.FileImportBatchModel.aggregate([
          { $match: { _id: { $in: objectIds(filterParams.ids) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
          { $sort: { __order: 1 } },
          ...(forcePages
            ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }]
            : []),
        ])
          .allowDiskUse(true)
          .exec()
      : models.FileImportBatchModel.find(filterPipeline.$match)
          .sort(filterPipeline.$sort)
          .select(select)
          .skip(Math.max(0, page - 1) * pageSize)
          .limit(pageSize)
          .allowDiskUse(true)
          .lean());

    if (!items) throw new Error("Failed to load filtered FileImportBatch");
    return items.map((i) => leanModelToJson<models.FileImportBatchSchema>(i));
  },
);

export type CreateFileFilterPipelineInput = {
  bitrate?: { logOp: LogicalOp | ""; value: number };
  dateCreatedEnd?: string;
  dateCreatedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedStart?: string;
  duration?: { logOp: LogicalOp | ""; value: number };
  excludedDescTagIds?: string[];
  excludedFileIds?: string[];
  excludedTagIds?: string[];
  frameRate?: { logOp: LogicalOp | ""; value: number };
  hasDiffParams?: boolean;
  ids?: string[];
  isArchived?: boolean;
  isCorrupted?: boolean;
  isModified?: boolean;
  maxHeight?: number;
  maxSize?: number;
  maxWidth?: number;
  minHeight?: number;
  minSize?: number;
  minWidth?: number;
  numOfTags?: { logOp: LogicalOp | ""; value: number };
  optionalTagIds?: string[];
  originalPath?: string;
  rating?: { logOp: LogicalOp | ""; value: number };
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  selectedAudioCodecs?: Types.SelectedAudioCodecs;
  selectedImageExts?: Types.SelectedImageExts;
  selectedVideoCodecs?: Types.SelectedVideoCodecs;
  selectedVideoExts?: Types.SelectedVideoExts;
  sortValue?: SortMenuProps["value"];
};

export const createFileFilterPipeline = (args: CreateFileFilterPipelineInput) => {
  const $match: FilterQuery<models.FileSchema> = {};

  if (!isDeepEqual(args.bitrate, { logOp: "", value: 0 }))
    setObj($match, ["bitrate", logicOpsToMongo(args.bitrate.logOp)], args.bitrate.value);
  if (!isDeepEqual(args.dateCreatedEnd, ""))
    setObj($match, ["dateCreated", "$lte"], args.dateCreatedEnd);
  if (!isDeepEqual(args.dateCreatedStart, ""))
    setObj($match, ["dateCreated", "$gte"], args.dateCreatedStart);
  if (!isDeepEqual(args.dateModifiedEnd, ""))
    setObj($match, ["dateModified", "$lte"], args.dateModifiedEnd);
  if (!isDeepEqual(args.dateModifiedStart, ""))
    setObj($match, ["dateModified", "$gte"], args.dateModifiedStart);
  if (!isDeepEqual(args.duration, { logOp: "", value: 0 }))
    setObj($match, ["duration", logicOpsToMongo(args.duration.logOp)], args.duration.value);
  if (!isDeepEqual(args.excludedFileIds, []))
    setObj($match, ["_id", "$nin"], objectIds(args.excludedFileIds));
  if (!isDeepEqual(args.frameRate, { logOp: "", value: 0 }))
    setObj($match, ["frameRate", logicOpsToMongo(args.frameRate.logOp)], args.frameRate.value);
  if (!isDeepEqual(args.hasDiffParams, false))
    setObj(
      $match,
      ["$expr", "$and"],
      [{ $eq: [{ $type: "$diffusionParams" }, "string"] }, { $ne: ["$diffusionParams", ""] }],
    );
  if (!isDeepEqual(args.ids, [])) setObj($match, ["_id", "$in"], objectIds(args.ids));
  if (!isDeepEqual(args.isCorrupted, null))
    setObj(
      $match,
      ["$expr"],
      args.isCorrupted
        ? { $eq: ["$isCorrupted", true] }
        : { $eq: [{ $ifNull: ["$isCorrupted", false] }, false] },
    );
  if (!isDeepEqual(args.isModified, null))
    setObj(
      $match,
      ["$expr", "$and"],
      [
        { $eq: [{ $type: "$originalHash" }, "string"] },
        { $ne: ["$originalHash", ""] },
        { [args.isModified ? "$ne" : "$eq"]: ["$hash", "$originalHash"] },
      ],
    );
  if (!isDeepEqual(args.maxHeight, null)) setObj($match, ["height", "$lte"], args.maxHeight);
  if (!isDeepEqual(args.maxSize, null)) setObj($match, ["size", "$lte"], args.maxSize);
  if (!isDeepEqual(args.maxWidth, null)) setObj($match, ["width", "$lte"], args.maxWidth);
  if (!isDeepEqual(args.minHeight, null)) setObj($match, ["height", "$gte"], args.minHeight);
  if (!isDeepEqual(args.minSize, null)) setObj($match, ["size", "$gte"], args.minSize);
  if (!isDeepEqual(args.minWidth, null)) setObj($match, ["width", "$gte"], args.minWidth);
  if (!isDeepEqual(args.numOfTags, { logOp: "", value: 0 }))
    setObj(
      $match,
      ["$expr", logicOpsToMongo(args.numOfTags.logOp)],
      [{ $size: "$tagIds" }, args.numOfTags.value],
    );
  if (!isDeepEqual(args.originalPath, null))
    setObj($match, ["originalPath", "$regex"], new RegExp(args.originalPath, "i"));
  if (!isDeepEqual(args.rating, { logOp: "", value: 0 }))
    setObj($match, ["rating", logicOpsToMongo(args.rating.logOp)], args.rating.value);

  if (true) setObj($match, ["isArchived"], args.isArchived);
  if (true)
    setObj(
      $match,
      ["audioCodec", "$nin"],
      Object.entries(args.selectedAudioCodecs)
        .filter(([, val]) => !val)
        .map(([ext]) => ext),
    );
  if (true)
    setObj(
      $match,
      ["ext", "$nin"],
      Object.entries({ ...args.selectedImageExts, ...args.selectedVideoExts })
        .filter(([, val]) => !val)
        .map(([ext]) => ext),
    );
  if (true)
    setObj(
      $match,
      ["videoCodec", "$nin"],
      Object.entries(args.selectedVideoCodecs)
        .filter(([, val]) => !val)
        .map(([ext]) => ext),
    );
  if (args.excludedDescTagIds?.length)
    setObj($match, ["tagIdsWithAncestors", "$nin"], objectIds(args.excludedDescTagIds));
  if (args.excludedTagIds?.length)
    setObj($match, ["tagIds", "$nin"], objectIds(args.excludedTagIds));
  if (args.optionalTagIds?.length)
    setObj($match, ["tagIds", "$in"], objectIds(args.optionalTagIds));
  if (args.requiredDescTagIds?.length)
    setObj($match, ["tagIdsWithAncestors", "$all"], objectIds(args.requiredDescTagIds));
  if (args.requiredTagIds?.length)
    setObj($match, ["tagIds", "$all"], objectIds(args.requiredTagIds));

  const sortDir = args.sortValue.isDesc ? -1 : 1;

  return {
    $match,
    $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export type GetShiftSelectedFileInput = CreateFileFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  selectedIds: string[];
};

export const getShiftSelectedFile = makeAction(
  async ({ clickedId, clickedIndex, selectedIds, ...filterParams }: GetShiftSelectedFileInput) => {
    const filterPipeline = createFileFilterPipeline(filterParams);
    return getShiftSelectedItems({
      clickedId,
      clickedIndex,
      filterPipeline,
      ids: filterParams.ids,
      model: models.FileModel,
      selectedIds,
    });
  },
);

export type GetFilteredFileCountInput = CreateFileFilterPipelineInput & { pageSize: number };

export const getFilteredFileCount = makeAction(
  async ({ pageSize, ...filterParams }: GetFilteredFileCountInput) => {
    const filterPipeline = createFileFilterPipeline(filterParams);
    const count = await models.FileModel.countDocuments(filterPipeline.$match).allowDiskUse(true);
    if (!(count > -1)) throw new Error("Failed to load filtered File");
    return { count, pageCount: Math.ceil(count / pageSize) };
  },
);

export type ListFilteredFileInput = CreateFileFilterPipelineInput & {
  forcePages?: boolean;
  page: number;
  pageSize: number;
  select?: Record<string, 1 | -1>;
};

export const listFilteredFile = makeAction(
  async ({ forcePages, page, pageSize, select, ...filterParams }: ListFilteredFileInput) => {
    const filterPipeline = createFileFilterPipeline(filterParams);
    const hasIds = forcePages || filterParams.ids?.length > 0;

    const items = await (hasIds
      ? models.FileModel.aggregate([
          { $match: { _id: { $in: objectIds(filterParams.ids) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
          { $sort: { __order: 1 } },
          ...(forcePages
            ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }]
            : []),
        ])
          .allowDiskUse(true)
          .exec()
      : models.FileModel.find(filterPipeline.$match)
          .sort(filterPipeline.$sort)
          .select(select)
          .skip(Math.max(0, page - 1) * pageSize)
          .limit(pageSize)
          .allowDiskUse(true)
          .lean());

    if (!items) throw new Error("Failed to load filtered File");
    return items.map((i) => leanModelToJson<models.FileSchema>(i));
  },
);

export type CreateTagFilterPipelineInput = {
  alias?: string;
  count?: { logOp: LogicalOp | ""; value: number };
  dateCreatedEnd?: string;
  dateCreatedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedStart?: string;
  excludedDescTagIds?: string[];
  excludedTagIds?: string[];
  ids?: string[];
  label?: string;
  optionalTagIds?: string[];
  regExMode?: "any" | "hasRegEx" | "hasNoRegEx";
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  sortValue?: SortMenuProps["value"];
  title?: string;
};

export const createTagFilterPipeline = (args: CreateTagFilterPipelineInput) => {
  const $match: FilterQuery<models.TagSchema> = {};

  if (!isDeepEqual(args.alias, ""))
    setObj($match, ["aliases", "$elemMatch", "$regex"], new RegExp(args.alias, "i"));
  if (!isDeepEqual(args.count, { logOp: "", value: 0 }))
    setObj($match, ["count", logicOpsToMongo(args.count.logOp)], args.count.value);
  if (!isDeepEqual(args.dateCreatedEnd, ""))
    setObj($match, ["dateCreated", "$lte"], args.dateCreatedEnd);
  if (!isDeepEqual(args.dateCreatedStart, ""))
    setObj($match, ["dateCreated", "$gte"], args.dateCreatedStart);
  if (!isDeepEqual(args.dateModifiedEnd, ""))
    setObj($match, ["dateModified", "$lte"], args.dateModifiedEnd);
  if (!isDeepEqual(args.dateModifiedStart, ""))
    setObj($match, ["dateModified", "$gte"], args.dateModifiedStart);
  if (!isDeepEqual(args.ids, [])) setObj($match, ["_id", "$in"], objectIds(args.ids));
  if (!isDeepEqual(args.label, ""))
    setObj($match, ["label", "$regex"], new RegExp(args.label, "i"));
  if (!isDeepEqual(args.regExMode, "any"))
    setObj($match, ["regExMap.regEx", "$exists"], args.regExMode === "hasRegEx");
  if (!isDeepEqual(args.title, ""))
    setObj($match, ["title", "$regex"], new RegExp(args.title, "i"));

  if (args.excludedDescTagIds?.length)
    setObj($match, ["ancestorIds", "$nin"], objectIds(args.excludedDescTagIds));
  if (args.excludedTagIds?.length) setObj($match, ["_id", "$nin"], objectIds(args.excludedTagIds));
  if (args.optionalTagIds?.length) setObj($match, ["_id", "$in"], objectIds(args.optionalTagIds));
  if (args.requiredDescTagIds?.length)
    setObj($match, ["ancestorIds", "$all"], objectIds(args.requiredDescTagIds));
  if (args.requiredTagIds?.length) setObj($match, ["_id", "$all"], objectIds(args.requiredTagIds));

  const sortDir = args.sortValue.isDesc ? -1 : 1;

  return {
    $match,
    $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export type GetShiftSelectedTagInput = CreateTagFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  selectedIds: string[];
};

export const getShiftSelectedTag = makeAction(
  async ({ clickedId, clickedIndex, selectedIds, ...filterParams }: GetShiftSelectedTagInput) => {
    const filterPipeline = createTagFilterPipeline(filterParams);
    return getShiftSelectedItems({
      clickedId,
      clickedIndex,
      filterPipeline,
      ids: filterParams.ids,
      model: models.TagModel,
      selectedIds,
    });
  },
);

export type GetFilteredTagCountInput = CreateTagFilterPipelineInput & { pageSize: number };

export const getFilteredTagCount = makeAction(
  async ({ pageSize, ...filterParams }: GetFilteredTagCountInput) => {
    const filterPipeline = createTagFilterPipeline(filterParams);
    const count = await models.TagModel.countDocuments(filterPipeline.$match).allowDiskUse(true);
    if (!(count > -1)) throw new Error("Failed to load filtered Tag");
    return { count, pageCount: Math.ceil(count / pageSize) };
  },
);

export type ListFilteredTagInput = CreateTagFilterPipelineInput & {
  forcePages?: boolean;
  page: number;
  pageSize: number;
  select?: Record<string, 1 | -1>;
};

export const listFilteredTag = makeAction(
  async ({ forcePages, page, pageSize, select, ...filterParams }: ListFilteredTagInput) => {
    const filterPipeline = createTagFilterPipeline(filterParams);
    const hasIds = forcePages || filterParams.ids?.length > 0;

    const items = await (hasIds
      ? models.TagModel.aggregate([
          { $match: { _id: { $in: objectIds(filterParams.ids) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
          { $sort: { __order: 1 } },
          ...(forcePages
            ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }]
            : []),
        ])
          .allowDiskUse(true)
          .exec()
      : models.TagModel.find(filterPipeline.$match)
          .sort(filterPipeline.$sort)
          .select(select)
          .skip(Math.max(0, page - 1) * pageSize)
          .limit(pageSize)
          .allowDiskUse(true)
          .lean());

    if (!items) throw new Error("Failed to load filtered Tag");
    return items.map((i) => leanModelToJson<models.TagSchema>(i));
  },
);

/* --------------------------------------------------------------------------- */
/*                               MODEL ACTIONS
/* --------------------------------------------------------------------------- */

/* ------------------------------------ DeletedFile ----------------------------------- */
export const createDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateDeletedFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString() };

    const res = await models.DeletedFileModel.create(model);
    const id = res._id.toString();

    socket.emit("onDeletedFileCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteDeletedFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.DeletedFileModel.deleteMany({ _id: { $in: args.ids } });
    socket.emit("onDeletedFileDeleted", args, socketOpts);
  },
);

export const listDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: { args?: Types.ListDeletedFileInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.DeletedFileModel.find(filter)
        .sort(args.sort ?? { hash: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.DeletedFileModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered DeletedFile");

    return {
      items: items.map((item) => leanModelToJson<models.DeletedFileSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateDeletedFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.DeletedFileSchema>(
      await models.DeletedFileModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );
    socket.emit("onDeletedFileUpdated", args, socketOpts);
    return res;
  },
);
/* ------------------------------------ FileCollection ----------------------------------- */
export const createFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateFileCollectionInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      dateModified: null,
      fileCount: 0,
      rating: 0,
      tagIds: [],
      tagIdsWithAncestors: [],
      thumbs: null,
    };

    const res = await models.FileCollectionModel.create(model);
    const id = res._id.toString();

    socket.emit("onFileCollectionCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteFileCollectionInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.FileCollectionModel.deleteMany({ _id: { $in: args.ids } });
    socket.emit("onFileCollectionDeleted", args, socketOpts);
  },
);

export const listFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: { args?: Types.ListFileCollectionInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.FileCollectionModel.find(filter)
        .sort(args.sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.FileCollectionModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered FileCollection");

    return {
      items: items.map((item) => leanModelToJson<models.FileCollectionSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateFileCollection = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateFileCollectionInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.FileCollectionSchema>(
      await models.FileCollectionModel.findByIdAndUpdate(args.id, args.updates, {
        new: true,
      }).lean(),
    );
    socket.emit("onFileCollectionUpdated", args, socketOpts);
    return res;
  },
);
/* ------------------------------------ FileImportBatch ----------------------------------- */
export const createFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateFileImportBatchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      fileCount: 0,
      imports: [],
      isCompleted: false,
      tagIds: [],
      tagIdsWithAncestors: [],
    };

    const res = await models.FileImportBatchModel.create(model);
    const id = res._id.toString();

    socket.emit("onFileImportBatchCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteFileImportBatchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.FileImportBatchModel.deleteMany({ _id: { $in: args.ids } });
    socket.emit("onFileImportBatchDeleted", args, socketOpts);
  },
);

export const listFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: { args?: Types.ListFileImportBatchInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.FileImportBatchModel.find(filter)
        .sort(args.sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.FileImportBatchModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered FileImportBatch");

    return {
      items: items.map((item) => leanModelToJson<models.FileImportBatchSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateFileImportBatch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateFileImportBatchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.FileImportBatchSchema>(
      await models.FileImportBatchModel.findByIdAndUpdate(args.id, args.updates, {
        new: true,
      }).lean(),
    );
    socket.emit("onFileImportBatchUpdated", args, socketOpts);
    return res;
  },
);
/* ------------------------------------ File ----------------------------------- */
export const createFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString() };

    const res = await models.FileModel.create(model);
    const id = res._id.toString();

    socket.emit("onFileCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.FileModel.deleteMany({ _id: { $in: args.ids } });
    socket.emit("onFileDeleted", args, socketOpts);
  },
);

export const listFile = makeAction(
  async ({
    args,
    socketOpts,
  }: { args?: Types.ListFileInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.FileModel.find(filter)
        .sort(args.sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.FileModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered File");

    return {
      items: items.map((item) => leanModelToJson<models.FileSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.FileSchema>(
      await models.FileModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );
    socket.emit("onFileUpdated", args, socketOpts);
    return res;
  },
);
/* ------------------------------------ Tag ----------------------------------- */
export const _createTag = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types._CreateTagInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      aliases: [],
      ancestorIds: [],
      childIds: [],
      descendantIds: [],
      parentIds: [],
      thumb: null,
    };

    const res = await models.TagModel.create(model);
    const id = res._id.toString();

    socket.emit("onTagCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const _deleteTag = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types._DeleteTagInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.TagModel.deleteMany({ _id: { $in: args.ids } });
    socket.emit("onTagDeleted", args, socketOpts);
  },
);

export const listTag = makeAction(
  async ({
    args,
    socketOpts,
  }: { args?: Types.ListTagInput; socketOpts?: SocketEventOptions } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const [items, totalCount] = await Promise.all([
      models.TagModel.find(filter)
        .sort(args.sort ?? { dateCreated: "desc" })
        .skip(Math.max(0, args.page - 1) * args.pageSize)
        .limit(args.pageSize)
        .allowDiskUse(true)
        .lean(),
      models.TagModel.countDocuments(filter),
    ]);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered Tag");

    return {
      items: items.map((item) => leanModelToJson<models.TagSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateTag = makeAction(
  async ({ args, socketOpts }: { args: Types.UpdateTagInput; socketOpts?: SocketEventOptions }) => {
    const res = leanModelToJson<models.TagSchema>(
      await models.TagModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );
    socket.emit("onTagUpdated", args, socketOpts);
    return res;
  },
);
