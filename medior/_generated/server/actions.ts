/* --------------------------------------------------------------------------- */
/*                               THIS IS A GENERATED FILE. DO NOT EDIT.
/* --------------------------------------------------------------------------- */
import * as models from "medior/_generated/server/models";
import { SocketEventOptions } from "medior/_generated/server/socket";
import { FilterQuery } from "mongoose";
import * as Types from "medior/server/database/types";
import {
  removeFileCollectionIds,
  syncCollectionFileIds,
} from "medior/server/database/actions/collections";
import { SortMenuProps } from "medior/components";
import { dayjs, isDeepEqual, LogicalOp, logicOpsToMongo, setObj } from "medior/utils/common";
import {
  getShiftSelectedItems,
  leanModelToJson,
  makeAction,
  objectIds,
  socket,
} from "medior/utils/server";

/* --------------------------------------------------------------------------- */
/*                               SEARCH ACTIONS
/* --------------------------------------------------------------------------- */

export type CreateFileCollectionFilterPipelineInput = {
  dateCreatedEnd?: string;
  dateCreatedMode?: "optional" | "required";
  dateCreatedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedMode?: "optional" | "required";
  dateModifiedStart?: string;
  excludedDescTagIds?: string[];
  excludedTagIds?: string[];
  fileCount?: { logOp: LogicalOp | ""; value: number };
  fileCountMode?: "optional" | "required";
  ids?: string[];
  maxSize?: number;
  minSize?: number;
  optionalTagIds?: string[];
  rating?: { logOp: LogicalOp | ""; value: number };
  ratingMode?: "optional" | "required";
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  sizeMode?: "optional" | "required";
  sortValue?: SortMenuProps["value"];
  title?: string;
  titleMode?: "optional" | "required";
};

