import * as models from "medior/_generated/models";
import { SocketEmitEvent } from "medior/_generated/socket";
import { AnyBulkWriteOperation } from "mongodb";
import mongoose, { FilterQuery, PipelineStage, UpdateQuery } from "mongoose";
import * as actions from "medior/server/database/actions";
import * as Types from "medior/server/database/types";
import { bisectArrayChanges, dayjs, Fmt, handleErrors, splitArray } from "medior/utils/common";
import { leanModelToJson, makeAction, objectId, objectIds } from "medior/utils/server";
import { fileLog, makePerfLog, socket } from "medior/utils/server";

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

const deriveTagThumb = async (tagId: string): Promise<models.TagSchema["thumb"]> => {
  const file = await models.FileModel.findOne({ tagIdsWithAncestors: tagId })
    .sort({ dateCreated: 1 })
    .select({ thumb: 1 })
    .lean();

  return file?.thumb;
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
  const tags = (
    await models.TagModel.find({ _id: { $in: objectIds([...new Set(tagIds)]) } })
      .select({ _id: 1, ancestorIds: 1 })
      .lean()
  ).map(leanModelToJson<models.TagSchema>);

  return Object.fromEntries(
    tags.map((t) => [
      t.id.toString(),
      [t.id.toString(), ...t.ancestorIds.map((id) => id.toString())],
    ]),
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
  ancestorsMap: Record<string, string[]>;
  oldTagIdsWithAncestors: string[];
  tagIds: string[];
}) => {
  const oldSet = new Set(oldTagIdsWithAncestors.map((id) => id.toString()));
  const newSet = new Set(
    tagIds
      .flatMap((tagId) => ancestorsMap[tagId.toString()]?.map((id) => id.toString()))
      .filter(Boolean),
  );
  return {
    hasUpdates: oldSet.size !== newSet.size || [...oldSet].some((item) => !newSet.has(item)),
    tagIdsWithAncestors: [...newSet],
  };
};

export const regenTags = makeAction(
  async ({ tagIds, withSub = false }: { tagIds: string[]; withSub?: boolean }) => {
    await Promise.all([
      regenTagAncestors({ tagIds, withSub }),
      tagIds.map((tagId) => regenTagThumbPaths({ tagId })),
    ]);

    await Promise.all([
      actions.regenCollTagAncestors({ tagIds }),
      actions.regenFileTagAncestors({ tagIds }),
    ]);
  },
);

export const regenTagAncestors = makeAction(
  async ({ tagIds, withSub = false }: { tagIds: string[]; withSub?: boolean }) => {
    const updates: { tagId: string; updates: Partial<models.TagSchema> }[] = [];

    await Promise.all(
      tagIds.map(async (tagId) => {
        const ancestorIds = await deriveAncestorTagIds([tagId]);
        const descendantIds = await deriveDescendantTagIds([tagId]);
        await models.TagModel.updateOne({ _id: tagId }, { $set: { ancestorIds, descendantIds } });
        updates.push({ tagId, updates: { ancestorIds, descendantIds } });
      }),
    );

    if (withSub) socket.emit("onTagsUpdated", { tags: updates, withFileReload: true });
  },
);

