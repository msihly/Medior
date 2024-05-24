import mongoose, { FilterQuery, PipelineStage, UpdateQuery } from "mongoose";
import { AnyBulkWriteOperation } from "mongodb";
import * as db from "database";
import { SocketEmitEvent } from "server";
import {
  bisectArrayChanges,
  dayjs,
  handleErrors,
  logToFile,
  logicOpsToMongo,
  makePerfLog,
  socket,
} from "utils";
import { leanModelToJson, objectId, objectIds } from "./utils";

/* ---------------------------- HELPER FUNCTIONS ---------------------------- */
const createTagFilterPipeline = ({
  countOp,
  countValue,
  dateCreatedEnd,
  dateCreatedStart,
  dateModifiedEnd,
  dateModifiedStart,
  excludedDescTagIds,
  excludedTagIds,
  isSortDesc,
  optionalTagIds,
  regExMode,
  requiredDescTagIds,
  requiredTagIds,
  sortKey,
}: db.CreateTagFilterPipelineInput) => {
  const sortDir = isSortDesc ? -1 : 1;

  const hasCount = countOp !== "" && countValue !== undefined;
  const hasExcludedDescTags = excludedDescTagIds?.length > 0;
  const hasExcludedTags = excludedTagIds?.length > 0;
  const hasOptionalTags = optionalTagIds?.length > 0;
  const hasRequiredDescTags = requiredDescTagIds?.length > 0;
  const hasRequiredTags = requiredTagIds.length > 0;

  return {
    $match: {
      ...(dateCreatedEnd || dateCreatedStart
        ? {
            dateCreated: {
              ...(dateCreatedEnd ? { $lte: dateCreatedEnd } : {}),
              ...(dateCreatedStart ? { $gte: dateCreatedStart } : {}),
            },
          }
        : {}),
      ...(dateModifiedEnd || dateModifiedStart
        ? {
            dateModified: {
              ...(dateModifiedEnd ? { $lte: dateModifiedEnd } : {}),
              ...(dateModifiedStart ? { $gte: dateModifiedStart } : {}),
            },
          }
        : {}),
      ...(hasCount
        ? {
            $expr: {
              ...(hasCount ? { [logicOpsToMongo(countOp)]: ["$count", countValue] } : {}),
            },
          }
        : {}),
      ...(regExMode !== "any" ? { "regExMap.regEx": { $exists: regExMode === "hasRegEx" } } : {}),
      ...(hasExcludedTags || hasOptionalTags || hasRequiredTags
        ? {
            _id: {
              ...(hasExcludedTags ? { $nin: objectIds(excludedTagIds) } : {}),
              ...(hasOptionalTags ? { $in: objectIds(optionalTagIds) } : {}),
              ...(hasRequiredTags ? { $all: objectIds(requiredTagIds) } : {}),
            },
          }
        : {}),
      ...(hasExcludedDescTags || hasRequiredDescTags
        ? {
            ancestorIds: {
              ...(hasExcludedDescTags ? { $nin: objectIds(excludedDescTagIds) } : {}),
              ...(hasRequiredDescTags ? { $all: objectIds(requiredDescTagIds) } : {}),
            },
          }
        : {}),
    },
    $sort: { [sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

/*
const createTagThumbPathPipeline = (tagIds: string[]): PipelineStage[] => [
  { $match: { _id: { $in: objectIds(tagIds) } } },
  {
    $lookup: {
      from: "files",
      localField: "_id",
      foreignField: "tagIds",
      as: "files",
    },
  },
  {
    $project: {
      _id: 1,
      thumbPaths: {
        $arrayElemAt: [
          {
            $map: {
              input: {
                $filter: {
                  input: "$files",
                  as: "file",
                  cond: {
                    $eq: [
                      "$$file.dateCreated",
                      {
                        $min: "$files.dateCreated",
                      },
                    ],
                  },
                },
              },
              as: "file",
              in: "$$file.thumbPaths",
            },
          },
          0,
        ],
      },
    },
  },
];
*/

const deriveTagThumbPaths = async (tagId: string) =>
  (
    await db.FileModel.findOne({ tagIdsWithAncestors: tagId })
      .sort({ dateCreated: 1 })
      .select({ thumbPaths: 1 })
      .lean()
  )?.thumbPaths ?? [];

export const deriveTagIdsWithAncestors = async (
  tagIds: string[],
  withBaseId = true
): Promise<string[]> => {
  const pipeline: PipelineStage[] = [
    { $match: { _id: { $in: objectIds(tagIds) } } },
    {
      $graphLookup: {
        from: "tags",
        startWith: "$parentIds",
        connectFromField: "parentIds",
        connectToField: "_id",
        as: "ancestors",
      },
    },
    withBaseId
      ? { $project: { tagIdsWithAncestors: { $setUnion: ["$ancestors._id", ["$_id"]] } } }
      : { $project: { tagIdsWithAncestors: "$ancestors._id" } },
  ];

  const results = await db.TagModel.aggregate(pipeline);
  return [...new Set(results.flatMap((result) => result.tagIdsWithAncestors))];
};

const emitTagUpdates = (
  tagId: string,
  changedChildIds: { added: string[]; removed: string[] },
  changedParentIds: { added: string[]; removed: string[] }
) =>
  handleErrors(async () => {
    const updatedTags = (
      await db.TagModel.find({
        _id: {
          $in: objectIds([
            tagId,
            ...changedChildIds.added,
            ...changedChildIds.removed,
            ...changedParentIds.added,
            ...changedParentIds.removed,
          ]),
        },
      }).lean()
    ).map((r) => leanModelToJson<db.Tag>(r));

    socket.emit("tagsUpdated", {
      tags: updatedTags.map((tag) => ({ tagId: tag.id, updates: { ...tag } })),
      withFileReload: true,
    });
  });

const getOrphanedIds = async (tagId: string, field: string, oppIds: string[]) => {
  const tags = await db.TagModel.find({ [field]: tagId }).lean();
  return tags.reduce((acc, cur) => {
    const otherTag = leanModelToJson<db.Tag>(cur);
    if (oppIds.includes(otherTag.id)) return acc;
    return [...acc, otherTag.id];
  }, [] as string[]);
};

export const makeAncestorIdsMap = async (tagIds: string[]) => {
  const tags = (
    await db.TagModel.find({ _id: { $in: objectIds([...new Set(tagIds)]) } })
      .select({ _id: 1, ancestorIds: 1 })
      .lean()
  ).map(leanModelToJson<db.Tag>);

  return Object.fromEntries(
    tags.map((t) => [
      t.id.toString(),
      [t.id.toString(), ...t.ancestorIds.map((id) => id.toString())],
    ])
  );
};

/*
const makeDescFileIdsPipeline = (tagIds: string[]): PipelineStage[] => [
  ...makeDescTagIdsPipeline(tagIds),
  {
    $lookup: {
      from: "files",
      localField: "tagIds",
      foreignField: "tagIds",
      as: "descendantFiles",
      pipeline: [{ $project: { _id: 1 } }],
    },
  },
];

const makeDescFileCountPipeline = (tagIds: string[]): PipelineStage[] => [
  ...makeDescFileIdsPipeline(tagIds),
  {
    $group: {
      _id: "$_id",
      count: { $sum: { $size: "$descendantFiles" } },
    },
  },
];


const makeDescTagIdsPipeline = (tagIds: string[]): PipelineStage[] => [
  { $match: { _id: { $in: objectIds(tagIds) } } },
  {
    $graphLookup: {
      from: "tags",
      startWith: "$_id",
      connectFromField: "_id",
      connectToField: "childIds",
      as: "ancestors",
      depthField: "depth",
    },
  },
  {
    $project: {
      _id: 1,
      label: 1,
      ancestors: { _id: 1, label: 1 },
    },
  },
  {
    $project: {
      _id: 0,
      tagIds: {
        $concatArrays: [
          [{ _id: "$_id", label: "$label" }],
          {
            $map: {
              input: "$ancestors",
              in: { _id: "$$this._id", label: "$$this.label" },
            },
          },
        ],
      },
    },
  },
  { $unwind: { path: "$tagIds" } },
  {
    $graphLookup: {
      from: "tags",
      startWith: "$tagIds._id",
      connectFromField: "_id",
      connectToField: "parentIds",
      as: "descendantTags",
      depthField: "depth",
    },
  },
  {
    $project: {
      _id: "$tagIds._id",
      label: "$tagIds.label",
      descendantTags: { _id: 1, label: 1 },
    },
  },
  {
    $project: {
      _id: 1,
      label: 1,
      tagIds: {
        $reduce: {
          input: {
            $concatArrays: [
              [{ _id: "$_id" }],
              {
                $map: {
                  input: "$descendantTags",
                  in: { _id: "$$this._id" },
                },
              },
            ],
          },
          initialValue: [],
          in: { $concatArrays: ["$$value", ["$$this._id"]] },
        },
      },
    },
  },
];
*/

const makeMergeRelationsPipeline = ({
  attr,
  tagIdToKeep,
  tagIdToMerge,
}: {
  attr: "childIds" | "parentIds";
  tagIdToKeep: mongoose.Types.ObjectId;
  tagIdToMerge: mongoose.Types.ObjectId;
}) => ({
  $let: {
    vars: {
      filteredIds: {
        $cond: {
          if: { $in: [tagIdToKeep, `$${attr === "childIds" ? "parentIds" : "childIds"}`] },
          then: {
            $filter: {
              input: `$${attr}`,
              as: "id",
              cond: { $ne: ["$$id", tagIdToMerge] },
            },
          },
          else: `$${attr}`,
        },
      },
    },
    in: {
      $map: {
        input: "$$filteredIds",
        as: "id",
        in: {
          $cond: {
            if: { $eq: ["$$id", tagIdToMerge] },
            then: tagIdToKeep,
            else: "$$id",
          },
        },
      },
    },
  },
});

/** Adds or removes `tagId` to the opposite type (`childIds` or `parentIds`) to create hierarchical relations.
 *  For example, adds `tagId` to the `parentIds` of every id in `changedChildIds.added.` */
const makeRelationsUpdateOps = async ({
  changedChildIds,
  changedParentIds,
  dateModified,
  tagId,
}: {
  changedChildIds?: { added?: string[]; removed?: string[] };
  changedParentIds?: { added?: string[]; removed?: string[] };
  dateModified: string;
  tagId: string;
}) => {
  const ids = [tagId];

  const updateRelatedTags = (
    type: "child" | "parent",
    changedIds: { added?: string[]; removed?: string[] }
  ) => {
    const ops: AnyBulkWriteOperation[] = [];
    if (!changedIds?.added?.length && !changedIds?.removed?.length) return ops;

    const keyOfOppType = type === "child" ? "parentIds" : "childIds";

    if (changedIds.added?.length > 0)
      ops.push({
        updateMany: {
          filter: { _id: { $in: objectIds(changedIds.added) } },
          update: {
            // @ts-expect-error
            $addToSet: { [keyOfOppType]: { $each: objectIds(ids) } },
            $set: { dateModified },
          },
        },
      });

    if (changedIds.removed?.length > 0)
      ops.push({
        updateMany: {
          filter: { _id: { $in: objectIds(changedIds.removed) } },
          update: {
            // @ts-expect-error
            $pullAll: { [keyOfOppType]: objectIds(ids) },
            $set: { dateModified },
          },
        },
      });

    return ops;
  };

  return [
    ...updateRelatedTags("child", changedChildIds),
    ...updateRelatedTags("parent", changedParentIds),
  ];
};

export const makeUniqueAncestorUpdates = ({
  ancestorsMap,
  oldTagIdsWithAncestors,
  tagIds,
}: {
  ancestorsMap: Record<string, string[]>;
  oldTagIdsWithAncestors: string[];
  tagIds: string[];
}) => {
  const oldSet = new Set(oldTagIdsWithAncestors.map((id) => id.toString()));
  const newSet = new Set(
    tagIds
      .flatMap((tagId) => ancestorsMap[tagId.toString()]?.map((id) => id.toString()))
      .filter(Boolean)
  );
  return {
    hasUpdates: oldSet.size !== newSet.size || [...oldSet].some((item) => !newSet.has(item)),
    tagIdsWithAncestors: [...newSet],
  };
};

export const regenTagAncestors = async ({
  tagIds,
  withSub = false,
}: {
  tagIds: string[];
  withSub?: boolean;
}) =>
  handleErrors(async () => {
    const updates: { tagId: string; updates: Partial<db.Tag> }[] = [];

    await Promise.all(
      tagIds.map(async (tagId) => {
        const ancestorIds = await deriveTagIdsWithAncestors([tagId], false);
        await db.TagModel.updateOne({ _id: tagId }, { $set: { ancestorIds } });
        updates.push({ tagId, updates: { ancestorIds } });
      })
    );

    if (withSub) socket.emit("tagsUpdated", { tags: updates, withFileReload: true });
  });

export const regenTagThumbPaths = async ({ tagId }: db.RegenTagThumbPathsInput) =>
  handleErrors(async () => {
    const thumbPaths = await deriveTagThumbPaths(tagId);
    return db.TagModel.updateOne({ _id: tagId }, { $set: { thumbPaths } });
  });

/* ------------------------------ API ENDPOINTS ----------------------------- */
export const createTag = ({
  aliases = [],
  childIds = [],
  label,
  parentIds = [],
  regExMap,
  withSub = true,
}: db.CreateTagInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    const tag: Omit<db.Tag, "id"> = {
      aliases,
      ancestorIds: await deriveTagIdsWithAncestors(parentIds, false),
      childIds,
      count: 0,
      dateCreated: dateModified,
      dateModified,
      label,
      parentIds,
      regExMap,
      thumbPaths: [],
    };

    const res = await db.TagModel.create(tag);
    const id = res._id.toString();

    const tagBulkWriteOps = await makeRelationsUpdateOps({
      changedChildIds: { added: childIds },
      changedParentIds: { added: parentIds },
      dateModified,
      tagId: id,
    });

    await db.TagModel.bulkWrite(tagBulkWriteOps);

    if (childIds.length > 0 || parentIds.length > 0) {
      const tagIds = [id, ...childIds, ...parentIds];

      await Promise.all([
        db.regenCollTagAncestors({ tagIds }),
        db.regenFileTagAncestors({ tagIds }),
      ]);
    }

    if (withSub) socket.emit("tagCreated", { tag: { ...tag, id } });
    return { ...tag, id };
  });

export const deleteTag = ({ id }: db.DeleteTagInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    const tagIds = [id];

    const tag = await db.TagModel.findById(id);
    const parentIds = tag.parentIds.map((i) => i.toString());

    await Promise.all([
      db.FileImportBatchModel.updateMany({ tagIds }, { $pull: { tagIds } }),
      db.FileModel.updateMany({ tagIds }, { $pull: { tagIds }, dateModified }),
      db.TagModel.updateMany(
        { $or: [{ childIds: id }, { parentIds: id }] },
        { $pullAll: { childIds: tagIds, parentIds: tagIds }, dateModified }
      ),
      db.TagModel.deleteOne({ _id: id }),
    ]);

    const countRes = await recalculateTagCounts({ tagIds: parentIds, withSub: true });
    if (!countRes.success) throw new Error(countRes.error);

    socket.emit("tagDeleted", { tagId: id });
  });

export const editTag = ({
  aliases,
  childIds,
  id,
  label,
  parentIds,
  regExMap,
  withSub = true,
}: db.EditTagInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();

    const tag = await db.TagModel.findById(id);
    const origChildIds = tag.childIds?.map((i) => i.toString()) ?? [];
    const origParentIds = tag.parentIds?.map((i) => i.toString()) ?? [];

    const changedChildIds = childIds
      ? bisectArrayChanges(origChildIds, childIds)
      : { added: [], removed: [] };
    const changedParentIds = parentIds
      ? bisectArrayChanges(origParentIds, parentIds)
      : { added: [], removed: [] };

    const changedTagIds = [
      id,
      ...changedChildIds.added,
      ...changedChildIds.removed,
      ...changedParentIds.added,
      ...changedParentIds.removed,
    ];

    const [affectedFileIds, affectedCollIds, bulkWriteOps] = await Promise.all([
      (await db.listFileIdsByTagIds({ tagIds: changedTagIds })).data,
      (await db.listCollectionIdsByTagIds({ tagIds: changedTagIds })).data,
      makeRelationsUpdateOps({
        changedChildIds,
        changedParentIds,
        dateModified,
        tagId: id,
      }),
    ]);

    const operations: AnyBulkWriteOperation[] = [
      ...bulkWriteOps,
      {
        updateOne: {
          filter: { _id: objectId(id) },
          update: {
            aliases,
            dateModified,
            label,
            regExMap,
            ...(childIds !== undefined ? { childIds: objectIds(childIds) } : {}),
            ...(parentIds !== undefined
              ? {
                  ancestorIds: await deriveTagIdsWithAncestors(parentIds, false),
                  parentIds: objectIds(parentIds),
                }
              : {}),
          },
        },
      },
    ].filter(Boolean);

    const res = await db.TagModel.bulkWrite(operations);

    if (changedTagIds.length > 0) {
      await regenTagAncestors({ tagIds: changedTagIds, withSub });

      await Promise.all([
        regenTagThumbPaths({ tagId: id }),
        db.regenCollTagAncestors({ collectionIds: affectedCollIds }),
        db.regenFileTagAncestors({ fileIds: affectedFileIds }),
      ]);

      await recalculateTagCounts({
        tagIds: [id, ...changedParentIds.added, ...changedParentIds.removed],
        withSub,
      });
    }

    if (withSub) await emitTagUpdates(id, changedChildIds, changedParentIds);
    return { changedChildIds, changedParentIds, dateModified, operations, res };
  });

export const getShiftSelectedTags = ({
  clickedId,
  clickedIndex,
  isSortDesc,
  selectedIds,
  sortKey,
  ...filterParams
}: db.GetShiftSelectedTagsInput) =>
  handleErrors(async () => {
    if (selectedIds.length === 0) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (selectedIds.length === 1 && selectedIds[0] === clickedId)
      return { idsToDeselect: [clickedId], idsToSelect: [] };

    const filterPipeline = createTagFilterPipeline({ ...filterParams, isSortDesc, sortKey });

    const getSelectedIndex = async (type: "first" | "last") => {
      const sortOp = isSortDesc ? "$gt" : "$lt";

      const selectedTags = await db.TagModel.find({
        ...filterPipeline.$match,
        _id: { $in: objectIds(selectedIds) },
      }).sort(filterPipeline.$sort);

      if (!selectedTags || selectedTags.length === 0)
        throw new Error(`Failed to load selected tags`);

      const selectedTag =
        type === "first" ? selectedTags[0] : selectedTags[selectedTags.length - 1];

      const selectedTagIndex = await db.TagModel.countDocuments({
        ...filterPipeline.$match,
        $or: [
          { [sortKey]: selectedTag[sortKey], _id: { [sortOp]: selectedTag._id } },
          { [sortKey]: { [sortOp]: selectedTag[sortKey] } },
        ],
      });
      if (!(selectedTagIndex > -1)) throw new Error(`Failed to load ${type} selected index`);

      return selectedTagIndex;
    };

    const firstSelectedIndex = await getSelectedIndex("first");
    if (!(firstSelectedIndex > -1)) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (firstSelectedIndex === clickedIndex) return { idsToDeselect: [clickedId], idsToSelect: [] };

    const isFirstAfterClicked = firstSelectedIndex > clickedIndex;
    const lastSelectedIndex = isFirstAfterClicked ? await getSelectedIndex("last") : null;

    const endIndex = isFirstAfterClicked ? lastSelectedIndex : clickedIndex;
    const startIndex = isFirstAfterClicked ? clickedIndex : firstSelectedIndex;

    const limit = endIndex + 1;
    const skip = startIndex;

    const mainPipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      { $sort: filterPipeline.$sort },
      ...(limit > -1 ? [{ $limit: limit }] : []),
      ...(skip > -1 ? [{ $skip: skip }] : []),
      { $project: { _id: 1 } },
      { $group: { _id: null, filteredIds: { $push: "$_id" } } },
      {
        $addFields: {
          selectedIdsNotInFiltered: {
            $filter: {
              input: objectIds(selectedIds),
              as: "id",
              cond: { $not: { $in: ["$$id", "$filteredIds"] } },
            },
          },
          selectedIdsInFiltered: {
            $filter: {
              input: objectIds(selectedIds),
              as: "id",
              cond: { $in: ["$$id", "$filteredIds"] },
            },
          },
        },
      },
      {
        $addFields: {
          newSelectedIds:
            startIndex === endIndex
              ? []
              : isFirstAfterClicked
              ? { $slice: ["$filteredIds", 0, limit] }
              : { $slice: ["$filteredIds", 0, limit - skip] },
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
              cond: { $not: { $in: ["$$id", objectIds(selectedIds)] } },
            },
          },
        },
      },
      { $project: { _id: 0, idsToDeselect: 1, idsToSelect: 1 } },
    ];

    const mainRes: {
      idsToDeselect: string[];
      idsToSelect: string[];
    } = (await db.TagModel.aggregate(mainPipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
    if (!mainRes) throw new Error("Failed to load shift selected tag IDs");

    return mainRes;
  });