export const createFileCollectionFilterPipeline = (
  args: CreateFileCollectionFilterPipelineInput,
) => {
  const $match: FilterQuery<models.FileCollectionSchema> = {};

  if (args.ids != null && !isDeepEqual(args.ids, []))
    setObj($match, ["_id", "$in"], objectIds(args.ids));

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

  {
    const filter: FilterQuery<models.FileCollectionSchema> = {};
    if (
      args.dateCreatedEnd != null &&
      args.dateCreatedEnd !== "" &&
      !isDeepEqual(args.dateCreatedEnd, "")
    )
      setObj(filter, ["dateCreated", "$lte"], args.dateCreatedEnd);
    if (
      args.dateCreatedStart != null &&
      args.dateCreatedStart !== "" &&
      !isDeepEqual(args.dateCreatedStart, "")
    )
      setObj(filter, ["dateCreated", "$gte"], args.dateCreatedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateCreatedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileCollectionSchema> = {};
    if (
      args.dateModifiedEnd != null &&
      args.dateModifiedEnd !== "" &&
      !isDeepEqual(args.dateModifiedEnd, "")
    )
      setObj(filter, ["dateModified", "$lte"], args.dateModifiedEnd);
    if (
      args.dateModifiedStart != null &&
      args.dateModifiedStart !== "" &&
      !isDeepEqual(args.dateModifiedStart, "")
    )
      setObj(filter, ["dateModified", "$gte"], args.dateModifiedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateModifiedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileCollectionSchema> = {};
    if (args.fileCount?.logOp && args.fileCount?.value != null)
      setObj(filter, ["fileCount", logicOpsToMongo(args.fileCount.logOp)], args.fileCount.value);
    if (Object.keys(filter).length) {
      const operator = args.fileCountMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileCollectionSchema> = {};
    if (args.rating?.logOp && args.rating?.value != null)
      setObj(filter, ["rating", logicOpsToMongo(args.rating.logOp)], args.rating.value);
    if (Object.keys(filter).length) {
      const operator = args.ratingMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileCollectionSchema> = {};
    if (args.maxSize != null && !isDeepEqual(args.maxSize, null))
      setObj(filter, ["size", "$lte"], args.maxSize);
    if (args.minSize != null && !isDeepEqual(args.minSize, null))
      setObj(filter, ["size", "$gte"], args.minSize);
    if (Object.keys(filter).length) {
      const operator = args.sizeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileCollectionSchema> = {};
    if (args.title != null && args.title !== "" && !isDeepEqual(args.title, ""))
      setObj(filter, ["title", "$regex"], new RegExp(args.title, "i"));
    if (Object.keys(filter).length) {
      const operator = args.titleMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }

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
  curMaxPage: number;
  page: number;
  pageSize: number;
  withFull: boolean;
};

export const getFilteredFileCollectionCount = makeAction(
  async ({
    curMaxPage,
    pageSize,
    withFull,
    ...filterParams
  }: GetFilteredFileCollectionCountInput) => {
    const filterPipeline = createFileCollectionFilterPipeline(filterParams);

    if (withFull) {
      const totalDocs = await models.FileCollectionModel.countDocuments(
        filterPipeline.$match,
      ).allowDiskUse(true);
      const pageCount = Math.ceil(totalDocs / pageSize);
      return { count: totalDocs, pageCount };
    }

    const targetPage = filterParams.page;
    const targetMaxPage = targetPage >= curMaxPage ? curMaxPage + 1000 : curMaxPage;
    const probeLimit = targetMaxPage * pageSize;
    const probeCount = await models.FileCollectionModel.countDocuments(filterPipeline.$match, {
      limit: probeLimit,
    }).allowDiskUse(true);

    const pageCount = probeCount < probeLimit ? Math.ceil(probeCount / pageSize) : targetMaxPage;

    return { count: probeCount, pageCount };
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
  collectionTitleMode?: "optional" | "required";
  completedAtEnd?: string;
  completedAtMode?: "optional" | "required";
  completedAtStart?: string;
  dateCreatedEnd?: string;
  dateCreatedMode?: "optional" | "required";
  dateCreatedStart?: string;
  excludedDescTagIds?: string[];
  excludedTagIds?: string[];
  fileCount?: { logOp: LogicalOp | ""; value: number };
  fileCountMode?: "optional" | "required";
  filePath?: string;
  filePathMode?: "optional" | "required";
  ids?: string[];
  isCompleted?: boolean;
  optionalTagIds?: string[];
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  sortValue?: SortMenuProps["value"];
  startedAtEnd?: string;
  startedAtMode?: "optional" | "required";
  startedAtStart?: string;
};

export const createFileImportBatchFilterPipeline = (
  args: CreateFileImportBatchFilterPipelineInput,
) => {
  const $match: FilterQuery<models.FileImportBatchSchema> = {};

  if (args.ids != null && !isDeepEqual(args.ids, []))
    setObj($match, ["_id", "$in"], objectIds(args.ids));

  if (true) setObj($match, ["isCompleted"], args.isCompleted);
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

  {
    const filter: FilterQuery<models.FileImportBatchSchema> = {};
    if (
      args.collectionTitle != null &&
      args.collectionTitle !== "" &&
      !isDeepEqual(args.collectionTitle, "")
    )
      setObj(filter, ["collectionTitle", "$regex"], new RegExp(args.collectionTitle, "i"));
    if (Object.keys(filter).length) {
      const operator = args.collectionTitleMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileImportBatchSchema> = {};
    if (
      args.completedAtEnd != null &&
      args.completedAtEnd !== "" &&
      !isDeepEqual(args.completedAtEnd, "")
    )
      setObj(filter, ["completedAt", "$lte"], args.completedAtEnd);
    if (
      args.completedAtStart != null &&
      args.completedAtStart !== "" &&
      !isDeepEqual(args.completedAtStart, "")
    )
      setObj(filter, ["completedAt", "$gte"], args.completedAtStart);
    if (Object.keys(filter).length) {
      const operator = args.completedAtMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileImportBatchSchema> = {};
    if (
      args.dateCreatedEnd != null &&
      args.dateCreatedEnd !== "" &&
      !isDeepEqual(args.dateCreatedEnd, "")
    )
      setObj(filter, ["dateCreated", "$lte"], args.dateCreatedEnd);
    if (
      args.dateCreatedStart != null &&
      args.dateCreatedStart !== "" &&
      !isDeepEqual(args.dateCreatedStart, "")
    )
      setObj(filter, ["dateCreated", "$gte"], args.dateCreatedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateCreatedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileImportBatchSchema> = {};
    if (args.fileCount?.logOp && args.fileCount?.value != null)
      setObj(filter, ["fileCount", logicOpsToMongo(args.fileCount.logOp)], args.fileCount.value);
    if (Object.keys(filter).length) {
      const operator = args.fileCountMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileImportBatchSchema> = {};
    if (args.filePath != null && args.filePath !== "" && !isDeepEqual(args.filePath, null))
      setObj(filter, ["imports", "$elemMatch", "path", "$regex"], new RegExp(args.filePath, "i"));
    if (Object.keys(filter).length) {
      const operator = args.filePathMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileImportBatchSchema> = {};
    if (
      args.startedAtEnd != null &&
      args.startedAtEnd !== "" &&
      !isDeepEqual(args.startedAtEnd, "")
    )
      setObj(filter, ["startedAt", "$lte"], args.startedAtEnd);
    if (
      args.startedAtStart != null &&
      args.startedAtStart !== "" &&
      !isDeepEqual(args.startedAtStart, "")
    )
      setObj(filter, ["startedAt", "$gte"], args.startedAtStart);
    if (Object.keys(filter).length) {
      const operator = args.startedAtMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }

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
  curMaxPage: number;
  page: number;
  pageSize: number;
  withFull: boolean;
};

export const getFilteredFileImportBatchCount = makeAction(
  async ({
    curMaxPage,
    pageSize,
    withFull,
    ...filterParams
  }: GetFilteredFileImportBatchCountInput) => {
    const filterPipeline = createFileImportBatchFilterPipeline(filterParams);

    if (withFull) {
      const totalDocs = await models.FileImportBatchModel.countDocuments(
        filterPipeline.$match,
      ).allowDiskUse(true);
      const pageCount = Math.ceil(totalDocs / pageSize);
      return { count: totalDocs, pageCount };
    }

    const targetPage = filterParams.page;
    const targetMaxPage = targetPage >= curMaxPage ? curMaxPage + 1000 : curMaxPage;
    const probeLimit = targetMaxPage * pageSize;
    const probeCount = await models.FileImportBatchModel.countDocuments(filterPipeline.$match, {
      limit: probeLimit,
    }).allowDiskUse(true);

    const pageCount = probeCount < probeLimit ? Math.ceil(probeCount / pageSize) : targetMaxPage;

    return { count: probeCount, pageCount };
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

export type CreateFileTransformFilterPipelineInput = {
  afterSize?: { logOp: LogicalOp | ""; value: number };
  afterSizeMode?: "optional" | "required";
  beforePath?: string;
  beforePathMode?: "optional" | "required";
  beforeSize?: { logOp: LogicalOp | ""; value: number };
  beforeSizeMode?: "optional" | "required";
  completedAtEnd?: string;
  completedAtMode?: "optional" | "required";
  completedAtStart?: string;
  dateCreatedEnd?: string;
  dateCreatedMode?: "optional" | "required";
  dateCreatedStart?: string;
  ids?: string[];
  isCompleted?: boolean;
  sortValue?: SortMenuProps["value"];
  startedAtEnd?: string;
  startedAtMode?: "optional" | "required";
  startedAtStart?: string;
  status?: string;
  statusMode?: "optional" | "required";
  type?: string;
  typeMode?: "optional" | "required";
};

export const createFileTransformFilterPipeline = (args: CreateFileTransformFilterPipelineInput) => {
  const $match: FilterQuery<models.FileTransformSchema> = {};

  if (args.ids != null && !isDeepEqual(args.ids, []))
    setObj($match, ["_id", "$in"], objectIds(args.ids));

  if (true) setObj($match, ["isCompleted"], args.isCompleted);

  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (args.afterSize?.logOp && args.afterSize?.value != null)
      setObj(filter, ["afterSize", logicOpsToMongo(args.afterSize.logOp)], args.afterSize.value);
    if (Object.keys(filter).length) {
      const operator = args.afterSizeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (args.beforePath != null && args.beforePath !== "" && !isDeepEqual(args.beforePath, null))
      setObj(filter, ["beforePath", "$regex"], new RegExp(args.beforePath, "i"));
    if (Object.keys(filter).length) {
      const operator = args.beforePathMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (args.beforeSize?.logOp && args.beforeSize?.value != null)
      setObj(filter, ["beforeSize", logicOpsToMongo(args.beforeSize.logOp)], args.beforeSize.value);
    if (Object.keys(filter).length) {
      const operator = args.beforeSizeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (
      args.completedAtEnd != null &&
      args.completedAtEnd !== "" &&
      !isDeepEqual(args.completedAtEnd, "")
    )
      setObj(filter, ["completedAt", "$lte"], args.completedAtEnd);
    if (
      args.completedAtStart != null &&
      args.completedAtStart !== "" &&
      !isDeepEqual(args.completedAtStart, "")
    )
      setObj(filter, ["completedAt", "$gte"], args.completedAtStart);
    if (Object.keys(filter).length) {
      const operator = args.completedAtMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (
      args.dateCreatedEnd != null &&
      args.dateCreatedEnd !== "" &&
      !isDeepEqual(args.dateCreatedEnd, "")
    )
      setObj(filter, ["dateCreated", "$lte"], args.dateCreatedEnd);
    if (
      args.dateCreatedStart != null &&
      args.dateCreatedStart !== "" &&
      !isDeepEqual(args.dateCreatedStart, "")
    )
      setObj(filter, ["dateCreated", "$gte"], args.dateCreatedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateCreatedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (
      args.startedAtEnd != null &&
      args.startedAtEnd !== "" &&
      !isDeepEqual(args.startedAtEnd, "")
    )
      setObj(filter, ["startedAt", "$lte"], args.startedAtEnd);
    if (
      args.startedAtStart != null &&
      args.startedAtStart !== "" &&
      !isDeepEqual(args.startedAtStart, "")
    )
      setObj(filter, ["startedAt", "$gte"], args.startedAtStart);
    if (Object.keys(filter).length) {
      const operator = args.startedAtMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (args.status != null && args.status !== "" && !isDeepEqual(args.status, ""))
      setObj(filter, ["status"], args.status);
    if (Object.keys(filter).length) {
      const operator = args.statusMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileTransformSchema> = {};
    if (args.type != null && args.type !== "" && !isDeepEqual(args.type, ""))
      setObj(filter, ["type"], args.type);
    if (Object.keys(filter).length) {
      const operator = args.typeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }

  const sortDir = args.sortValue.isDesc ? -1 : 1;

  return {
    $match,
    $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export type GetShiftSelectedFileTransformInput = CreateFileTransformFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  selectedIds: string[];
};

export const getShiftSelectedFileTransform = makeAction(
  async ({
    clickedId,
    clickedIndex,
    selectedIds,
    ...filterParams
  }: GetShiftSelectedFileTransformInput) => {
    const filterPipeline = createFileTransformFilterPipeline(filterParams);
    return getShiftSelectedItems({
      clickedId,
      clickedIndex,
      filterPipeline,
      ids: filterParams.ids,
      model: models.FileTransformModel,
      selectedIds,
    });
  },
);

export type GetFilteredFileTransformCountInput = CreateFileTransformFilterPipelineInput & {
  curMaxPage: number;
  page: number;
  pageSize: number;
  withFull: boolean;
};

export const getFilteredFileTransformCount = makeAction(
  async ({
    curMaxPage,
    pageSize,
    withFull,
    ...filterParams
  }: GetFilteredFileTransformCountInput) => {
    const filterPipeline = createFileTransformFilterPipeline(filterParams);

    if (withFull) {
      const totalDocs = await models.FileTransformModel.countDocuments(
        filterPipeline.$match,
      ).allowDiskUse(true);
      const pageCount = Math.ceil(totalDocs / pageSize);
      return { count: totalDocs, pageCount };
    }

    const targetPage = filterParams.page;
    const targetMaxPage = targetPage >= curMaxPage ? curMaxPage + 1000 : curMaxPage;
    const probeLimit = targetMaxPage * pageSize;
    const probeCount = await models.FileTransformModel.countDocuments(filterPipeline.$match, {
      limit: probeLimit,
    }).allowDiskUse(true);

    const pageCount = probeCount < probeLimit ? Math.ceil(probeCount / pageSize) : targetMaxPage;

    return { count: probeCount, pageCount };
  },
);

export type ListFilteredFileTransformInput = CreateFileTransformFilterPipelineInput & {
  forcePages?: boolean;
  page: number;
  pageSize: number;
  select?: Record<string, 1 | -1>;
};

export const listFilteredFileTransform = makeAction(
  async ({
    forcePages,
    page,
    pageSize,
    select,
    ...filterParams
  }: ListFilteredFileTransformInput) => {
    const filterPipeline = createFileTransformFilterPipeline(filterParams);
    const hasIds = forcePages || filterParams.ids?.length > 0;

    const items = await (hasIds
      ? models.FileTransformModel.aggregate([
          { $match: { _id: { $in: objectIds(filterParams.ids) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
          { $sort: { __order: 1 } },
          ...(forcePages
            ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }]
            : []),
        ])
          .allowDiskUse(true)
          .exec()
      : models.FileTransformModel.find(filterPipeline.$match)
          .sort(filterPipeline.$sort)
          .select(select)
          .skip(Math.max(0, page - 1) * pageSize)
          .limit(pageSize)
          .allowDiskUse(true)
          .lean());

    if (!items) throw new Error("Failed to load filtered FileTransform");
    return items.map((i) => leanModelToJson<models.FileTransformSchema>(i));
  },
);

export type CreateFileFilterPipelineInput = {
  bitrate?: { logOp: LogicalOp | ""; value: number };
  bitrateMode?: "optional" | "required";
  dateCreatedEnd?: string;
  dateCreatedMode?: "optional" | "required";
  dateCreatedStart?: string;
  dateImportedEnd?: string;
  dateImportedMode?: "optional" | "required";
  dateImportedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedMode?: "optional" | "required";
  dateModifiedStart?: string;
  diffusionParams?: string;
  diffusionParamsMode?: "optional" | "required";
  duration?: { logOp: LogicalOp | ""; value: number };
  durationMode?: "optional" | "required";
  excludedDescTagIds?: string[];
  excludedFileIds?: string[];
  excludedTagIds?: string[];
  frameRate?: { logOp: LogicalOp | ""; value: number };
  frameRateMode?: "optional" | "required";
  hasDiffParams?: boolean;
  heightMode?: "optional" | "required";
  ids?: string[];
  isArchived?: boolean;
  isCorrupted?: boolean;
  isModified?: boolean;
  isTranscribed?: boolean;
  longEdgeMode?: "optional" | "required";
  maxHeight?: number;
  maxLongEdge?: number;
  maxShortEdge?: number;
  maxSize?: number;
  maxWidth?: number;
  minHeight?: number;
  minLongEdge?: number;
  minShortEdge?: number;
  minSize?: number;
  minWidth?: number;
  numOfCollections?: { logOp: LogicalOp | ""; value: number };
  numOfCollectionsMode?: "optional" | "required";
  numOfTags?: { logOp: LogicalOp | ""; value: number };
  numOfTagsMode?: "optional" | "required";
  optionalTagIds?: string[];
  originalPath?: string;
  originalPathMode?: "optional" | "required";
  rating?: { logOp: LogicalOp | ""; value: number };
  ratingMode?: "optional" | "required";
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  selectedAudioCodecs?: Types.SelectedAudioCodecs;
  selectedImageExts?: Types.SelectedImageExts;
  selectedVideoCodecs?: Types.SelectedVideoCodecs;
  selectedVideoExts?: Types.SelectedVideoExts;
  shortEdgeMode?: "optional" | "required";
  sizeMode?: "optional" | "required";
  sortValue?: SortMenuProps["value"];
  transcription?: string;
  transcriptionMode?: "optional" | "required";
  widthMode?: "optional" | "required";
};

export const createFileFilterPipeline = (args: CreateFileFilterPipelineInput) => {
  const $match: FilterQuery<models.FileSchema> = {};

  if (args.excludedFileIds != null && !isDeepEqual(args.excludedFileIds, []))
    setObj($match, ["_id", "$nin"], objectIds(args.excludedFileIds));
  if (args.hasDiffParams != null && !isDeepEqual(args.hasDiffParams, false))
    setObj(
      $match,
      ["$expr", "$and"],
      [{ $eq: [{ $type: "$diffusionParams" }, "string"] }, { $ne: ["$diffusionParams", ""] }],
    );
  if (args.ids != null && !isDeepEqual(args.ids, []))
    setObj($match, ["_id", "$in"], objectIds(args.ids));
  if (args.isCorrupted != null && !isDeepEqual(args.isCorrupted, null))
    setObj(
      $match,
      ["$expr"],
      args.isCorrupted
        ? { $eq: ["$isCorrupted", true] }
        : { $eq: [{ $ifNull: ["$isCorrupted", false] }, false] },
    );
  if (args.isModified != null && !isDeepEqual(args.isModified, null))
    setObj(
      $match,
      ["$expr", "$and"],
      [
        { $eq: [{ $type: "$originalHash" }, "string"] },
        { $ne: ["$originalHash", ""] },
        { [args.isModified ? "$ne" : "$eq"]: ["$hash", "$originalHash"] },
      ],
    );

  if (true) setObj($match, ["isArchived"], args.isArchived);
  if (args.isTranscribed === true) setObj($match, ["hasTranscript"], true);
  if (args.isTranscribed === false) setObj($match, ["hasTranscript", "$in"], [false, null]);
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

  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.bitrate?.logOp && args.bitrate?.value != null)
      setObj(filter, ["bitrate", logicOpsToMongo(args.bitrate.logOp)], args.bitrate.value);
    if (Object.keys(filter).length) {
      const operator = args.bitrateMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (
      args.dateCreatedEnd != null &&
      args.dateCreatedEnd !== "" &&
      !isDeepEqual(args.dateCreatedEnd, "")
    )
      setObj(filter, ["dateCreated", "$lte"], args.dateCreatedEnd);
    if (
      args.dateCreatedStart != null &&
      args.dateCreatedStart !== "" &&
      !isDeepEqual(args.dateCreatedStart, "")
    )
      setObj(filter, ["dateCreated", "$gte"], args.dateCreatedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateCreatedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (
      args.dateImportedEnd != null &&
      args.dateImportedEnd !== "" &&
      !isDeepEqual(args.dateImportedEnd, "")
    )
      setObj(filter, ["dateImported", "$lte"], args.dateImportedEnd);
    if (
      args.dateImportedStart != null &&
      args.dateImportedStart !== "" &&
      !isDeepEqual(args.dateImportedStart, "")
    )
      setObj(filter, ["dateImported", "$gte"], args.dateImportedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateImportedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (
      args.dateModifiedEnd != null &&
      args.dateModifiedEnd !== "" &&
      !isDeepEqual(args.dateModifiedEnd, "")
    )
      setObj(filter, ["dateModified", "$lte"], args.dateModifiedEnd);
    if (
      args.dateModifiedStart != null &&
      args.dateModifiedStart !== "" &&
      !isDeepEqual(args.dateModifiedStart, "")
    )
      setObj(filter, ["dateModified", "$gte"], args.dateModifiedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateModifiedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (
      args.diffusionParams != null &&
      args.diffusionParams !== "" &&
      !isDeepEqual(args.diffusionParams, null)
    )
      setObj(filter, ["diffusionParams", "$regex"], new RegExp(args.diffusionParams, "i"));
    if (Object.keys(filter).length) {
      const operator = args.diffusionParamsMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.duration?.logOp && args.duration?.value != null)
      setObj(filter, ["duration", logicOpsToMongo(args.duration.logOp)], args.duration.value);
    if (Object.keys(filter).length) {
      const operator = args.durationMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.frameRate?.logOp && args.frameRate?.value != null)
      setObj(filter, ["frameRate", logicOpsToMongo(args.frameRate.logOp)], args.frameRate.value);
    if (Object.keys(filter).length) {
      const operator = args.frameRateMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.maxHeight != null && !isDeepEqual(args.maxHeight, null))
      setObj(filter, ["height", "$lte"], args.maxHeight);
    if (args.minHeight != null && !isDeepEqual(args.minHeight, null))
      setObj(filter, ["height", "$gte"], args.minHeight);
    if (Object.keys(filter).length) {
      const operator = args.heightMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.maxLongEdge != null && !isDeepEqual(args.maxLongEdge, null))
      (filter.$and ??= []).push(
        setObj({}, ["$expr", "$lte"], [{ $max: ["$width", "$height"] }, args.maxLongEdge]),
      );
    if (args.minLongEdge != null && !isDeepEqual(args.minLongEdge, null))
      (filter.$and ??= []).push(
        setObj({}, ["$expr", "$gte"], [{ $max: ["$width", "$height"] }, args.minLongEdge]),
      );
    if (Object.keys(filter).length) {
      const operator = args.longEdgeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.numOfCollections?.logOp && args.numOfCollections?.value != null)
      setObj(
        filter,
        ["$and"],
        [
          {
            $expr: {
              [logicOpsToMongo(args.numOfCollections.logOp)]: [
                { $size: { $ifNull: ["$collectionIds", []] } },
                args.numOfCollections.value,
              ],
            },
          },
        ],
      );
    if (Object.keys(filter).length) {
      const operator = args.numOfCollectionsMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.numOfTags?.logOp && args.numOfTags?.value != null)
      (filter.$and ??= []).push(
        setObj(
          {},
          ["$expr", logicOpsToMongo(args.numOfTags.logOp)],
          [{ $size: "$tagIds" }, args.numOfTags.value],
        ),
      );
    if (Object.keys(filter).length) {
      const operator = args.numOfTagsMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (
      args.originalPath != null &&
      args.originalPath !== "" &&
      !isDeepEqual(args.originalPath, null)
    )
      setObj(filter, ["originalPath", "$regex"], new RegExp(args.originalPath, "i"));
    if (Object.keys(filter).length) {
      const operator = args.originalPathMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.rating?.logOp && args.rating?.value != null)
      setObj(filter, ["rating", logicOpsToMongo(args.rating.logOp)], args.rating.value);
    if (Object.keys(filter).length) {
      const operator = args.ratingMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.maxShortEdge != null && !isDeepEqual(args.maxShortEdge, null))
      (filter.$and ??= []).push(
        setObj({}, ["$expr", "$lte"], [{ $min: ["$width", "$height"] }, args.maxShortEdge]),
      );
    if (args.minShortEdge != null && !isDeepEqual(args.minShortEdge, null))
      (filter.$and ??= []).push(
        setObj({}, ["$expr", "$gte"], [{ $min: ["$width", "$height"] }, args.minShortEdge]),
      );
    if (Object.keys(filter).length) {
      const operator = args.shortEdgeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.maxSize != null && !isDeepEqual(args.maxSize, null))
      setObj(filter, ["size", "$lte"], args.maxSize);
    if (args.minSize != null && !isDeepEqual(args.minSize, null))
      setObj(filter, ["size", "$gte"], args.minSize);
    if (Object.keys(filter).length) {
      const operator = args.sizeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (
      args.transcription != null &&
      args.transcription !== "" &&
      !isDeepEqual(args.transcription, null)
    )
      setObj(filter, ["transcription.text", "$regex"], new RegExp(args.transcription, "i"));
    if (Object.keys(filter).length) {
      const operator = args.transcriptionMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.FileSchema> = {};
    if (args.maxWidth != null && !isDeepEqual(args.maxWidth, null))
      setObj(filter, ["width", "$lte"], args.maxWidth);
    if (args.minWidth != null && !isDeepEqual(args.minWidth, null))
      setObj(filter, ["width", "$gte"], args.minWidth);
    if (Object.keys(filter).length) {
      const operator = args.widthMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }

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

export type GetFilteredFileCountInput = CreateFileFilterPipelineInput & {
  curMaxPage: number;
  page: number;
  pageSize: number;
  withFull: boolean;
};

export const getFilteredFileCount = makeAction(
  async ({ curMaxPage, pageSize, withFull, ...filterParams }: GetFilteredFileCountInput) => {
    const filterPipeline = createFileFilterPipeline(filterParams);

    if (withFull) {
      const totalDocs = await models.FileModel.countDocuments(filterPipeline.$match).allowDiskUse(
        true,
      );
      const pageCount = Math.ceil(totalDocs / pageSize);
      return { count: totalDocs, pageCount };
    }

    const targetPage = filterParams.page;
    const targetMaxPage = targetPage >= curMaxPage ? curMaxPage + 1000 : curMaxPage;
    const probeLimit = targetMaxPage * pageSize;
    const probeCount = await models.FileModel.countDocuments(filterPipeline.$match, {
      limit: probeLimit,
    }).allowDiskUse(true);

    const pageCount = probeCount < probeLimit ? Math.ceil(probeCount / pageSize) : targetMaxPage;

    return { count: probeCount, pageCount };
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

    let carouselFileIds: string[];
    let items;

    if (hasIds) {
      items = await models.FileModel.aggregate([
        { $match: { _id: { $in: objectIds(filterParams.ids) } } },
        { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
        { $sort: { __order: 1 } },
        ...(forcePages ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }] : []),
      ])
        .allowDiskUse(true)
        .exec();
      carouselFileIds = items.map((item) => item._id.toString());
    } else {
      const hasUnindexedRegex = [
        filterPipeline.$match,
        ...(filterPipeline.$match.$and ?? []),
        ...(filterPipeline.$match.$or ?? []),
      ].some((filter) =>
        ["diffusionParams", "originalPath", "transcription.text"].some(
          (field) => filter[field]?.$regex instanceof RegExp,
        ),
      );
      const [result] = await models.FileModel.aggregate([
        { $match: filterPipeline.$match },
        // A computed sort document keeps unindexed regex filtering ahead of sorting.
        // Carry only sort keys, then fetch full documents for the displayed page.
        ...(hasUnindexedRegex
          ? [
              {
                $replaceRoot: {
                  newRoot: {
                    _id: "$_id",
                    sort: Object.fromEntries(
                      Object.keys(filterPipeline.$sort).map((key) => [key, "$" + key]),
                    ),
                  },
                },
              },
            ]
          : []),
        {
          $sort: hasUnindexedRegex
            ? Object.fromEntries(
                Object.entries(filterPipeline.$sort).map(([key, direction]) => [
                  "sort." + key,
                  direction,
                ]),
              )
            : filterPipeline.$sort,
        },
        {
          $limit: Math.max(
            Math.max(0, page - 1) * pageSize + pageSize,
            Math.max(0, Math.max(0, page - 1) * pageSize - 250) + 501,
          ),
        },
        {
          $facet: {
            carouselFiles: [
              { $skip: Math.max(0, Math.max(0, page - 1) * pageSize - 250) },
              { $limit: 501 },
              { $project: { _id: 1 } },
            ],
            items: [
              { $skip: Math.max(0, page - 1) * pageSize },
              { $limit: pageSize },
              ...(hasUnindexedRegex
                ? [
                    {
                      $lookup: {
                        as: "file",
                        foreignField: "_id",
                        from: models.FileModel.collection.name,
                        localField: "_id",
                      },
                    },
                    { $unwind: "$file" },
                    { $replaceRoot: { newRoot: "$file" } },
                  ]
                : []),
              ...(select ? [{ $project: select }] : []),
            ],
          },
        },
      ])
        .allowDiskUse(true)
        .exec();
      carouselFileIds = result.carouselFiles.map((item) => item._id.toString());
      items = result.items;
    }

    if (!items) throw new Error("Failed to load filtered File");
    return { carouselFileIds, items: items.map((i) => leanModelToJson<models.FileSchema>(i)) };
  },
);

export type CreateSavedImportConfigFilterPipelineInput = {
  dateModifiedEnd?: string;
  dateModifiedMode?: "optional" | "required";
  dateModifiedStart?: string;
  folderPath?: string;
  ids?: string[];
  label?: string;
  sortValue?: SortMenuProps["value"];
};

export const createSavedImportConfigFilterPipeline = (
  args: CreateSavedImportConfigFilterPipelineInput,
) => {
  const $match: FilterQuery<models.SavedImportConfigSchema> = {};

  if (args.folderPath != null && args.folderPath !== "" && !isDeepEqual(args.folderPath, ""))
    setObj($match, ["folderPath", "$regex"], new RegExp(args.folderPath, "i"));
  if (args.ids != null && !isDeepEqual(args.ids, []))
    setObj($match, ["_id", "$in"], objectIds(args.ids));
  if (args.label != null && args.label !== "" && !isDeepEqual(args.label, ""))
    setObj($match, ["label", "$regex"], new RegExp(args.label, "i"));

  {
    const filter: FilterQuery<models.SavedImportConfigSchema> = {};
    if (
      args.dateModifiedEnd != null &&
      args.dateModifiedEnd !== "" &&
      !isDeepEqual(args.dateModifiedEnd, "")
    )
      setObj(filter, ["dateModified", "$lte"], args.dateModifiedEnd);
    if (
      args.dateModifiedStart != null &&
      args.dateModifiedStart !== "" &&
      !isDeepEqual(args.dateModifiedStart, "")
    )
      setObj(filter, ["dateModified", "$gte"], args.dateModifiedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateModifiedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }

  const sortDir = args.sortValue.isDesc ? -1 : 1;

  return {
    $match,
    $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export type GetShiftSelectedSavedImportConfigInput = CreateSavedImportConfigFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  selectedIds: string[];
};

export const getShiftSelectedSavedImportConfig = makeAction(
  async ({
    clickedId,
    clickedIndex,
    selectedIds,
    ...filterParams
  }: GetShiftSelectedSavedImportConfigInput) => {
    const filterPipeline = createSavedImportConfigFilterPipeline(filterParams);
    return getShiftSelectedItems({
      clickedId,
      clickedIndex,
      filterPipeline,
      ids: filterParams.ids,
      model: models.SavedImportConfigModel,
      selectedIds,
    });
  },
);

export type GetFilteredSavedImportConfigCountInput = CreateSavedImportConfigFilterPipelineInput & {
  curMaxPage: number;
  page: number;
  pageSize: number;
  withFull: boolean;
};

export const getFilteredSavedImportConfigCount = makeAction(
  async ({
    curMaxPage,
    pageSize,
    withFull,
    ...filterParams
  }: GetFilteredSavedImportConfigCountInput) => {
    const filterPipeline = createSavedImportConfigFilterPipeline(filterParams);

    if (withFull) {
      const totalDocs = await models.SavedImportConfigModel.countDocuments(
        filterPipeline.$match,
      ).allowDiskUse(true);
      const pageCount = Math.ceil(totalDocs / pageSize);
      return { count: totalDocs, pageCount };
    }

    const targetPage = filterParams.page;
    const targetMaxPage = targetPage >= curMaxPage ? curMaxPage + 1000 : curMaxPage;
    const probeLimit = targetMaxPage * pageSize;
    const probeCount = await models.SavedImportConfigModel.countDocuments(filterPipeline.$match, {
      limit: probeLimit,
    }).allowDiskUse(true);

    const pageCount = probeCount < probeLimit ? Math.ceil(probeCount / pageSize) : targetMaxPage;

    return { count: probeCount, pageCount };
  },
);

export type ListFilteredSavedImportConfigInput = CreateSavedImportConfigFilterPipelineInput & {
  forcePages?: boolean;
  page: number;
  pageSize: number;
  select?: Record<string, 1 | -1>;
};

export const listFilteredSavedImportConfig = makeAction(
  async ({
    forcePages,
    page,
    pageSize,
    select,
    ...filterParams
  }: ListFilteredSavedImportConfigInput) => {
    const filterPipeline = createSavedImportConfigFilterPipeline(filterParams);
    const hasIds = forcePages || filterParams.ids?.length > 0;

    const items = await (hasIds
      ? models.SavedImportConfigModel.aggregate([
          { $match: { _id: { $in: objectIds(filterParams.ids) } } },
          { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
          { $sort: { __order: 1 } },
          ...(forcePages
            ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }]
            : []),
        ])
          .allowDiskUse(true)
          .exec()
      : models.SavedImportConfigModel.find(filterPipeline.$match)
          .sort(filterPipeline.$sort)
          .select(select)
          .skip(Math.max(0, page - 1) * pageSize)
          .limit(pageSize)
          .allowDiskUse(true)
          .lean());

    if (!items) throw new Error("Failed to load filtered SavedImportConfig");
    return items.map((i) => leanModelToJson<models.SavedImportConfigSchema>(i));
  },
);

export type CreateTagFilterPipelineInput = {
  alias?: string;
  aliasMode?: "optional" | "required";
  count?: { logOp: LogicalOp | ""; value: number };
  countMode?: "optional" | "required";
  dateCreatedEnd?: string;
  dateCreatedMode?: "optional" | "required";
  dateCreatedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedMode?: "optional" | "required";
  dateModifiedStart?: string;
  dateOfInceptionEnd?: string;
  dateOfInceptionMode?: "optional" | "required";
  dateOfInceptionStart?: string;
  excludedDescTagIds?: string[];
  excludedTagIds?: string[];
  hasRegEx?: boolean;
  ids?: string[];
  label?: string;
  labelMode?: "optional" | "required";
  optionalTagIds?: string[];
  rating?: { logOp: LogicalOp | ""; value: number };
  ratingMode?: "optional" | "required";
  requiredDescTagIds?: string[];
  requiredTagIds?: string[];
  size?: { logOp: LogicalOp | ""; value: number };
  sizeMode?: "optional" | "required";
  sortValue?: SortMenuProps["value"];
  title?: string;
  titleMode?: "optional" | "required";
};

export const createTagFilterPipeline = (args: CreateTagFilterPipelineInput) => {
  const $match: FilterQuery<models.TagSchema> = {};

  if (args.hasRegEx != null && !isDeepEqual(args.hasRegEx, null))
    setObj($match, ["$expr"], {
      [args.hasRegEx ? "$ne" : "$eq"]: [{ $ifNull: ["$regEx", ""] }, ""],
    });
  if (args.ids != null && !isDeepEqual(args.ids, []))
    setObj($match, ["_id", "$in"], objectIds(args.ids));

  if (args.excludedDescTagIds?.length)
    setObj($match, ["ancestorIds", "$nin"], objectIds(args.excludedDescTagIds));
  if (args.excludedTagIds?.length) setObj($match, ["_id", "$nin"], objectIds(args.excludedTagIds));
  if (args.optionalTagIds?.length) setObj($match, ["_id", "$in"], objectIds(args.optionalTagIds));
  if (args.requiredDescTagIds?.length)
    setObj($match, ["ancestorIds", "$all"], objectIds(args.requiredDescTagIds));
  if (args.requiredTagIds?.length) setObj($match, ["_id", "$all"], objectIds(args.requiredTagIds));

  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (args.alias != null && args.alias !== "" && !isDeepEqual(args.alias, ""))
      setObj(filter, ["aliases", "$elemMatch", "$regex"], new RegExp(args.alias, "i"));
    if (Object.keys(filter).length) {
      const operator = args.aliasMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (args.count?.logOp && args.count?.value != null)
      setObj(filter, ["count", logicOpsToMongo(args.count.logOp)], args.count.value);
    if (Object.keys(filter).length) {
      const operator = args.countMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (
      args.dateCreatedEnd != null &&
      args.dateCreatedEnd !== "" &&
      !isDeepEqual(args.dateCreatedEnd, "")
    )
      setObj(filter, ["dateCreated", "$lte"], args.dateCreatedEnd);
    if (
      args.dateCreatedStart != null &&
      args.dateCreatedStart !== "" &&
      !isDeepEqual(args.dateCreatedStart, "")
    )
      setObj(filter, ["dateCreated", "$gte"], args.dateCreatedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateCreatedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (
      args.dateModifiedEnd != null &&
      args.dateModifiedEnd !== "" &&
      !isDeepEqual(args.dateModifiedEnd, "")
    )
      setObj(filter, ["dateModified", "$lte"], args.dateModifiedEnd);
    if (
      args.dateModifiedStart != null &&
      args.dateModifiedStart !== "" &&
      !isDeepEqual(args.dateModifiedStart, "")
    )
      setObj(filter, ["dateModified", "$gte"], args.dateModifiedStart);
    if (Object.keys(filter).length) {
      const operator = args.dateModifiedMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (
      args.dateOfInceptionEnd != null &&
      args.dateOfInceptionEnd !== "" &&
      !isDeepEqual(args.dateOfInceptionEnd, "")
    )
      setObj(filter, ["dateOfInception", "$lte"], args.dateOfInceptionEnd);
    if (
      args.dateOfInceptionStart != null &&
      args.dateOfInceptionStart !== "" &&
      !isDeepEqual(args.dateOfInceptionStart, "")
    )
      setObj(filter, ["dateOfInception", "$gte"], args.dateOfInceptionStart);
    if (Object.keys(filter).length) {
      const operator = args.dateOfInceptionMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (args.label != null && args.label !== "" && !isDeepEqual(args.label, ""))
      setObj(filter, ["label", "$regex"], new RegExp(args.label, "i"));
    if (Object.keys(filter).length) {
      const operator = args.labelMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (args.rating?.logOp && args.rating?.value != null)
      setObj(filter, ["rating", logicOpsToMongo(args.rating.logOp)], args.rating.value);
    if (Object.keys(filter).length) {
      const operator = args.ratingMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (args.size?.logOp && args.size?.value != null)
      setObj(filter, ["size", logicOpsToMongo(args.size.logOp)], args.size.value);
    if (Object.keys(filter).length) {
      const operator = args.sizeMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }
  {
    const filter: FilterQuery<models.TagSchema> = {};
    if (args.title != null && args.title !== "" && !isDeepEqual(args.title, ""))
      setObj(filter, ["title", "$regex"], new RegExp(args.title, "i"));
    if (Object.keys(filter).length) {
      const operator = args.titleMode === "optional" ? "$or" : "$and";
      ($match[operator] ??= []).push(filter);
    }
  }

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

export type GetFilteredTagCountInput = CreateTagFilterPipelineInput & {
  curMaxPage: number;
  page: number;
  pageSize: number;
  withFull: boolean;
};

export const getFilteredTagCount = makeAction(
  async ({ curMaxPage, pageSize, withFull, ...filterParams }: GetFilteredTagCountInput) => {
    const filterPipeline = createTagFilterPipeline(filterParams);

    if (withFull) {
      const totalDocs = await models.TagModel.countDocuments(filterPipeline.$match).allowDiskUse(
        true,
      );
      const pageCount = Math.ceil(totalDocs / pageSize);
      return { count: totalDocs, pageCount };
    }

    const targetPage = filterParams.page;
    const targetMaxPage = targetPage >= curMaxPage ? curMaxPage + 1000 : curMaxPage;
    const probeLimit = targetMaxPage * pageSize;
    const probeCount = await models.TagModel.countDocuments(filterPipeline.$match, {
      limit: probeLimit,
    }).allowDiskUse(true);

    const pageCount = probeCount < probeLimit ? Math.ceil(probeCount / pageSize) : targetMaxPage;

    return { count: probeCount, pageCount };
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

/* ------------------------------------ BackgroundOperation ----------------------------------- */
export const createBackgroundOperation = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateBackgroundOperationInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      processedCount: 0,
      targetIds: [],
      totalCount: 0,
    };

    const res = await models.BackgroundOperationModel.create(model);
    const id = res._id.toString();

    socket.emit("onBackgroundOperationCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteBackgroundOperation = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteBackgroundOperationInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.BackgroundOperationModel.deleteMany({ _id: { $in: args.ids } });

    socket.emit("onBackgroundOperationDeleted", args, socketOpts);
  },
);

export const listBackgroundOperation = makeAction(
  async ({ args }: { args?: Types.ListBackgroundOperationInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.BackgroundOperationModel.find(filter)
      .sort(args.sort ?? { dateCreated: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.BackgroundOperationModel.countDocuments(filter);

    if (!items || !(totalCount > -1))
      throw new Error("Failed to load filtered BackgroundOperation");

    return {
      items: items.map((item) => leanModelToJson<models.BackgroundOperationSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateBackgroundOperation = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateBackgroundOperationInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const updates = { ...args.updates, dateModified: dayjs().toISOString() };
    const res = leanModelToJson<models.BackgroundOperationSchema>(
      await models.BackgroundOperationModel.findByIdAndUpdate(args.id, updates, {
        new: true,
      }).lean(),
    );

    socket.emit("onBackgroundOperationUpdated", { ...args, updates }, socketOpts);
    return res;
  },
);
/* ------------------------------------ DeletedFile ----------------------------------- */
export const createDeletedFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateDeletedFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args };

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
  async ({ args }: { args?: Types.ListDeletedFileInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.DeletedFileModel.find(filter)
      .sort(args.sort ?? { hash: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.DeletedFileModel.countDocuments(filter);

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
      sourceFolderKeys: [],
      sourceFolderPaths: [],
      tagIds: [],
      tagIdsWithAncestors: [],
    };

    const res = await models.FileCollectionModel.create(model);
    const id = res._id.toString();

    await syncCollectionFileIds(
      id,
      model.fileIdIndexes.map(({ fileId }) => String(fileId)),
    );
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
    await removeFileCollectionIds(args.ids);
    socket.emit("onFileCollectionDeleted", args, socketOpts);
  },
);

export const listFileCollection = makeAction(
  async ({ args }: { args?: Types.ListFileCollectionInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.FileCollectionModel.find(filter)
      .sort(args.sort ?? { dateCreated: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.FileCollectionModel.countDocuments(filter);

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
    const updates = { ...args.updates, dateModified: dayjs().toISOString() };
    const res = leanModelToJson<models.FileCollectionSchema>(
      await models.FileCollectionModel.findByIdAndUpdate(args.id, updates, { new: true }).lean(),
    );
    if (res && args.updates.fileIdIndexes)
      await syncCollectionFileIds(
        args.id,
        res.fileIdIndexes.map(({ fileId }) => String(fileId)),
      );
    socket.emit("onFileCollectionUpdated", { ...args, updates }, socketOpts);
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
  async ({ args }: { args?: Types.ListFileImportBatchInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.FileImportBatchModel.find(filter)
      .sort(args.sort ?? { dateCreated: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.FileImportBatchModel.countDocuments(filter);

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
/* ------------------------------------ FileTransform ----------------------------------- */
export const createFileTransform = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateFileTransformInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = {
      ...args,
      dateCreated: dayjs().toISOString(),
      configOverride: [],
      isCompleted: false,
      timestampPairs: [],
    };

    const res = await models.FileTransformModel.create(model);
    const id = res._id.toString();

    socket.emit("onFileTransformCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteFileTransform = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteFileTransformInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.FileTransformModel.deleteMany({ _id: { $in: args.ids } });

    socket.emit("onFileTransformDeleted", args, socketOpts);
  },
);

export const listFileTransform = makeAction(
  async ({ args }: { args?: Types.ListFileTransformInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.FileTransformModel.find(filter)
      .sort(args.sort ?? { dateCreated: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.FileTransformModel.countDocuments(filter);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered FileTransform");

    return {
      items: items.map((item) => leanModelToJson<models.FileTransformSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateFileTransform = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateFileTransformInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.FileTransformSchema>(
      await models.FileTransformModel.findByIdAndUpdate(args.id, args.updates, {
        new: true,
      }).lean(),
    );

    socket.emit("onFileTransformUpdated", args, socketOpts);
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
    const model = { ...args, dateCreated: dayjs().toISOString(), collectionIds: [] };

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

export const listFile = makeAction(async ({ args }: { args?: Types.ListFileInput } = {}) => {
  const filter = { ...args.filter };
  if (args.filter?.id) {
    filter._id = Array.isArray(args.filter.id)
      ? { $in: args.filter.id }
      : typeof args.filter.id === "string"
        ? { $in: [args.filter.id] }
        : args.filter.id;

    delete filter.id;
  }

  const items = await models.FileModel.find(filter)
    .sort(args.sort ?? { dateCreated: "desc" })
    .skip(Math.max(0, args.page - 1) * args.pageSize)
    .limit(args.pageSize)
    .allowDiskUse(true)
    .lean();

  const totalCount = await models.FileModel.countDocuments(filter);

  if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered File");

  return {
    items: items.map((item) => leanModelToJson<models.FileSchema>(item)),
    pageCount: Math.ceil(totalCount / args.pageSize),
  };
});

export const updateFile = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateFileInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const updates = { ...args.updates, dateModified: dayjs().toISOString() };
    const res = leanModelToJson<models.FileSchema>(
      await models.FileModel.findByIdAndUpdate(args.id, updates, { new: true }).lean(),
    );

    socket.emit("onFileUpdated", { ...args, updates }, socketOpts);
    return res;
  },
);
/* ------------------------------------ Notification ----------------------------------- */
export const createNotification = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateNotificationInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString(), isRead: false };

    const res = await models.NotificationModel.create(model);
    const id = res._id.toString();

    socket.emit("onNotificationCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteNotification = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteNotificationInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.NotificationModel.deleteMany({ _id: { $in: args.ids } });

    socket.emit("onNotificationDeleted", args, socketOpts);
  },
);

export const listNotification = makeAction(
  async ({ args }: { args?: Types.ListNotificationInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.NotificationModel.find(filter)
      .sort(args.sort ?? { dateCreated: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.NotificationModel.countDocuments(filter);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered Notification");

    return {
      items: items.map((item) => leanModelToJson<models.NotificationSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateNotification = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateNotificationInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.NotificationSchema>(
      await models.NotificationModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onNotificationUpdated", args, socketOpts);
    return res;
  },
);
/* ------------------------------------ SavedImportConfig ----------------------------------- */
export const createSavedImportConfig = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateSavedImportConfigInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString() };

    const res = await models.SavedImportConfigModel.create(model);
    const id = res._id.toString();

    socket.emit("onSavedImportConfigCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteSavedImportConfig = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteSavedImportConfigInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.SavedImportConfigModel.deleteMany({ _id: { $in: args.ids } });

    socket.emit("onSavedImportConfigDeleted", args, socketOpts);
  },
);

export const listSavedImportConfig = makeAction(
  async ({ args }: { args?: Types.ListSavedImportConfigInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.SavedImportConfigModel.find(filter)
      .sort(args.sort ?? { dateCreated: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.SavedImportConfigModel.countDocuments(filter);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered SavedImportConfig");

    return {
      items: items.map((item) => leanModelToJson<models.SavedImportConfigSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateSavedImportConfig = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateSavedImportConfigInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const updates = { ...args.updates, dateModified: dayjs().toISOString() };
    const res = leanModelToJson<models.SavedImportConfigSchema>(
      await models.SavedImportConfigModel.findByIdAndUpdate(args.id, updates, { new: true }).lean(),
    );

    socket.emit("onSavedImportConfigUpdated", { ...args, updates }, socketOpts);
    return res;
  },
);
/* ------------------------------------ SavedSearch ----------------------------------- */
export const createSavedSearch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.CreateSavedSearchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const model = { ...args, dateCreated: dayjs().toISOString() };

    const res = await models.SavedSearchModel.create(model);
    const id = res._id.toString();

    socket.emit("onSavedSearchCreated", { ...model, id }, socketOpts);
    return { ...model, id };
  },
);

export const deleteSavedSearch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.DeleteSavedSearchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    await models.SavedSearchModel.deleteMany({ _id: { $in: args.ids } });

    socket.emit("onSavedSearchDeleted", args, socketOpts);
  },
);

export const listSavedSearch = makeAction(
  async ({ args }: { args?: Types.ListSavedSearchInput } = {}) => {
    const filter = { ...args.filter };
    if (args.filter?.id) {
      filter._id = Array.isArray(args.filter.id)
        ? { $in: args.filter.id }
        : typeof args.filter.id === "string"
          ? { $in: [args.filter.id] }
          : args.filter.id;

      delete filter.id;
    }

    const items = await models.SavedSearchModel.find(filter)
      .sort(args.sort ?? { dateCreated: "desc" })
      .skip(Math.max(0, args.page - 1) * args.pageSize)
      .limit(args.pageSize)
      .allowDiskUse(true)
      .lean();

    const totalCount = await models.SavedSearchModel.countDocuments(filter);

    if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered SavedSearch");

    return {
      items: items.map((item) => leanModelToJson<models.SavedSearchSchema>(item)),
      pageCount: Math.ceil(totalCount / args.pageSize),
    };
  },
);

export const updateSavedSearch = makeAction(
  async ({
    args,
    socketOpts,
  }: {
    args: Types.UpdateSavedSearchInput;
    socketOpts?: SocketEventOptions;
  }) => {
    const res = leanModelToJson<models.SavedSearchSchema>(
      await models.SavedSearchModel.findByIdAndUpdate(args.id, args.updates, { new: true }).lean(),
    );

    socket.emit("onSavedSearchUpdated", args, socketOpts);
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
      category: null,
      childIds: [],
      descendantIds: [],
      parentIds: [],
      rating: 0,
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

export const _listTag = makeAction(async ({ args }: { args?: Types._ListTagInput } = {}) => {
  const filter = { ...args.filter };
  if (args.filter?.id) {
    filter._id = Array.isArray(args.filter.id)
      ? { $in: args.filter.id }
      : typeof args.filter.id === "string"
        ? { $in: [args.filter.id] }
        : args.filter.id;

    delete filter.id;
  }

  const items = await models.TagModel.find(filter)
    .sort(args.sort ?? { dateCreated: "desc" })
    .skip(Math.max(0, args.page - 1) * args.pageSize)
    .limit(args.pageSize)
    .allowDiskUse(true)
    .lean();

  const totalCount = await models.TagModel.countDocuments(filter);

  if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered Tag");

  return {
    items: items.map((item) => leanModelToJson<models.TagSchema>(item)),
    pageCount: Math.ceil(totalCount / args.pageSize),
  };
});

export const updateTag = makeAction(
  async ({ args, socketOpts }: { args: Types.UpdateTagInput; socketOpts?: SocketEventOptions }) => {
    const updates = { ...args.updates, dateModified: dayjs().toISOString() };
    const res = leanModelToJson<models.TagSchema>(
      await models.TagModel.findByIdAndUpdate(args.id, updates, { new: true }).lean(),
    );

    socket.emit("onTagUpdated", { ...args, updates }, socketOpts);
    return res;
  },
);