export const regenTagThumbPaths = makeAction(async ({ tagId }: { tagId: string }) => {
  return models.TagModel.updateOne(
    { _id: tagId },
    {
      $unset: { thumbPaths: true },
      $set: { thumb: await deriveTagThumb(tagId) },
    },
  );
});

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const createTag = makeAction(
  async ({
    aliases = [],
    categoryId,
    childIds = [],
    label,
    parentIds = [],
    regEx,
    withRegen = true,
    withSub = true,
  }: {
    aliases?: string[];
    categoryId?: string;
    childIds?: string[];
    label: string;
    parentIds?: string[];
    regEx?: string;
    withRegen?: boolean;
    withSub?: boolean;
  }) => {
    const dateModified = dayjs().toISOString();
    const tag: Omit<models.TagSchema, "id"> = {
      aliases,
      ancestorIds: [],
      categoryId,
      childIds,
      count: 0,
      dateCreated: dateModified,
      dateModified,
      descendantIds: [],
      label,
      lastSearchedAt: dateModified,
      parentIds,
      regEx,
      thumb: null,
    };

    const res = await models.TagModel.create(tag);
    const id = res._id.toString();

    const tagBulkWriteOps = await makeRelationsUpdateOps({
      changedChildIds: { added: childIds },
      changedParentIds: { added: parentIds },
      dateModified,
      tagId: id,
    });

    await models.TagModel.bulkWrite(tagBulkWriteOps);

    if (withRegen && (childIds.length > 0 || parentIds.length > 0)) {
      const tagIds = [id, ...childIds, ...parentIds];
      await regenTags({ tagIds, withSub });
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

  const countRes = await recalculateTagCounts({ tagIds: parentIds, withSub: true });
  if (!countRes.success) throw new Error(countRes.error);

  socket.emit("onTagDeleted", { ids: [id] });
});

export const editTag = makeAction(
  async ({
    childIds,
    id,
    parentIds,
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

    const [affectedFileIds, affectedCollIds, bulkWriteOps] = await Promise.all([
      (await actions.listFileIdsByTagIds({ tagIds: changedTagIds })).data,
      (await actions.listCollectionIdsByTagIds({ tagIds: changedTagIds })).data,
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
            ...updates,
            dateModified,
            ...(childIds !== undefined ? { childIds: objectIds(childIds) } : {}),
            ...(parentIds !== undefined ? { parentIds: objectIds(parentIds) } : {}),
          },
        },
      },
    ].filter(Boolean);

    const res = await models.TagModel.bulkWrite(operations);

    if (changedTagIds.length > 0) {
      await regenTagAncestors({ tagIds: changedTagIds, withSub });

      await Promise.all([
        actions.regenCollTagAncestors({ collectionIds: affectedCollIds }),
        actions.regenFileTagAncestors({ fileIds: affectedFileIds }),
      ]);

      await Promise.all([
        regenTagThumbPaths({ tagId: id }),
        recalculateTagCounts({
          tagIds: [id, ...changedParentIds.added, ...changedParentIds.removed],
          withSub,
        }),
      ]);
    }

    if (withSub) await emitTagUpdates(id, changedChildIds, changedParentIds);
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

    const [affectedFileIds, affectedCollIds, ...bulkWriteOps] = await Promise.all([
      (await actions.listFileIdsByTagIds({ tagIds: changedTagIds })).data,
      (await actions.listCollectionIdsByTagIds({ tagIds: changedTagIds })).data,
      ...tags.map(async (tag) => {
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

        const relationOps = await makeRelationsUpdateOps({
          changedChildIds: {
            added: validChildIdsToAdd,
            removed: args.childIdsToRemove ?? [],
          },
          changedParentIds: {
            added: validParentIdsToAdd,
            removed: args.parentIdsToRemove ?? [],
          },
          dateModified,
          tagId: tag.id,
        });

        const tagAddOps: AnyBulkWriteOperation[] = [
          // @ts-expect-error
          (validChildIdsToAdd.length > 0 || validParentIdsToAdd.length > 0) && {
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
          (childIdsToRemove?.length > 0 || parentIdsToRemove?.length > 0) && {
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
      }),
    ]);

    if (errors.length > 0) fileLog(["editMultiTagRelations", errors], { type: "warn" });

    const bulkWriteRes = await models.TagModel.bulkWrite(bulkWriteOps.flat());

    await regenTagAncestors({ tagIds: changedTagIds, withSub: false });

    await Promise.all([
      actions.regenCollTagAncestors({ collectionIds: affectedCollIds }),
      actions.regenFileTagAncestors({ fileIds: affectedFileIds }),
    ]);

    await Promise.all([
      ...args.tagIds.map((tagId) => regenTagThumbPaths({ tagId })),
      recalculateTagCounts({ tagIds: changedTagIds, withSub: false }),
    ]);

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

export const listTagsByLabels = makeAction(async ({ labels }: { labels: string[] }) => {
  return (await models.TagModel.find({ label: { $in: labels } }).lean()).map((t) =>
    leanModelToJson<models.TagSchema>(t),
  );
});

export const mergeTags = makeAction(
  async (
    args: Omit<Required<Types.CreateTagInput>, "withRegen" | "withSub"> & {
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

      await regenTagAncestors({ tagIds: [args.tagIdToKeep, ...tagIdsToUpdate] });

      await Promise.all([
        actions.regenCollTagAncestors({ tagIds: [args.tagIdToKeep] }),
        actions.regenFileTagAncestors({ tagIds: [args.tagIdToKeep] }),
      ]);

      const [countRes] = await Promise.all([
        recalculateTagCounts({ tagIds: [args.tagIdToKeep, ...tagIdsToUpdate], withSub: false }),
        regenTagThumbPaths({ tagId: args.tagIdToKeep }),
      ]);
      if (!countRes.success) throw new Error(countRes.error);

      socket.emit("onTagMerged", { newTagId: args.tagIdToKeep, oldTagId: args.tagIdToMerge });
      socket.emit("onTagsUpdated", {
        tags: [...countRes.data, { tagId: args.tagIdToKeep, updates: tagToKeepUpdates }],
        withFileReload: true,
      });
    } catch (err) {
      error = err.message;
      fileLog(err.stack, { type: "error" });
    } finally {
      (
        [
          "onReloadFileCollections",
          "onReloadFiles",
          "onReloadImportBatches",
          "onReloadTags",
        ] as SocketEmitEvent[]
      ).forEach((event) => socket.emit(event));

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
    const searchTerms = searchStr.trim().toLowerCase().split(" ");

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
        .sort({ lastSearchedAt: "desc", count: "desc" })
        .limit(30)
    ).map((t) => leanModelToJson<models.TagSchema>(t));

    return tags;
  },
);

export const recalculateTagCounts = makeAction(
  async ({ tagIds, withSub = true }: { tagIds: string[]; withSub?: boolean }) => {
    const updatedTags: { tagId: string; updates: Partial<models.TagSchema> }[] = [];

    await Promise.all(
      tagIds.map(async (id) => {
        const count = await models.FileModel.count({ tagIdsWithAncestors: id });
        updatedTags.push({ tagId: id, updates: { count } });
        return models.TagModel.updateOne({ _id: id }, { $set: { count } });
      }),
    );

    if (withSub) socket.emit("onTagsUpdated", { tags: updatedTags, withFileReload: false });
    return updatedTags;
  },
);

export const refreshTagRelations = makeAction(
  async ({ tagId, withSub = true }: { tagId: string; withSub?: boolean }) => {
    const debug = false;

    const tag = await models.TagModel.findById(tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);

    const childIds = tag.childIds?.map((i) => i.toString()) ?? [];
    const parentIds = tag.parentIds?.map((i) => i.toString()) ?? [];

    const { perfLog, perfLogTotal } = makePerfLog("[refreshTagRelations]", true);

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

    const bulkWriteOps = await makeRelationsUpdateOps({
      changedChildIds,
      changedParentIds,
      dateModified,
      tagId,
    });
    if (debug) perfLog("Derived bulkWriteOps");

    await models.TagModel.bulkWrite(bulkWriteOps);
    if (debug) perfLog("Bulk write operations executed");

    await Promise.all([
      actions.regenCollTagAncestors({ tagIds: [tagId] }),
      actions.regenFileTagAncestors({ tagIds: [tagId] }),
    ]);

    if (changedChildIds.added.length || changedParentIds.added.length)
      await recalculateTagCounts({
        tagIds: [tagId, ...changedChildIds.added, ...changedParentIds.added],
        withSub,
      });

    if (debug) perfLog("Regenerated tag ancestors, recalculated tag counts");

    if (withSub) await emitTagUpdates(tagId, changedChildIds, changedParentIds);
    if (debug) perfLogTotal("Refreshed tag relations");
  },
);

export const refreshTag = makeAction(async ({ tagId }: { tagId: string }) => {
  const debug = false;
  const { perfLogTotal } = makePerfLog("[refreshTags]", true);

  await refreshTagRelations({ tagId, withSub: false });
  await regenTagAncestors({ tagIds: [tagId], withSub: false });

  await Promise.all([
    recalculateTagCounts({ tagIds: [tagId], withSub: false }),
    regenTagThumbPaths({ tagId }),
  ]);

  if (debug) perfLogTotal(`Refreshed tag ${tagId}`);
});

export const repairTags = makeAction(async () => {
  const { perfLog } = makePerfLog("[repairTags]", true);

  const tagsWithBrokenRegEx = (
    await models.TagModel.find({ regExMap: { $exists: true } })
      .allowDiskUse(true)
      .lean()
  ).map((t) => leanModelToJson<models.TagSchema>(t));

  perfLog(`Found ${tagsWithBrokenRegEx.length} tags with broken regEx`);

  const bulkWriteRes = await models.TagModel.bulkWrite(
    [...tagsWithBrokenRegEx].map((f) => ({
      updateOne: {
        filter: { _id: objectId(f.id) },
        // @ts-expect-error
        update: [{ $set: { regEx: f.regExMap?.regEx ?? null } }, { $unset: "regExMap" }],
      },
    })),
  );
  perfLog(`Repaired regEx of ${bulkWriteRes.modifiedCount} tags`);
  if (bulkWriteRes.modifiedCount !== tagsWithBrokenRegEx.length)
    throw new Error(`Bulk write failed: ${JSON.stringify(bulkWriteRes, null, 2)}`);
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