export const listFilteredTags = ({ page, pageSize, ...filterParams }: db.ListFilteredTagsInput) =>
  handleErrors(async () => {
    const filterPipeline = createTagFilterPipeline(filterParams);

    const [_tags, totalDocuments] = await Promise.all([
      db.TagModel.find(filterPipeline.$match)
        .sort(filterPipeline.$sort)
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.TagModel.countDocuments(filterPipeline.$match),
    ]);
    if (!_tags || !(totalDocuments > -1)) throw new Error("Failed to load filtered tags");

    const tags = _tags.map((t) => leanModelToJson<db.Tag>(t));
    return { tags, pageCount: Math.ceil(totalDocuments / pageSize) };
  });

export const listTags = ({ filter }: db.ListTagsInput = {}) =>
  handleErrors(async () =>
    (await db.TagModel.find(filter).lean()).map((r) => leanModelToJson<db.Tag>(r))
  );

export const mergeTags = ({
  aliases,
  childIds,
  label,
  parentIds,
  tagIdToKeep,
  tagIdToMerge,
}: db.MergeTagsInput) =>
  handleErrors(async () => {
    let error: string | undefined;

    try {
      const _tagIdToKeep = objectId(tagIdToKeep);
      const _tagIdToMerge = objectId(tagIdToMerge);
      const dateModified = dayjs().toISOString();

      type Collections = db.File | db.FileImportBatch | db.FileCollection;

      const updateManyAddToSet: UpdateQuery<Collections> = { $addToSet: { tagIds: _tagIdToKeep } };
      const updateManyFilter: FilterQuery<Collections> = { tagIds: _tagIdToMerge };
      const updateManyPull: UpdateQuery<Collections> = { $pull: { tagIds: _tagIdToMerge } };

      await Promise.all([
        db.FileCollectionModel.updateMany(updateManyFilter, updateManyAddToSet),
        db.FileImportBatchModel.updateMany(updateManyFilter, updateManyAddToSet),
        db.FileModel.updateMany(updateManyFilter, updateManyAddToSet),
      ]);

      await Promise.all([
        db.FileCollectionModel.updateMany(updateManyFilter, updateManyPull),
        db.FileImportBatchModel.updateMany(updateManyFilter, updateManyPull),
        db.FileModel.updateMany(updateManyFilter, updateManyPull),
      ]);

      const relationsFilter = {
        $or: [{ childIds: [_tagIdToMerge] }, { parentIds: [_tagIdToMerge] }],
      };

      const tagIdsToUpdate = (await db.TagModel.find(relationsFilter, { _id: 1 }).lean()).map((r) =>
        r._id.toString()
      );

      const tagToKeepUpdates = { aliases, childIds, dateModified, label, parentIds };

      await db.TagModel.bulkWrite([
        {
          updateMany: {
            filter: relationsFilter,
            update: [
              {
                $set: {
                  childIds: makeMergeRelationsPipeline({
                    attr: "childIds",
                    tagIdToKeep: _tagIdToKeep,
                    tagIdToMerge: _tagIdToMerge,
                  }),
                  parentIds: makeMergeRelationsPipeline({
                    attr: "parentIds",
                    tagIdToKeep: _tagIdToKeep,
                    tagIdToMerge: _tagIdToMerge,
                  }),
                },
              },
            ],
          },
        },
        {
          updateOne: {
            filter: { _id: _tagIdToKeep },
            update: { $set: tagToKeepUpdates },
          },
        },
        { deleteOne: { filter: { _id: _tagIdToMerge } } },
      ]);

      await Promise.all([
        db.regenCollTagAncestors({ tagIds: [tagIdToKeep] }),
        db.regenFileTagAncestors({ tagIds: [tagIdToKeep] }),
        regenTagThumbPaths({ tagId: tagIdToKeep }),
        regenTagAncestors({ tagIds: [tagIdToKeep, ...tagIdsToUpdate] }),
      ]);

      const countRes = await recalculateTagCounts({
        tagIds: [tagIdToKeep, ...tagIdsToUpdate],
        withSub: false,
      });
      if (!countRes.success) throw new Error(countRes.error);

      socket.emit("tagMerged", { newTagId: tagIdToKeep, oldTagId: tagIdToMerge });
      socket.emit("tagsUpdated", {
        tags: [...countRes.data, { tagId: tagIdToKeep, updates: tagToKeepUpdates }],
        withFileReload: true,
      });
    } catch (err) {
      error = err.message;
      logToFile("error", JSON.stringify(err.stack, null, 2));
    } finally {
      (
        [
          "reloadFileCollections",
          "reloadFiles",
          "reloadImportBatches",
          "reloadTags",
        ] as SocketEmitEvent[]
      ).forEach((event) => socket.emit(event));

      if (error) throw new Error(error);
    }
  });

