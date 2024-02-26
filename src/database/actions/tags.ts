import mongoose, { FilterQuery, PipelineStage, UpdateQuery } from "mongoose";
import { AnyBulkWriteOperation } from "mongodb";
import * as db from "database";
import { SocketEmitEvent } from "server";
import { bisectArrayChanges, dayjs, handleErrors, logToFile, socket } from "utils";
import { leanModelToJson, objectIds } from "./utils";

/* ---------------------------- HELPER FUNCTIONS ---------------------------- */
export const deriveTagIdsWithAncestors = async (tagIds: string[]) => {
  const pipeline = [
    { $match: { _id: { $in: tagIds } } },
    {
      $graphLookup: {
        from: "tags",
        startWith: "$parentIds",
        connectFromField: "parentIds",
        connectToField: "_id",
        as: "ancestors",
      },
    },
    { $project: { tagIdsWithAncestors: { $setUnion: ["$ancestors._id", ["$_id"]] } } },
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

    const keyOfOppType = type === "child" ? "parentIds" : "childIds";

    if (changedIds.added.length > 0) {
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
    }

    if (changedIds.removed.length > 0) {
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
    }

    return ops;
  };

  return [
    ...updateRelatedTags("child", changedChildIds),
    ...updateRelatedTags("parent", changedParentIds),
  ];
};

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
    const tag = {
      aliases,
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

    const changedChildIds = bisectArrayChanges([], childIds);
    const changedParentIds = bisectArrayChanges([], parentIds);

    const tagBulkWriteOps = await makeRelationsUpdateOps({
      changedChildIds,
      changedParentIds,
      dateModified,
      tagId: id,
    });

    await db.TagModel.bulkWrite(tagBulkWriteOps);

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

    const bulkWriteOps = await makeRelationsUpdateOps({
      changedChildIds,
      changedParentIds,
      dateModified,
      tagId: id,
    });

    const operations: AnyBulkWriteOperation[] = [
      ...bulkWriteOps,
      {
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: {
            aliases,
            dateModified,
            label,
            regExMap,
            ...(childIds?.length > 0 ? { childIds: objectIds(childIds) } : {}),
            ...(parentIds?.length > 0 ? { parentIds: objectIds(parentIds) } : {}),
          },
        },
      },
    ].filter(Boolean);

    const res = await db.TagModel.bulkWrite(operations);

    if (
      changedChildIds.added.length > 0 ||
      changedChildIds.removed.length > 0 ||
      changedParentIds.added.length > 0 ||
      changedParentIds.removed.length > 0
    ) {
      const tagIdsFilter = {
        $or: [
          { tagIds: id },
          { tagIds: { $in: objectIds([...changedChildIds.added, ...changedChildIds.removed]) } },
          {
            tagIds: { $in: objectIds([...changedParentIds.added, ...changedParentIds.removed]) },
          },
        ],
      };

      await Promise.all([
        db.regenCollTagAncestors(tagIdsFilter),
        db.regenFileTagAncestors(tagIdsFilter),
        recalculateTagCounts({ tagIds: [id, ...origParentIds], withSub }),
      ]);
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
      const _tagIdToKeep = new mongoose.Types.ObjectId(tagIdToKeep);
      const _tagIdToMerge = new mongoose.Types.ObjectId(tagIdToMerge);
      const dateModified = dayjs().toISOString();

      const updateMany: {
        filter: FilterQuery<db.File | db.FileImportBatch | db.FileCollection>;
        update: UpdateQuery<db.File | db.FileImportBatch | db.FileCollection>;
      } = {
        filter: { tagIds: _tagIdToMerge },
        update: { $set: { "tagIds.$": _tagIdToKeep } },
      };

      await Promise.all([
        db.FileCollectionModel.updateMany(updateMany.filter, updateMany.update),
        db.FileImportBatchModel.updateMany(updateMany.filter, updateMany.update),
        db.FileModel.updateMany(updateMany.filter, updateMany.update),
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
        db.regenCollTagAncestors({ tagIds: [_tagIdToKeep] }),
        db.regenFileTagAncestors({ tagIds: [_tagIdToKeep] }),
        recalculateTagCounts({ tagIds: tagIdsToUpdate, withSub: true }),
      ]);

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
    const pipeline: PipelineStage[] = [
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
      {
        $lookup: {
          from: "files",
          localField: "tagIds",
          foreignField: "tagIds",
          as: "descendantFiles",
          pipeline: [{ $project: { _id: 1 } }],
        },
      },
      {
        $group: {
          _id: "$_id",
          count: { $sum: { $size: "$descendantFiles" } },
        },
      },
    ];

    const results: { _id: string; count: number }[] = await db.TagModel.aggregate(pipeline);

    const dateModified = dayjs().toISOString();
    await Promise.all(
      results.map(({ _id, count }) =>
        db.TagModel.updateOne({ _id }, { $set: { count, dateModified } })
      )
    );

    if (withSub)
      socket.emit(
        "tagsUpdated",
        results.map(({ _id, count }) => ({ tagId: _id, updates: { count } }))
      );

    return results;
  });

export const refreshTagRelations = ({
  changedChildIds,
  changedParentIds,
  dateModified,
  tagId,
  withSub = true,
}: db.RefreshTagRelationsInput) =>
  handleErrors(async () => {
    const tag = await db.TagModel.findById(tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);

    const childIds = tag.childIds?.map((i) => i.toString()) ?? [];
    const parentIds = tag.parentIds?.map((i) => i.toString()) ?? [];

    const getOrphanedIds = async (field: string, oppIds: string[]) => {
      const tags = await db.TagModel.find({ [field]: tagId }).lean();
      return tags.reduce((acc, cur) => {
        const otherTag = leanModelToJson<db.Tag>(cur);
        if (oppIds.includes(otherTag.id)) return acc;
        return [...acc, otherTag.id];
      }, [] as string[]);
    };

    const [idsWithOrphanedChild, idsWithOrphanedParent] = await Promise.all([
      getOrphanedIds("childIds", parentIds),
      getOrphanedIds("parentIds", childIds),
    ]);

    if (!tag.childIds || !tag.parentIds)
      await db.TagModel.updateOne(
        { _id: tagId },
        {
          $set: {
            ...(!tag.childIds ? { childIds: [] } : {}),
            ...(!tag.parentIds ? { parentIds: [] } : {}),
          },
        }
      );

    await db.TagModel.bulkWrite(
      // @ts-expect-error
      [
        ...(await makeRelationsUpdateOps({
          changedChildIds,
          changedParentIds,
          dateModified,
          tagId,
        })),
        {
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(tagId) },
            update: {
              $addToSet: {
                childIds: { $each: objectIds(idsWithOrphanedParent) },
                parentIds: { $each: objectIds(idsWithOrphanedChild) },
              },
              $set: { dateModified },
            },
          },
        },
      ].filter(Boolean)
    );

    if (withSub) await emitTagUpdates(tagId, changedChildIds, changedParentIds);
  });

export const setTagCount = ({ count, id }: db.SetTagCountInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    return db.TagModel.updateOne({ _id: id }, { $set: { count }, dateModified });
  });
