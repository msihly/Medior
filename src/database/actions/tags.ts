import mongoose, { FilterQuery, PipelineStage, UpdateQuery } from "mongoose";
import { AnyBulkWriteOperation } from "mongodb";
import * as db from "database";
import { SocketEmitEvent } from "server";
import { bisectArrayChanges, dayjs, handleErrors, logToFile, makePerfLog, socket } from "utils";
import { leanModelToJson, objectId, objectIds } from "./utils";

/* ---------------------------- HELPER FUNCTIONS ---------------------------- */
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

    socket.emit(
      "tagsUpdated",
      updatedTags.map((tag) => ({ tagId: tag.id, updates: { ...tag } }))
    );
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

    if (withSub) socket.emit("tagsUpdated", updates);
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
      await regenTagAncestors({ tagIds: changedTagIds });

      await Promise.all([
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

export const listTags = () =>
  handleErrors(async () =>
    (await db.TagModel.find().lean()).map((r) => leanModelToJson<db.Tag>(r))
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
        regenTagAncestors({ tagIds: [tagIdToKeep, ...tagIdsToUpdate] }),
      ]);

      await recalculateTagCounts({ tagIds: [tagIdToKeep, ...tagIdsToUpdate], withSub: true });

      socket.emit("tagDeleted", { tagId: tagIdToMerge });
      socket.emit("tagsUpdated", [{ tagId: tagIdToKeep, updates: tagToKeepUpdates }]);
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

    if (withSub) socket.emit("tagsUpdated", updatedTags);
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
