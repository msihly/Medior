import * as models from "medior/_generated/server/models";
import { SocketEmitEvent } from "medior/_generated/server/socket";
import { AnyBulkWriteOperation } from "mongodb";
import mongoose, { FilterQuery, PipelineStage, UpdateQuery } from "mongoose";
import { fileLog, makePerfLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import * as Types from "medior/server/database/types";
import {
  bisectArrayChanges,
  chunkArray,
  dayjs,
  Fmt,
  handleErrors,
  PromiseQueue,
  splitArray,
} from "medior/utils/common";
import { leanModelToJson, makeAction, objectId, objectIds, socket } from "medior/utils/server";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
export const deriveAncestorTagIds = async (
  tagIds: string[],
  withBaseId = true,
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

  const results = await models.TagModel.aggregate(pipeline);
  return [...new Set(results.flatMap((result) => result.tagIdsWithAncestors))];
};

export const deriveDescendantTagIds = async (
  tagIds: string[],
  withBaseId = true,
): Promise<string[]> => {
  const pipeline: PipelineStage[] = [
    { $match: { _id: { $in: objectIds(tagIds) } } },
    {
      $graphLookup: {
        from: "tags",
        startWith: "$childIds",
        connectFromField: "childIds",
        connectToField: "_id",
        as: "descendants",
      },
    },
    withBaseId
      ? { $project: { tagIdsWithDescendants: { $setUnion: ["$descendants._id", ["$_id"]] } } }
      : { $project: { tagIdsWithDescendants: "$descendants._id" } },
  ];

  const results = await models.TagModel.aggregate(pipeline);
  return [...new Set(results.flatMap((result) => result.tagIdsWithDescendants))];
};

export const deriveTagCategories = async (tags: models.TagSchema[]) => {
  const ancestors = (
    await models.TagModel.find({
      _id: { $in: objectIds(tags.flatMap((t) => t.ancestorIds)) },
    })
      .lean()
      .select({ _id: 1, ancestorIds: 1, category: 1 })
  ).map((t) => leanModelToJson<models.TagSchema>(t));

  const ancestorMap = new Map(ancestors.map((t) => [t.id, t]));

  const tagCategoriesMap = new Map(
    ancestors.filter((t) => t.category?.inheritable).map((t) => [t.id, t.category]),
  );

  const getNearestCategory = (tag: models.TagSchema) => {
    let bestColor = tag.category?.color;
    let bestIcon = tag.category?.icon;
    let bestSortRank = tag.category?.sortRank;

    for (const ancestorId of tag.ancestorIds.map(String).filter((id) => id !== tag.id)) {
      const ancestor = ancestorMap.get(ancestorId);
      if (!ancestor) continue;

      const category = tagCategoriesMap.get(ancestorId);
      if (!category) continue;

      const sortRank = category.sortRank;
      const isValid = sortRank > bestSortRank;
      if (isValid) bestSortRank = sortRank;
      if (isValid || !bestColor) bestColor = category.color;
      if (isValid || !bestIcon) bestIcon = category.icon;
    }

    return { color: bestColor, icon: bestIcon, sortRank: bestSortRank };
  };

  return tags.map((t) => ({
    ...t,
    category: { ...t.category, ...getNearestCategory(t) },
  }));
};

const emitTagUpdates = (
  tagId: string,
  changedChildIds: { added: string[]; removed: string[] },
  changedParentIds: { added: string[]; removed: string[] },
) =>
  handleErrors(async () => {
    const updatedTags = (
      await models.TagModel.find({
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
    ).map((r) => leanModelToJson<models.TagSchema>(r));

    socket.emit("onTagsUpdated", {
      tags: updatedTags.map((tag) => ({ tagId: tag.id, updates: { ...tag } })),
      withFileReload: true,
    });
  });

const getOrphanedIds = async (tagId: string, field: string, oppIds: string[]) => {
  const tags = await models.TagModel.find({ [field]: tagId }).lean();
  return tags.reduce((acc, cur) => {
    const otherTag = leanModelToJson<models.TagSchema>(cur);
    if (oppIds.includes(otherTag.id)) return acc;
    return [...acc, otherTag.id];
  }, [] as string[]);
};

export const makeAncestorIdsMap = async (tagIds: string[]) => {
  fileLog(`[DFE] Making ancestorIds map for ${tagIds.length} tags...`);

  const map = new Map<string, string[]>();
  const chunks = chunkArray(tagIds, 5000);

  for (const chunk of chunks) {
    const tags = (
      await models.TagModel.find({ _id: { $in: objectIds(chunk) } })
        .select({ _id: 1, ancestorIds: 1 })
        .allowDiskUse(true)
        .lean()
    ).map(leanModelToJson<models.TagSchema>);

    for (const tag of tags) {
      const id = tag.id.toString();
      map.set(id, [id, ...tag.ancestorIds.map((id) => id.toString())]);
    }
  }

  fileLog(`[DFE] Finished making ancestorIds map for ${tagIds.length} tags.`);

  return map;
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
const makeRelationsUpdateOps = ({
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
    changedIds: { added?: string[]; removed?: string[] },
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

// @generator-ignore-export
export const makeUniqueAncestorUpdates = ({
  ancestorsMap,
  oldTagIdsWithAncestors,
  tagIds,
}: {
  ancestorsMap: Map<string, string[]>;
  oldTagIdsWithAncestors: string[];
  tagIds: string[];
}) => {
  const oldSet = new Set(oldTagIdsWithAncestors.map((id) => id.toString()));
  const newSet = new Set(
    tagIds.flatMap((tagId) => ancestorsMap.get(tagId.toString())).filter(Boolean),
  );
  return {
    hasUpdates: oldSet.size !== newSet.size || [...oldSet].some((item) => !newSet.has(item)),
    tagIdsWithAncestors: [...newSet],
  };
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const createTag = makeAction(
  async ({
    aliases = [],
    category = null,
    childIds = [],
    label,
    parentIds = [],
    regEx,
    withRegen = true,
    withSub = true,
  }: Partial<Omit<models.TagSchema, "id">> & {
    withRegen?: boolean;
    withSub?: boolean;
  }) => {
    const dateModified = dayjs().toISOString();
    const tag: Omit<models.TagSchema, "id"> = {
      aliases,
      ancestorIds: [],
      category,
      childIds,
      count: 0,
      dateCreated: dateModified,
      dateModified,
      descendantIds: [],
      label,
      lastSearchedAt: dateModified,
      parentIds,
      regEx,
      size: 0,
      thumb: null,
    };

    const res = await models.TagModel.create(tag);
    const id = res._id.toString();

    const tagBulkWriteOps = makeRelationsUpdateOps({
      changedChildIds: { added: childIds },
      changedParentIds: { added: parentIds },
      dateModified,
      tagId: id,
    });

    await models.TagModel.bulkWrite(tagBulkWriteOps);

    if (withRegen && (childIds.length > 0 || parentIds.length > 0)) {
      const tagIds = [id, ...childIds, ...parentIds];
      regenTags({ tagIds, withSub });
    }

    if (withRegen || withSub) socket.emit("onTagCreated", { ...tag, id });
    return { ...tag, id };
  },
);

export const deleteTag = makeAction(async ({ id }: { id: string }) => {
  const dateModified = dayjs().toISOString();
  const tagIds = [id];

  const tag = await models.TagModel.findById(id);
  const parentIds = tag.parentIds.map((i) => i.toString());

  await Promise.all([
    models.FileImportBatchModel.updateMany({ tagIds }, { $pull: { tagIds } }),
    models.FileModel.updateMany({ tagIds }, { $pull: { tagIds }, dateModified }),
    models.TagModel.updateMany(
      { $or: [{ childIds: id }, { parentIds: id }] },
      { $pullAll: { childIds: tagIds, parentIds: tagIds }, dateModified },
    ),
    models.TagModel.deleteOne({ _id: id }),
  ]);

  regenTags({ tagIds: parentIds, withSub: true });

  socket.emit("onTagDeleted", { ids: [id] });
});

export const editTag = makeAction(
  async ({
    childIds,
    id,
    parentIds,
    withRegen = true,
    withSub = true,
    ...updates
  }: Partial<Types.CreateTagInput> & { id: string }) => {
    const dateModified = dayjs().toISOString();

    const tag = await models.TagModel.findById(id);
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

    const bulkWriteOps = makeRelationsUpdateOps({
      changedChildIds,
      changedParentIds,
      dateModified,
      tagId: id,
    });

    const operations: AnyBulkWriteOperation[] = [
      ...bulkWriteOps,
      {
        updateOne: {
          filter: { _id: objectId(id) },
          update: {
            ...updates,
            dateModified,
            ...(childIds !== undefined ? { childIds: objectIds(childIds) } : {}),
            ...(parentIds !== undefined ? { parentIds: objectIds(parentIds) } : {}),
          },
        },
      },
    ].filter(Boolean);

    const res = await models.TagModel.bulkWrite(operations);

    if (changedTagIds.length > 0 && withRegen) regenTags({ tagIds: changedTagIds, withSub });
    if (withSub) emitTagUpdates(id, changedChildIds, changedParentIds);

    return { changedChildIds, changedParentIds, dateModified, operations, res };
  },
);

export const editMultiTagRelations = makeAction(
  async (args: {
    childIdsToAdd?: string[];
    childIdsToRemove?: string[];
    parentIdsToAdd?: string[];
    parentIdsToRemove?: string[];
    tagIds: string[];
  }) => {
    const dateModified = dayjs().toISOString();

    const changedChildIds = {
      added: args.childIdsToAdd ?? [],
      removed: args.childIdsToRemove ?? [],
    };
    const changedParentIds = {
      added: args.parentIdsToAdd ?? [],
      removed: args.parentIdsToRemove ?? [],
    };
    const changedTagIds = [
      ...args.tagIds,
      ...changedChildIds.added,
      ...changedChildIds.removed,
      ...changedParentIds.added,
      ...changedParentIds.removed,
    ];

    const tags = (await models.TagModel.find({ _id: { $in: objectIds(args.tagIds) } }).lean()).map(
      leanModelToJson<models.TagSchema>,
    );

    const errors: {
      invalidChildTags: { id: string; label: string }[];
      invalidParentTags: { id: string; label: string }[];
      tagId: string;
      tagLabel: string;
    }[] = [];

    const [...bulkWriteOps] = tags.map((tag) => {
      const ancestorIds = tag.ancestorIds?.map((i) => i.toString()) ?? [];
      const descendantIds = tag.descendantIds?.map((i) => i.toString()) ?? [];

      /** Prevent creating an invalid hierarchy */
      const [invalidChildIdsToAdd, validChildIdsToAdd] = splitArray(args.childIdsToAdd, (id) =>
        ancestorIds.includes(id),
      );
      const [invalidParentIdsToAdd, validParentIdsToAdd] = splitArray(args.parentIdsToAdd, (id) =>
        descendantIds.includes(id),
      );

      if (invalidChildIdsToAdd.length > 0 || invalidParentIdsToAdd.length > 0) {
        errors.push({
          invalidChildTags: invalidChildIdsToAdd.map((id) => ({
            id,
            label: tags.find((t) => t.id === id)?.label,
          })),
          invalidParentTags: invalidParentIdsToAdd.map((id) => ({
            id,
            label: tags.find((t) => t.id === id)?.label,
          })),
          tagId: tag.id,
          tagLabel: tag.label,
        });

        return [];
      }

      const relationOps = makeRelationsUpdateOps({
        changedChildIds: { added: validChildIdsToAdd, removed: args.childIdsToRemove ?? [] },
        changedParentIds: { added: validParentIdsToAdd, removed: args.parentIdsToRemove ?? [] },
        dateModified,
        tagId: tag.id,
      });

      const tagAddOps: AnyBulkWriteOperation[] = [
        // @ts-expect-error
        !validChildIdsToAdd.length && !validParentIdsToAdd.length
          ? null
          : {
              updateOne: {
                filter: { _id: tag.id },
                update: {
                  $set: { dateModified },
                  $addToSet: {
                    childIds: { $each: objectIds(validChildIdsToAdd) },
                    parentIds: { $each: objectIds(validParentIdsToAdd) },
                  },
                },
              },
            },
      ];

      const tagRemoveOps: AnyBulkWriteOperation[] = [
        // @ts-expect-error
        !args.childIdsToRemove?.length && !args.parentIdsToRemove?.length
          ? null
          : {
              updateOne: {
                filter: { _id: tag.id },
                update: {
                  $set: { dateModified },
                  $pullAll: {
                    childIds: args.childIdsToRemove ? objectIds(args.childIdsToRemove) : [],
                    parentIds: args.parentIdsToRemove ? objectIds(args.parentIdsToRemove) : [],
                  },
                },
              },
            },
      ];

      return [...relationOps, ...tagAddOps, ...tagRemoveOps].filter(Boolean);
    });

    if (errors.length > 0) fileLog(["editMultiTagRelations", errors], { type: "warn" });

    const bulkWriteRes = await models.TagModel.bulkWrite(bulkWriteOps.flat());

    regenTags({ tagIds: changedTagIds, withSub: false });

    return { bulkWriteRes, changedChildIds, changedParentIds, dateModified, errors };
  },
);

export const getTagWithRelations = makeAction(async ({ id }: { id: string }) => {
  const tag = leanModelToJson(await models.TagModel.findById(id).lean());

  const [childTags, parentTags] = await Promise.all(
    [tag.childIds, tag.parentIds].map(async (tagIds) =>
      tagIds?.length > 0
        ? (
            await models.TagModel.find({ _id: { $in: objectIds(tagIds) } })
              .allowDiskUse(true)
              .lean()
          ).map((t) => leanModelToJson<models.TagSchema>(t))
        : [],
    ),
  );

  return { childTags, parentTags, tag };
});

export const listRegExMaps = makeAction(async () => {
  const tags = await models.TagModel.find({
    $and: [{ regEx: { $exists: true } }, { regEx: { $ne: null } }, { regEx: { $ne: "" } }],
  }).select({ _id: 1, regEx: 1 });

  return tags.map((t) => ({ id: t._id.toString(), regEx: t.regEx }));
});

export const listTagAncestorLabels = makeAction(async ({ id }: { id: string }) => {
  const tag = await models.TagModel.findById(id).select({ ancestorIds: 1 });
  if (!tag) return [];

  return (
    await models.TagModel.find({
      _id: { $in: objectIds(tag.ancestorIds.map((a) => a.toString()).filter((a) => a !== id)) },
    })
      .select({ label: 1, count: 1 })
      .sort({ count: -1 })
  ).map((a) => a.label);
});

export const listTag = makeAction(async (args: Types._ListTagInput) => {
  const tags = (await actions._listTag({ args })).data.items;
  return await deriveTagCategories(tags);
});

export const mergeTags = makeAction(
  async (
    args: Omit<
      Required<Types.CreateTagInput>,
      | "ancestorIds"
      | "category"
      | "count"
      | "dateCreated"
      | "dateModified"
      | "descendantIds"
      | "lastSearchedAt"
      | "size"
      | "thumb"
    > & {
      tagIdToKeep: string;
      tagIdToMerge: string;
    },
  ) => {
    let error: string | undefined;

    try {
      const _tagIdToKeep = objectId(args.tagIdToKeep);
      const _tagIdToMerge = objectId(args.tagIdToMerge);
      const dateModified = dayjs().toISOString();

      type Collections =
        | models.FileSchema
        | models.FileImportBatchSchema
        | models.FileCollectionSchema;

      const updateManyAddToSet: UpdateQuery<Collections> = { $addToSet: { tagIds: _tagIdToKeep } };
      const updateManyFilter: FilterQuery<Collections> = { tagIds: _tagIdToMerge };
      const updateManyPull: UpdateQuery<Collections> = { $pull: { tagIds: _tagIdToMerge } };

      await Promise.all([
        models.FileCollectionModel.updateMany(updateManyFilter, updateManyAddToSet),
        models.FileImportBatchModel.updateMany(updateManyFilter, updateManyAddToSet),
        models.FileModel.updateMany(updateManyFilter, updateManyAddToSet),
      ]);

      await Promise.all([
        models.FileCollectionModel.updateMany(updateManyFilter, updateManyPull),
        models.FileImportBatchModel.updateMany(updateManyFilter, updateManyPull),
        models.FileModel.updateMany(updateManyFilter, updateManyPull),
      ]);

      const relationsFilter = {
        $or: [{ childIds: [_tagIdToMerge] }, { parentIds: [_tagIdToMerge] }],
      };

      const tagIdsToUpdate = (await models.TagModel.find(relationsFilter, { _id: 1 }).lean()).map(
        (r) => r._id.toString(),
      );

      const tagToKeepUpdates = {
        aliases: args.aliases,
        childIds: args.childIds,
        dateModified,
        label: args.label,
        parentIds: args.parentIds,
      };

      await models.TagModel.bulkWrite([
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
        { deleteOne: { filter: { _id: _tagIdToMerge } } },
        { updateOne: { filter: { _id: _tagIdToKeep }, update: { $set: tagToKeepUpdates } } },
      ]);

      if (args.withRegen)
        regenTags({ tagIds: [args.tagIdToKeep, ...tagIdsToUpdate], withSub: false });

      if (args.withSub) {
        socket.emit("onTagMerged", { newTagId: args.tagIdToKeep, oldTagId: args.tagIdToMerge });
        socket.emit("onTagsUpdated", {
          tags: [{ tagId: args.tagIdToKeep, updates: tagToKeepUpdates }],
          withFileReload: true,
        });
      }
    } catch (err) {
      error = err.message;
      fileLog(err.stack, { type: "error" });
    } finally {
      if (args.withSub) {
        (
          [
            "onReloadFileCollections",
            "onReloadFiles",
            "onReloadImportBatches",
            "onReloadTags",
          ] as SocketEmitEvent[]
        ).forEach((event) => socket.emit(event));
      }

      if (error) throw new Error(error);
    }
  },
);

export const searchTags = makeAction(
  async ({
    excludedIds = [],
    includedIds = [],
    searchStr,
  }: {
    excludedIds: string[];
    includedIds: string[];
    searchStr: string;
  }) => {
    const trimmed = searchStr.trim();
    const searchTerms = trimmed.toLowerCase().split(" ");
    const joinedTerms = searchTerms.join(" ");

    const tags = (
      await models.TagModel.find({
        label: { $exists: true, $ne: "" },
        ...(excludedIds.length || includedIds.length
          ? {
              _id: {
                ...(excludedIds.length ? { $nin: excludedIds } : {}),
                ...(includedIds.length ? { $in: includedIds } : {}),
              },
            }
          : {}),
        ...(searchTerms.length
          ? {
              $and: searchTerms.map((term) => {
                const regEx = Fmt.regexEscape(term);
                return {
                  $or: [
                    { label: { $regex: regEx, $options: "i" } },
                    { aliases: { $elemMatch: { $regex: regEx, $options: "i" } } },
                  ],
                };
              }),
            }
          : {}),
      })
        .lean()
        .limit(100)
    ).map((t) => leanModelToJson<models.TagSchema>(t));

    const scoreTag = (tag: models.TagSchema): number => {
      const label = (tag.label ?? "").toLowerCase();
      const aliases = (tag.aliases ?? []).map((a) => a.toLowerCase());
      const allValues = [label, ...aliases];
      const input = trimmed.toLowerCase();

      if (allValues.some((v) => v === input)) return 100;
      if (allValues.some((v) => v.startsWith(input))) return 50;
      if (allValues.some((v) => v.includes(joinedTerms))) return 25;
      return 10;
    };

    const ranked = tags
      .map((tag) => ({ tag, score: scoreTag(tag) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        // Within the same score tier: most recently searched first
        const aTime = a.tag.lastSearchedAt ? dayjs(a.tag.lastSearchedAt).valueOf() : 0;
        const bTime = b.tag.lastSearchedAt ? dayjs(b.tag.lastSearchedAt).valueOf() : 0;
        if (bTime !== aTime) return bTime - aTime;

        return (b.tag.count ?? 0) - (a.tag.count ?? 0);
      })
      .slice(0, 50)
      .map(({ tag }) => tag);

    return await deriveTagCategories(ranked);
  },
);

export const refreshTag = makeAction(
  async ({ tagId, withSub = true }: { tagId: string; withSub?: boolean }) => {
    const debug = false;

    const tag = await models.TagModel.findById(tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);

    const childIds = tag.childIds?.map((i) => i.toString()) ?? [];
    const parentIds = tag.parentIds?.map((i) => i.toString()) ?? [];

    const { perfLog, perfLogTotal } = makePerfLog("[refreshTag]", true);

    if (!tag.childIds || !tag.parentIds) {
      await models.TagModel.updateOne(
        { _id: tagId },
        {
          $set: {
            ...(!tag.childIds ? { childIds: [] } : {}),
            ...(!tag.parentIds ? { parentIds: [] } : {}),
          },
        },
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

    const bulkWriteOps = makeRelationsUpdateOps({
      changedChildIds,
      changedParentIds,
      dateModified,
      tagId,
    });
    if (debug) perfLog("Derived bulkWriteOps");

    await models.TagModel.bulkWrite(bulkWriteOps);
    if (debug) perfLog("Bulk write operations executed");

    await regenTags({
      tagIds: [tagId, ...changedChildIds.added, ...changedParentIds.added],
      withSub,
    });

    if (withSub) emitTagUpdates(tagId, changedChildIds, changedParentIds);
    if (debug) perfLogTotal("Refreshed tag relations");
  },
);

const regenQueue = new PromiseQueue();

export const regenTags = makeAction(async (args: { tagIds: string[]; withSub?: boolean }) => {
  regenQueue.add(async () => {
    const chunks = chunkArray(args.tagIds, 5000);

    for (const tagIds of chunks) {
      await regenTagAncestors({ tagIds, withSub: args.withSub });
      await actions.regenFileTagAncestors({ tagIds });
      await actions.regenCollTagAncestors({ tagIds });

      await regenTagMeta({ tagIds, withSub: args.withSub });
    }
  });

  await regenQueue.resolve();
});

export const regenTagAncestors = makeAction(
  async ({ tagIds, withSub = false }: { tagIds: string[]; withSub?: boolean }) => {
    const bulkWriteOps: AnyBulkWriteOperation[] = [];
    const updates: { tagId: string; updates: Partial<models.TagSchema> }[] = [];

    for (const tagId of tagIds) {
      const ancestorIds = await deriveAncestorTagIds([tagId]);
      const descendantIds = await deriveDescendantTagIds([tagId]);
      updates.push({ tagId, updates: { ancestorIds, descendantIds } });
      bulkWriteOps.push({
        updateOne: {
          filter: { _id: tagId },
          update: { $set: { ancestorIds, descendantIds } },
        },
      });
    }

    await models.TagModel.bulkWrite(bulkWriteOps);

    if (withSub) socket.emit("onTagsUpdated", { tags: updates, withFileReload: true });
  },
);

export const regenTagMeta = makeAction(
  async ({ tagIds, withSub = true }: { tagIds: string[]; withSub?: boolean }) => {
    const metaByTagId = await models.FileModel.aggregate<{
      _id: string;
      count: number;
      size: number;
      thumb: models.TagSchema["thumb"];
    }>([
      { $match: { tagIdsWithAncestors: { $in: objectIds(tagIds) } } },
      { $sort: { dateCreated: 1 } },
      { $unwind: "$tagIdsWithAncestors" },
      { $match: { tagIdsWithAncestors: { $in: objectIds(tagIds) } } },
      {
        $group: {
          _id: "$tagIdsWithAncestors",
          count: { $sum: 1 },
          size: { $sum: "$size" },
          thumb: { $first: "$thumb" },
        },
      },
    ]);

    const metaMap = new Map(metaByTagId.map((m) => [m._id.toString(), m]));

    const updatedTags: { tagId: string; updates: Partial<models.TagSchema> }[] = [];

    const bulkWriteOps: AnyBulkWriteOperation[] = tagIds.map((tagId) => {
      const meta = metaMap.get(tagId);
      if (!meta) throw new Error(`Missing meta for tag ${tagId}`);

      const updates: Partial<models.TagSchema> = {
        count: meta.count ?? 0,
        size: meta.size ?? 0,
        thumb: meta.thumb ?? null,
      };

      updatedTags.push({ tagId, updates });

      return {
        updateOne: {
          filter: { _id: objectId(tagId) },
          update: { $set: updates, $unset: { thumbPaths: true } },
        },
      };
    });

    await models.TagModel.bulkWrite(bulkWriteOps);

    if (withSub) socket.emit("onTagsUpdated", { tags: updatedTags, withFileReload: false });
    return updatedTags;
  },
);

export const repairTags = makeAction(async () => {
  const { perfLog } = makePerfLog("[repairTags]", true);

  /* -------------------------- Replace HTML Entities ------------------------- */
  const tagsWithHtmlEntities = (
    await models.TagModel.find({ label: { $regex: Fmt.htmlEntityRegex } })
      .allowDiskUse(true)
      .lean()
  ).map((t) => leanModelToJson<models.TagSchema>(t));

  if (tagsWithHtmlEntities.length) {
    const htmlBulkRes = await models.TagModel.bulkWrite(
      tagsWithHtmlEntities
        .map((t) => {
          const decodedLabel = Fmt.decodeHtmlEntities(t.label);
          if (decodedLabel === t.label) return null;
          return {
            updateOne: {
              filter: { _id: objectId(t.id) },
              update: { $set: { label: decodedLabel } },
            },
          };
        })
        .filter(Boolean),
    );

    perfLog(`Repaired HTML entities on ${htmlBulkRes.modifiedCount} tags`);
  }

  /* -------------------- Merge tags with duplicate labels -------------------- */
  const duplicateLabels = await models.TagModel.aggregate<{
    _id: string;
    tags: Array<{
      _id: string;
      aliases: string[];
      childIds: string[];
      count: number;
      label: string;
      parentIds: string[];
      regEx: string;
    }>;
  }>([
    {
      $group: {
        _id: { $toLower: "$label" },
        tags: {
          $push: {
            _id: "$_id",
            aliases: "$aliases",
            childIds: "$childIds",
            count: "$count",
            label: "$label",
            parentIds: "$parentIds",
            regEx: "$regEx",
          },
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  let mergedCount = 0;

  for (const d of duplicateLabels) {
    const [tagToKeep, ...tagsToMerge] = [...d.tags].sort((a, b) => {
      if ((b.count ?? 0) !== (a.count ?? 0)) return (b.count ?? 0) - (a.count ?? 0);
      return a._id.toString().localeCompare(b._id.toString());
    });

    for (const tagToMerge of tagsToMerge) {
      await mergeTags({
        tagIdToKeep: tagToKeep._id.toString(),
        tagIdToMerge: tagToMerge._id.toString(),
        label: tagToKeep.label,
        aliases: tagToKeep.aliases ?? [],
        childIds: tagToKeep.childIds ?? [],
        parentIds: tagToKeep.parentIds ?? [],
        regEx: tagToKeep.regEx,
        withRegen: false,
        withSub: false,
      });

      mergedCount++;
    }
  }

  perfLog(`Merged ${mergedCount} duplicate tags`);
});

export const setTagCount = makeAction(async ({ count, id }: { count: number; id: string }) => {
  const dateModified = dayjs().toISOString();
  return models.TagModel.updateOne({ _id: id }, { $set: { count }, dateModified });
});

export const upsertTag = makeAction(
  async ({ label, parentLabels }: { label: string; parentLabels?: string[] }) => {
    const parentIds: string[] =
      parentLabels?.length > 0
        ? (await Promise.all(parentLabels.map(async (pLabel) => upsertTag({ label: pLabel }))))
            .map((p) => p.data?.id)
            .filter(Boolean)
        : [];

    const tagId = await models.TagModel.findOne({ label }).then((r) => r?._id?.toString());
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
  },
);