export const recalculateTagCounts = async ({
  tagIds,
  withSub = true,
}: db.RecalculateTagCountsInput) =>
  handleErrors(async () => {
    const updatedTags: { tagId: string; updates: Partial<db.Tag> }[] = [];

    await Promise.all(
      tagIds.map(async (id) => {
        const count = await db.FileModel.count({ tagIdsWithAncestors: id });
        updatedTags.push({ tagId: id, updates: { count } });
        return db.TagModel.updateOne({ _id: id }, { $set: { count } });
      })
    );

    if (withSub) socket.emit("tagsUpdated", { tags: updatedTags, withFileReload: false });
    return updatedTags;
  });

export const refreshTagRelations = ({ tagId, withSub = true }: db.RefreshTagRelationsInput) =>
  handleErrors(async () => {
    const debug = false;

    const tag = await db.TagModel.findById(tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);

    const childIds = tag.childIds?.map((i) => i.toString()) ?? [];
    const parentIds = tag.parentIds?.map((i) => i.toString()) ?? [];

    const { perfLog, perfLogTotal } = makePerfLog("[refreshTagRelations]", true);

    if (!tag.childIds || !tag.parentIds) {
      await db.TagModel.updateOne(
        { _id: tagId },
        {
          $set: {
            ...(!tag.childIds ? { childIds: [] } : {}),
            ...(!tag.parentIds ? { parentIds: [] } : {}),
          },
        }
      );

      if (debug) perfLog("Updated tag with missing childIds / parentIds");
    }

    const dateModified = dayjs().toISOString();

    const [idsWithOrphanedChild, idsWithOrphanedParent] = await Promise.all([
      getOrphanedIds(tagId, "childIds", parentIds),
      getOrphanedIds(tagId, "parentIds", childIds),
    ]);
    if (debug) perfLog("Derived orphaned childIds / parentIds");

    const changedChildIds = { added: idsWithOrphanedParent, removed: [] };
    const changedParentIds = { added: idsWithOrphanedChild, removed: [] };

    const bulkWriteOps = await makeRelationsUpdateOps({
      changedChildIds,
      changedParentIds,
      dateModified,
      tagId,
    });
    if (debug) perfLog("Derived bulkWriteOps");

    await db.TagModel.bulkWrite(bulkWriteOps);
    if (debug) perfLog("Bulk write operations executed");

    // await regenTagAncestors({ tagIds: [tagId], withSub: false });
    // if (debug) perfLog("Regenerated tag ancestors");

    await Promise.all([
      db.regenCollTagAncestors({ tagIds: [tagId] }),
      db.regenFileTagAncestors({ tagIds: [tagId] }),
      (changedChildIds.added.length || changedParentIds.added.length) &&
        recalculateTagCounts({
          tagIds: [tagId, ...changedChildIds.added, ...changedParentIds.added],
          withSub,
        }),
    ]);

    if (debug) perfLog("Regenerated tag ancestors, recalculated tag counts");

    if (withSub) await emitTagUpdates(tagId, changedChildIds, changedParentIds);
    if (debug) perfLogTotal("Refreshed tag relations");
  });

export const setTagCount = ({ count, id }: db.SetTagCountInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return db.TagModel.updateOne({ _id: id }, { $set: { count }, dateModified });
  });

export const upsertTag = ({ label, parentLabels }: db.UpsertTagInput) =>
  handleErrors<{ id: string; parentIds: string[] }>(async () => {
    const parentIds: string[] =
      parentLabels?.length > 0
        ? (await Promise.all(parentLabels.map(async (pLabel) => upsertTag({ label: pLabel }))))
            .map((p) => p.data?.id)
            .filter(Boolean)
        : [];

    const tagId = await db.TagModel.findOne({ label }).then((r) => r?._id?.toString());
    if (tagId) {
      if (parentIds.length) {
        const res = await editTag({ id: tagId, label, parentIds, withSub: false });
        if (!res.success) throw new Error(res.error);
      }
      return { id: tagId, parentIds };
    }

    const res = await createTag({ label, parentIds, withSub: false });
    if (!res.success) throw new Error(res.error);
    return { id: res.data.id, parentIds };
  });
