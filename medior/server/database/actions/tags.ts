import * as models from "medior/_generated/server/models";
import { SocketEmitEvent } from "medior/_generated/server/socket";
import { AnyBulkWriteOperation } from "mongodb";
import { FilterQuery, UpdateQuery } from "mongoose";
import { fileLog, makePerfLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import {
  canRunBackgroundQueues,
  makeBackgroundOperationRunner,
  mergeTagMetadataQueues,
} from "medior/server/database/actions/background-operations";
import { backgroundExecution } from "medior/server/database/background-execution";
import { assertImportEntriesReady } from "medior/server/database/import-entry-state";
import { normalizeMediaPathWrites } from "medior/server/database/media-paths";
import {
  getBackgroundSession,
  getMetadataCreateId,
  metadataWriteOptions,
  readMetadataSnapshot,
  registerMetadataWork,
  repairMetadata,
} from "medior/server/database/metadata-work";
import { makeRepairReporter } from "medior/server/database/repair-progress";
import { getRelatedTags, loadTagGraph } from "medior/server/database/tag-ancestry";
import { readTagMetadata, writeTagMetadata } from "medior/server/database/tag-metadata";
import { assertTagRelationships } from "medior/server/database/tag-relationships";
import * as Types from "medior/server/database/types";
import {
  bisectArrayChanges,
  chunkArray,
  dayjs,
  Fmt,
  isDeepEqual,
  mergeTagDefinitions,
  preferredTagLabel,
  resolveTagCategory,
  TagCategorySource,
  tagsToRegEx,
} from "medior/utils/common";
import { collectRelatedTagIds } from "medior/utils/common/tag-hierarchy";
import { leanModelToJson, makeAction, objectId, objectIds, socket } from "medior/utils/server";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
export const deriveAncestorTagIds = async (
  tagIds: string[],
  withBaseId = true,
): Promise<string[]> => {
  if (!tagIds.length) return [];

  return collectRelatedTagIds(await loadTagGraph(tagIds, false), tagIds, withBaseId);
};

export const deriveDescendantTagIds = async (
  tagIds: string[],
  withBaseId = true,
): Promise<string[]> => {
  if (!tagIds.length) return [];

  return collectRelatedTagIds(await loadTagGraph(tagIds, true), tagIds, withBaseId);
};

export const deriveTagCategories = async (tags: models.TagSchema[]) => {
  if (!tags.length) return tags;

  const parentIds = tags
    .filter((tag) => !tag.category?.color || !tag.category?.icon || tag.category?.sortRank == null)
    .flatMap((tag) => tag.parentIds ?? []);

  const ancestorIds = parentIds.length ? await deriveAncestorTagIds(parentIds) : [];
  const ancestors = ancestorIds.length
    ? await models.TagModel.find({ _id: { $in: objectIds(ancestorIds) } })
        .select({ _id: 1, category: 1, parentIds: 1 })
        .lean()
    : [];

  const ancestorMap = new Map(
    ancestors.map((ancestor) => {
      const tag = leanModelToJson<models.TagSchema>(ancestor);

      return [tag.id, tag] as const;
    }),
  );

  return tags.map((tag) => ({ ...tag, category: resolveTagCategory(tag, ancestorMap) }));
};

const emitTagUpdates = async (
  tagId: string | string[],
  changedChildIds: { added: string[]; removed: string[] },
  changedParentIds: { added: string[]; removed: string[] },
) => {
  const updatedTags = (
    await models.TagModel.find({
      _id: {
        $in: objectIds([
          ...[tagId].flat(),
          ...changedChildIds.added,
          ...changedChildIds.removed,
          ...changedParentIds.added,
          ...changedParentIds.removed,
        ]),
      },
    })
      .select({ ancestorIds: 0, descendantIds: 0 })
      .lean()
  ).map((r) => leanModelToJson<models.TagSchema>(r));

  socket.emit("onTagsUpdated", {
    tags: updatedTags.map((tag) => ({ tagId: tag.id, updates: { ...tag } })),
    withFileReload: !!(
      changedChildIds.added.length ||
      changedChildIds.removed.length ||
      changedParentIds.added.length ||
      changedParentIds.removed.length
    ),
  });
};

const getOrphanedIds = async (tagId: string, field: string, oppIds: string[]) => {
  const tags = await models.TagModel.find({ [field]: tagId })
    .select({ _id: 1 })
    .lean();

  const retainedIds = new Set(oppIds);

  return tags.map((tag) => String(tag._id)).filter((id) => !retainedIds.has(id));
};

export const makeAncestorIdsMap = async (tagIds: string[]) => {
  const debug = false;
  const { perfLogTotal } = makePerfLog("makeAncestorIdsMap", true);

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

  if (debug) perfLogTotal(`Created ancestorIds map for ${tagIds.length} tags.`);

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

/** Adds or removes `tagId` to the opposite type (`childIds` or `parentIds`) to create hierarchical relations.
 *  For example, adds `tagId` to the `parentIds` of every id in `changedChildIds.added.` */
const makeRelationsUpdateOps = ({
  changedAncestorIds,
  changedChildIds,
  changedDescendantIds,
  changedParentIds,
  dateModified,
  tagId,
}: {
  changedAncestorIds?: { added?: string[]; removed?: string[] };
  changedChildIds?: { added?: string[]; removed?: string[] };
  changedDescendantIds?: { added?: string[]; removed?: string[] };
  changedParentIds?: { added?: string[]; removed?: string[] };
  dateModified: string;
  tagId: string;
}) => {
  const ids = [tagId];

  const updateRelatedTags = (
    keyOfOppType: "ancestorIds" | "childIds" | "descendantIds" | "parentIds",
    changedIds: { added?: string[]; removed?: string[] },
  ) => {
    const ops: AnyBulkWriteOperation<models.TagSchema>[] = [];

    if (!changedIds?.added?.length && !changedIds?.removed?.length) return ops;

    if (changedIds.added?.length > 0)
      ops.push({
        updateMany: {
          filter: { _id: { $in: objectIds(changedIds.added) } },
          update: {
            $addToSet: { [keyOfOppType]: { $each: ids } },
            $set: { dateModified },
          },
        },
      });

    if (changedIds.removed?.length > 0)
      ops.push({
        updateMany: {
          filter: { _id: { $in: objectIds(changedIds.removed) } },
          update: {
            $pullAll: { [keyOfOppType]: ids },
            $set: { dateModified },
          },
        },
      });

    return ops;
  };

  return [
    ...updateRelatedTags("ancestorIds", changedDescendantIds),
    ...updateRelatedTags("childIds", changedParentIds),
    ...updateRelatedTags("descendantIds", changedAncestorIds),
    ...updateRelatedTags("parentIds", changedChildIds),
  ];
};

const processTagRegenQueue = async () => {
  while (canRunBackgroundQueues()) {
    let operation: models.BackgroundOperationSchema;

    try {
      operation = leanModelToJson<models.BackgroundOperationSchema>(
        await models.BackgroundOperationModel.findOne({
          status: { $in: ["PENDING", "RUNNING"] },
          type: { $in: ["tagHierarchy", "tagMetadata", "tagRefresh"] },
        })
          .sort({ dateCreated: 1 })
          .lean(),
      );

      if (!operation) return;

      if (operation.status === "PENDING") {
        const claimed = await actions.setBackgroundOperationStatus(operation.id, "RUNNING");

        if (claimed?.status !== "RUNNING") continue;
      }

      if (backgroundExecution.getStore()) backgroundExecution.getStore().operationId = operation.id;

      if (operation.type === "tagMetadata" && (await mergeTagMetadataQueues(operation))) continue;

      const tagIds =
        operation.type === "tagMetadata"
          ? [...operation.targetIds]
          : operation.targetIds.slice(0, 100);

      if (operation.type === "tagMetadata" && tagIds.length)
        await actions.setBackgroundOperationStatus(operation.id, "RUNNING", {
          message: `Scanning metadata for ${tagIds.length} tags; ${operation.processedCount} of ${operation.totalCount} completed.`,
        });

      // Targets stay queued until their scan results have been saved.
      const metadata =
        operation.type === "tagMetadata" && tagIds.length
          ? await readTagMetadata(tagIds, operation)
          : null;

      await (async () => {
        const current = await models.BackgroundOperationModel.findById(operation.id).lean();

        if (
          !current ||
          !["PENDING", "RUNNING"].includes(current.status) ||
          current.targetIds.slice(0, tagIds.length).join() !== tagIds.join()
        )
          return;

        if (!tagIds.length) {
          if (current.targetIds.length) return;

          await actions.completeEmptyBackgroundOperation(
            operation.id,
            `${operation.label} completed.`,
          );

          return;
        }

        if (operation.type === "tagMetadata") {
          await actions.setBackgroundOperationStatus(operation.id, "RUNNING", {
            message: `File scan complete. Saving metadata for ${tagIds.length} tags.`,
          });
          const tagsById = new Map(metadata.tags.map((tag) => [String(tag._id), tag]));

          for (const ids of chunkArray(tagIds, 100)) {
            await writeTagMetadata(
              {
                ...metadata,
                tagIds: ids,
                tags: ids.map((id) => tagsById.get(id)).filter(Boolean),
              },
              true,
            );

            await actions.completeBackgroundOperationTargets(
              operation.id,
              ids,
              `File scan complete. Saving metadata for ${tagIds.length} tags.`,
              metadata.versions,
            );
          }

          return;
        } else if (operation.type === "tagRefresh") {
          for (const tagId of tagIds) {
            if (!(await models.TagModel.exists({ _id: tagId }))) continue;

            const refreshed = await refreshTag({ tagId, withSub: false });

            if (!refreshed.success) throw new Error(refreshed.error);
          }

          socket.emit("onTagsUpdated", {
            tags: tagIds.map((tagId) => ({ tagId, updates: {} })),
            withFileReload: true,
          });
        } else {
          const tagRes = await regenTagAncestors({ tagIds, withSub: false });

          if (!tagRes.success) throw new Error(tagRes.error);

          // Only cached relationships changed. Source edits already notify searches at commit.
        }

        await actions.setBackgroundOperationStatus(operation.id, "RUNNING", {
          message: `Metadata saved. Updating the remaining tag queue (${current.targetIds.length.toLocaleString()} tags).`,
        });

        await actions.completeBackgroundOperationTargets(
          operation.id,
          tagIds,
          `${operation.label}: processed ${current.processedCount + tagIds.length} of ${current.totalCount} tags.`,
          metadata?.versions ?? operation.targetVersions ?? {},
        );
      })();
    } catch (error) {
      if (!canRunBackgroundQueues()) return;

      if (!operation) throw error;

      await actions.setBackgroundOperationStatus(operation.id, "ERROR", {
        error: error?.message ?? String(error),
      });

      await actions.recordNotification({
        message: `${operation.label} failed: ${error?.message ?? String(error)}`,
        type: "error",
      });
    }
  }
};

const runTagRegenQueue = makeBackgroundOperationRunner(
  "tag regeneration",
  processTagRegenQueue,
  false,
);

// @generator-ignore-export
export const queueTagMetadataRegen = async (tagIds: string[], ancestorIds?: string[]) => {
  if (!tagIds.length) return;

  const targetIds = [
    ...new Set(
      ancestorIds ??
        (await getRelatedTags(tagIds, false)).flatMap((tag) => tag.related.map(String)),
    ),
  ];

  await actions.queueBackgroundOperation({
    label: "Tag metadata regeneration",
    targetIds,
    type: "tagMetadata",
  });

  runTagRegenQueue();
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const createTag = makeAction(
  registerMetadataWork(
    "createTag",
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
      const id = getMetadataCreateId(`tag:${label}`).toString();

      await assertTagRelationships([{ childIds, id, parentIds }]);

      const tag: Omit<models.TagSchema, "id"> = {
        aliases,
        ancestorIds: [id],
        category,
        childIds,
        count: 0,
        dateCreated: dateModified,
        dateModified,
        descendantIds: [id],
        label,
        lastSearchedAt: dateModified,
        parentIds,
        rating: 0,
        ratingIsManual: false,
        regEx,
        size: 0,
        thumb: null,
      };

      await models.TagModel.updateOne(
        { _id: id },
        { $setOnInsert: tag },
        { ...metadataWriteOptions(), upsert: true },
      );

      const tagBulkWriteOps = makeRelationsUpdateOps({
        changedChildIds: { added: childIds },
        changedParentIds: { added: parentIds },
        dateModified,
        tagId: id,
      });

      if (tagBulkWriteOps.length)
        await models.TagModel.bulkWrite(normalizeMediaPathWrites("Tag", tagBulkWriteOps), {
          session: getBackgroundSession(),
        });

      if (withRegen && (childIds.length > 0 || parentIds.length > 0)) {
        const tagIds = [id, ...childIds, ...parentIds];

        const queued = await regenTags({ tagIds, withDescendantMetadata: false, withSub });

        if (!queued.success) throw new Error(queued.error);
      }

      const created = leanModelToJson<models.TagSchema>(await models.TagModel.findById(id).lean());

      if (withRegen || withSub) socket.emit("onTagCreated", created);

      return created;
    },
    true,
  ),
);

export const deleteTag = makeAction(
  registerMetadataWork(
    "deleteTag",
    async ({ id }: { id: string }) => {
      await assertImportEntriesReady();

      const dateModified = dayjs().toISOString();
      const tagIds = [id];

      const tag = await readMetadataSnapshot(`deleteTag:${id}`, () =>
        models.TagModel.findById(id).lean(),
      );

      if (!tag) throw new Error("Tag not found");

      const parentIds = tag.parentIds.map((i) => i.toString());

      await models.FileImportBatchModel.updateMany({ tagIds: id }, { $pull: { tagIds: id } });
      await models.FileImportModel.updateMany({ tagIds: id }, { $pull: { tagIds: id } });
      await models.FileModel.updateMany({ tagIds: id }, { $pull: { tagIds: id }, dateModified });

      await models.FileCollectionModel.updateMany(
        { tagIds: id },
        { $inc: { __v: 1 }, $pull: { tagIds: id }, $set: { dateModified } },
      );

      await models.TagModel.updateMany(
        { $or: [{ childIds: id }, { parentIds: id }] },
        { $pullAll: { childIds: tagIds, parentIds: tagIds }, dateModified },
      );

      await models.TagModel.deleteOne({ _id: id });

      const queued = await regenTags({
        tagIds: [id, ...parentIds, ...tag.childIds.map(String)],
        withDescendantMetadata: false,
        withSub: true,
      });

      if (!queued.success) throw new Error(queued.error);

      socket.emit("onTagDeleted", { ids: [id] });
    },
    true,
  ),
);

export const editTag = makeAction(
  registerMetadataWork(
    "editTag",
    async ({
      childIds,
      id,
      parentIds,
      withRegen = true,
      withSub = true,
      ...updates
    }: Partial<Types.CreateTagInput> & { id: string }) => {
      const dateModified = dayjs().toISOString();

      const tag = await readMetadataSnapshot(`editTag:${id}`, () =>
        models.TagModel.findById(id).select({ childIds: 1, parentIds: 1 }).lean(),
      );

      if (!tag) throw new Error("Tag not found");

      const origChildIds = tag.childIds?.map((i) => i.toString()) ?? [];
      const origParentIds = tag.parentIds?.map((i) => i.toString()) ?? [];

      const changedChildIds = childIds
        ? bisectArrayChanges(origChildIds, childIds)
        : { added: [], removed: [] };

      const changedParentIds = parentIds
        ? bisectArrayChanges(origParentIds, parentIds)
        : { added: [], removed: [] };

      if (childIds !== undefined)
        changedChildIds.removed = [
          ...new Set([
            ...changedChildIds.removed,
            ...(await getOrphanedIds(id, "parentIds", childIds)),
          ]),
        ];

      if (parentIds !== undefined)
        changedParentIds.removed = [
          ...new Set([
            ...changedParentIds.removed,
            ...(await getOrphanedIds(id, "childIds", parentIds)),
          ]),
        ];

      const changedRelationTagIds = [
        ...changedChildIds.added,
        ...changedChildIds.removed,
        ...changedParentIds.added,
        ...changedParentIds.removed,
      ];

      const changedTagIds = changedRelationTagIds.length ? [id, ...changedRelationTagIds] : [];

      await assertTagRelationships([{ childIds, id, parentIds }]);

      const bulkWriteOps = makeRelationsUpdateOps({
        changedChildIds: { ...changedChildIds, added: childIds ?? [] },
        changedParentIds: { ...changedParentIds, added: parentIds ?? [] },
        dateModified,
        tagId: id,
      });

      const operations: AnyBulkWriteOperation<models.TagSchema>[] = [
        ...bulkWriteOps,
        {
          updateOne: {
            filter: { _id: objectId(id) },
            update: {
              ...updates,
              dateModified,
              ...(childIds !== undefined ? { childIds } : {}),
              ...(parentIds !== undefined ? { parentIds } : {}),
            },
          },
        },
      ].filter(Boolean);

      const res = await models.TagModel.bulkWrite(normalizeMediaPathWrites("Tag", operations), {
        ...metadataWriteOptions(),
        session: getBackgroundSession(),
      });

      if (withSub) await emitTagUpdates(id, changedChildIds, changedParentIds);

      if (changedTagIds.length > 0 && withRegen) {
        const queued = await regenTags({
          tagIds: changedTagIds,
          withDescendantMetadata: false,
          withSub,
        });

        if (!queued.success) throw new Error(queued.error);
      }

      return { changedChildIds, changedParentIds, dateModified, operations, res };
    },
  ),
);

export const editMultiTagRelations = makeAction(
  registerMetadataWork(
    "editMultiTagRelations",
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

      const tags = (
        await models.TagModel.find({ _id: { $in: objectIds(args.tagIds) } }).lean()
      ).map(leanModelToJson<models.TagSchema>);

      if (tags.length !== new Set(args.tagIds).size)
        throw new Error("A selected tag no longer exists.");

      await assertTagRelationships(
        tags.map((tag) => ({
          childIds: [...new Set([...tag.childIds.map(String), ...changedChildIds.added])].filter(
            (id) => !changedChildIds.removed.includes(id),
          ),
          id: tag.id,
          parentIds: [...new Set([...tag.parentIds.map(String), ...changedParentIds.added])].filter(
            (id) => !changedParentIds.removed.includes(id),
          ),
        })),
      );

      const bulkWriteOps = tags.flatMap((tag) => {
        const operations = makeRelationsUpdateOps({
          changedChildIds,
          changedParentIds,
          dateModified,
          tagId: tag.id,
        });

        if (changedChildIds.added.length || changedParentIds.added.length)
          operations.push({
            updateOne: {
              filter: { _id: objectId(tag.id) },
              update: {
                $addToSet: {
                  childIds: { $each: changedChildIds.added },
                  parentIds: { $each: changedParentIds.added },
                },
                $set: { dateModified },
              },
            },
          });

        if (changedChildIds.removed.length || changedParentIds.removed.length)
          operations.push({
            updateOne: {
              filter: { _id: objectId(tag.id) },
              update: {
                $pullAll: {
                  childIds: changedChildIds.removed,
                  parentIds: changedParentIds.removed,
                },
                $set: { dateModified },
              },
            },
          });

        return operations;
      });

      const bulkWriteRes = await models.TagModel.bulkWrite(
        normalizeMediaPathWrites("Tag", bulkWriteOps),
        {
          session: getBackgroundSession(),
        },
      );

      const queued = await regenTags({
        tagIds: changedTagIds,
        withDescendantMetadata: false,
        withSub: true,
      });

      if (!queued.success) throw new Error(queued.error);

      await emitTagUpdates(args.tagIds, changedChildIds, changedParentIds);

      return { bulkWriteRes, changedChildIds, changedParentIds, dateModified };
    },
  ),
);

export const getTagWithRelations = makeAction(async ({ id }: { id: string }) => {
  const tag = leanModelToJson(await models.TagModel.findById(id).lean());

  if (!tag)
    throw new Error("This tag no longer exists. Close the editor and refresh the tag list.");

  const relationTags: models.TagSchema[][] = [];

  for (const tagIds of [tag.childIds, tag.parentIds])
    relationTags.push(
      tagIds?.length
        ? (await models.TagModel.find({ _id: { $in: objectIds(tagIds) } }).lean()).map((item) =>
            leanModelToJson<models.TagSchema>(item),
          )
        : [],
    );

  const [childTags, parentTags] = relationTags;
  const derivedRelationTags = await deriveTagCategories([...childTags, ...parentTags]);
  const derivedRelationTagMap = new Map(derivedRelationTags.map((tag) => [tag.id, tag]));

  return {
    childTags: childTags.map((childTag) => derivedRelationTagMap.get(childTag.id) ?? childTag),
    parentTags: parentTags.map((parentTag) => derivedRelationTagMap.get(parentTag.id) ?? parentTag),
    tag,
  };
});

export const listRegExMaps = makeAction(async () => {
  const tags = await models.TagModel.find({
    $and: [{ regEx: { $exists: true } }, { regEx: { $ne: null } }, { regEx: { $ne: "" } }],
  }).select({ _id: 1, regEx: 1 });

  return tags.map((t) => ({ id: t._id.toString(), regEx: t.regEx }));
});

/** Import label matching needs one compact directory, not repeated case-insensitive scans. */
export const listImportTags = makeAction(async ({ ids }: { ids?: string[] }) => {
  const tags = (
    await models.TagModel.find(ids ? { _id: { $in: objectIds(ids) } } : {})
      .select(
        ids
          ? { aliases: 1, ancestorIds: 1, category: 1, count: 1, label: 1, parentIds: 1, regEx: 1 }
          : { count: 1, label: 1 },
      )
      .lean()
  ).map((tag) => leanModelToJson<models.TagSchema>(tag));

  return ids ? deriveTagCategories(tags) : tags;
});

export const listTagAncestry = makeAction(async ({ ids }: { ids: string[] }) => {
  if (!ids.length) return [];

  const relatedIds = await deriveAncestorTagIds(ids);
  const tags = await models.TagModel.find({ _id: { $in: objectIds(relatedIds) } })
    .select({ category: 1, count: 1, label: 1, parentIds: 1 })
    .lean();

  return tags.map((tag) =>
    leanModelToJson<Pick<models.TagSchema, "category" | "count" | "id" | "label" | "parentIds">>(
      tag,
    ),
  );
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

export const listTagCategories = makeAction(async () => {
  const tags = await models.TagModel.find({}).select({ category: 1, parentIds: 1 }).lean();

  return tags.map((tag) => leanModelToJson<TagCategorySource>(tag));
});

export const listTag = makeAction(async (args: Types._ListTagInput) => {
  const result = await actions._listTag({ args });

  if (!result.success) throw new Error(result.error);

  return deriveTagCategories(result.data.items);
});

const mergeTagAliases = ({
  aliases,
  label,
  tagToKeep,
  tagToMerge,
}: {
  aliases: string[];
  label: string;
  tagToKeep: Pick<models.TagSchema, "aliases" | "label">;
  tagToMerge: Pick<models.TagSchema, "aliases" | "label">;
}) => {
  const seen = new Set([label.trim().toLowerCase()]);

  const values = [
    ...aliases,
    ...(tagToKeep.aliases ?? []),
    ...(tagToMerge.aliases ?? []),
    tagToKeep.label,
    tagToMerge.label,
  ];

  return values.reduce<string[]>((acc, value) => {
    const alias = value?.trim();
    const normalized = alias?.toLowerCase();

    if (!alias || seen.has(normalized)) return acc;

    seen.add(normalized);
    acc.push(alias);

    return acc;
  }, []);
};

export const mergeTags = makeAction(
  registerMetadataWork(
    "mergeTags",
    async (
      args: Omit<
        Required<Types.CreateTagInput>,
        | "ancestorIds"
        | "category"
        | "count"
        | "dateCreated"
        | "dateModified"
        | "dateOfInception"
        | "descendantIds"
        | "lastSearchedAt"
        | "rating"
        | "ratingIsManual"
        | "size"
        | "thumb"
      > & {
        cleanNames?: boolean;
        tagIdToKeep: string;
        tagIdToMerge: string;
      },
    ) => {
      try {
        await assertImportEntriesReady();

        const _tagIdToKeep = objectId(args.tagIdToKeep);
        const _tagIdToMerge = objectId(args.tagIdToMerge);

        if (_tagIdToKeep.equals(_tagIdToMerge)) throw new Error("Cannot merge a tag into itself");

        const dateModified = dayjs().toISOString();

        const tagsBeingMerged = await readMetadataSnapshot(
          `mergeTags:${args.tagIdToKeep}:${args.tagIdToMerge}`,
          () =>
            models.TagModel.find({
              _id: { $in: [_tagIdToKeep, _tagIdToMerge] },
            })
              .select({
                aliases: 1,
                label: 1,
                rating: 1,
                ratingIsManual: 1,
              })
              .lean(),
        );

        const tagToKeep = tagsBeingMerged.find((t) => t._id.equals(_tagIdToKeep));
        const tagToMerge = tagsBeingMerged.find((t) => t._id.equals(_tagIdToMerge));

        if (!tagToKeep || !tagToMerge) throw new Error("Tag not found");

        if ([...args.childIds, ...args.parentIds].includes(args.tagIdToMerge))
          throw new Error("The removed tag cannot be a relationship of the merged tag.");

        await assertTagRelationships(
          [{ childIds: args.childIds, id: args.tagIdToKeep, parentIds: args.parentIds }],
          [args.tagIdToMerge],
        );

        const ratingSource =
          [tagToKeep, tagToMerge].find(({ ratingIsManual }) => ratingIsManual) ??
          [tagToKeep, tagToMerge].find(({ rating }) => rating > 0);

        type Collections =
          | models.FileSchema
          | models.FileImportBatchSchema
          | models.FileCollectionSchema;

        const updateManyAddToSet: UpdateQuery<Collections> = {
          $addToSet: { tagIds: _tagIdToKeep },
        };

        const updateManyFilter: FilterQuery<Collections> = { tagIds: _tagIdToMerge };
        const updateManyPull: UpdateQuery<Collections> = { $pull: { tagIds: _tagIdToMerge } };

        await models.FileCollectionModel.updateMany(updateManyFilter, {
          ...updateManyAddToSet,
          $inc: { __v: 1 },
        });

        await models.FileImportBatchModel.updateMany(updateManyFilter, updateManyAddToSet);
        await models.FileImportModel.updateMany(updateManyFilter, updateManyAddToSet);
        await models.FileModel.updateMany(updateManyFilter, updateManyAddToSet);

        await models.FileCollectionModel.updateMany(updateManyFilter, {
          ...updateManyPull,
          $inc: { __v: 1 },
        });

        await models.FileImportBatchModel.updateMany(updateManyFilter, updateManyPull);
        await models.FileImportModel.updateMany(updateManyFilter, updateManyPull);
        await models.FileModel.updateMany(updateManyFilter, updateManyPull);

        const relationsFilter: FilterQuery<models.TagSchema> = {
          $or: [{ childIds: _tagIdToMerge }, { parentIds: _tagIdToMerge }],
        };

        const tagIdsToUpdate = await readMetadataSnapshot(
          `mergeTagRelations:${args.tagIdToKeep}:${args.tagIdToMerge}`,
          async () =>
            (await models.TagModel.find(relationsFilter, { _id: 1 }).lean()).map((tag) =>
              tag._id.toString(),
            ),
        );

        const tagToKeepUpdates = {
          aliases: mergeTagAliases({
            aliases: args.aliases,
            label: args.label,
            tagToKeep,
            tagToMerge,
          }),
          childIds: args.childIds,
          dateModified,
          label: args.label,
          parentIds: args.parentIds,
          rating: ratingSource?.rating ?? 0,
          ratingIsManual: ratingSource?.ratingIsManual ?? false,
          regEx: args.regEx,
        };

        if (args.cleanNames)
          tagToKeepUpdates.aliases = [
            ...new Set(tagToKeepUpdates.aliases.map(cleanTagName)),
          ].filter((alias) => alias && alias !== args.label);

        const { label, ...metadataUpdates } = tagToKeepUpdates;

        await models.TagModel.bulkWrite(
          normalizeMediaPathWrites("Tag", [
            {
              updateMany: {
                filter: relationsFilter,
                update: { $pull: { childIds: args.tagIdToMerge, parentIds: args.tagIdToMerge } },
              },
            },
            ...makeRelationsUpdateOps({
              changedChildIds: {
                added: args.childIds,
                removed: await getOrphanedIds(args.tagIdToKeep, "parentIds", args.childIds),
              },
              changedParentIds: {
                added: args.parentIds,
                removed: await getOrphanedIds(args.tagIdToKeep, "childIds", args.parentIds),
              },
              dateModified,
              tagId: args.tagIdToKeep,
            }),
            { updateOne: { filter: { _id: _tagIdToKeep }, update: { $set: metadataUpdates } } },
          ]),
          { ...metadataWriteOptions(), session: getBackgroundSession() },
        );

        // Transfer metadata and references before freeing the unique label. Saved snapshots allow retry.
        await models.TagModel.deleteOne({ _id: _tagIdToMerge }, metadataWriteOptions());
        await models.TagModel.updateOne(
          { _id: _tagIdToKeep },
          { $set: { label } },
          metadataWriteOptions(),
        );

        if (args.withRegen) {
          const queued = await regenTags({
            tagIds: [args.tagIdToKeep, ...tagIdsToUpdate],
            withDescendantMetadata: false,
            withSub: false,
          });

          if (!queued.success) throw new Error(queued.error);
        }

        if (args.withSub) {
          socket.emit("onTagMerged", { newTagId: args.tagIdToKeep, oldTagId: args.tagIdToMerge });

          socket.emit("onTagsUpdated", {
            tags: [{ tagId: args.tagIdToKeep, updates: tagToKeepUpdates }],
            withFileReload: true,
          });
        }
      } catch (err) {
        fileLog(err.stack, { type: "error" });

        throw err;
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
      }
    },
    true,
  ),
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
    const searchTerms = searchStr.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const input = searchTerms.join(" ");

    const ranked = (
      await models.TagModel.aggregate([
        {
          $match: {
            label: { $exists: true, $ne: "" },
            ...(excludedIds.length || includedIds.length
              ? {
                  _id: {
                    ...(excludedIds.length ? { $nin: objectIds(excludedIds) } : {}),
                    ...(includedIds.length ? { $in: objectIds(includedIds) } : {}),
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
          },
        },
        {
          $set: {
            _searchValues: {
              $concatArrays: [
                [{ $toLower: { $ifNull: ["$label", ""] } }],
                {
                  $map: {
                    as: "alias",
                    in: { $toLower: "$$alias" },
                    input: { $ifNull: ["$aliases", []] },
                  },
                },
              ],
            },
          },
        },
        {
          $set: {
            _searchScore: {
              $switch: {
                branches: [
                  { case: { $in: [input, "$_searchValues"] }, then: 100 },
                  {
                    case: {
                      $allElementsTrue: [
                        searchTerms.map((term) => ({
                          $anyElementTrue: [
                            {
                              $map: {
                                as: "value",
                                in: {
                                  $regexMatch: {
                                    input: "$$value",
                                    regex: `(^|[\\s_.-])${Fmt.regexEscape(term)}`,
                                  },
                                },
                                input: "$_searchValues",
                              },
                            },
                          ],
                        })),
                      ],
                    },
                    then: 50,
                  },
                  {
                    case: {
                      $anyElementTrue: [
                        {
                          $map: {
                            as: "value",
                            in: { $gte: [{ $indexOfCP: ["$$value", input] }, 0] },
                            input: "$_searchValues",
                          },
                        },
                      ],
                    },
                    then: 25,
                  },
                ],
                default: 10,
              },
            },
          },
        },
        { $sort: { _searchScore: -1, lastSearchedAt: -1, count: -1 } },
        { $limit: 50 },
        { $project: { _searchScore: 0, _searchValues: 0 } },
      ]).allowDiskUse(true)
    ).map((tag) => leanModelToJson<models.TagSchema>(tag));

    return await deriveTagCategories(ranked);
  },
);

export const refreshTag = makeAction(
  registerMetadataWork(
    "refreshTag",
    async ({
      tagId,
      tagIds,
      withSub = true,
    }: {
      tagId?: string;
      tagIds?: string[];
      withSub?: boolean;
    }) => {
      if (tagIds) {
        await actions.queueBackgroundOperation({
          label: "Tag refresh",
          targetIds: tagIds,
          type: "tagRefresh",
        });

        runTagRegenQueue();

        return;
      }

      if (!tagId) throw new Error("Select a tag to refresh");

      const debug = false;

      const tag = await models.TagModel.findById(tagId);

      if (!tag) throw new Error(`Tag not found: ${tagId}`);

      const [ancestorIds, childIds, descendantIds, parentIds] = [
        tag.ancestorIds,
        tag.childIds,
        tag.descendantIds,
        tag.parentIds,
      ].map((ids) => ids?.map((i) => i.toString()) ?? []);

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

      const idsWithOrphanedAncestor = await getOrphanedIds(tagId, "ancestorIds", descendantIds);
      const idsWithOrphanedChild = await getOrphanedIds(tagId, "childIds", parentIds);
      const idsWithOrphanedDescendant = await getOrphanedIds(tagId, "descendantIds", ancestorIds);
      const idsWithOrphanedParent = await getOrphanedIds(tagId, "parentIds", childIds);

      if (debug) perfLog("Derived orphaned ids");

      const changedAncestorIds = { added: idsWithOrphanedDescendant, removed: [] };
      const changedChildIds = { added: idsWithOrphanedParent, removed: [] };
      const changedDescendantIds = { added: idsWithOrphanedAncestor, removed: [] };
      const changedParentIds = { added: idsWithOrphanedChild, removed: [] };

      const bulkWriteOps = makeRelationsUpdateOps({
        changedAncestorIds,
        changedChildIds,
        changedDescendantIds,
        changedParentIds,
        dateModified,
        tagId,
      });

      if (debug) perfLog("Derived bulkWriteOps");

      await models.TagModel.bulkWrite(normalizeMediaPathWrites("Tag", bulkWriteOps), {
        session: getBackgroundSession(),
      });

      if (debug) perfLog("Bulk write operations executed");

      const queued = await regenTags({
        tagIds: [
          tagId,
          ...idsWithOrphanedAncestor,
          ...idsWithOrphanedChild,
          ...idsWithOrphanedDescendant,
          ...idsWithOrphanedParent,
        ],
        withSub,
      });

      if (!queued.success) throw new Error(queued.error);

      if (withSub) await emitTagUpdates(tagId, changedChildIds, changedParentIds);

      if (debug) perfLogTotal("Refreshed tag relations");
    },
  ),
);

export const regenTags = makeAction(
  registerMetadataWork(
    "regenTags",
    async (args: { tagIds: string[]; withDescendantMetadata?: boolean; withSub?: boolean }) => {
      if (!args.tagIds.length) return;

      const tagIds = [
        ...new Set([
          ...args.tagIds,
          ...(await deriveDescendantTagIds(args.tagIds)),
          ...(await deriveAncestorTagIds(args.tagIds)),
        ]),
      ];

      await actions.queueBackgroundOperation({
        label: "Tag hierarchy regeneration",
        targetIds: tagIds,
        type: "tagHierarchy",
      });

      await queueTagMetadataRegen(args.withDescendantMetadata === false ? args.tagIds : tagIds);

      if (args.withDescendantMetadata === false && args.withSub !== false)
        socket.emit("onTagsUpdated", {
          tags: tagIds.map((tagId) => ({ tagId, updates: {} })),
          withFileReload: true,
        });

      runTagRegenQueue();
    },
  ),
);

export const regenTagAncestors = makeAction(
  async ({ tagIds, withSub = false }: { tagIds: string[]; withSub?: boolean }) => {
    if (!tagIds.length) return [];

    const ancestors = new Map(
      (await getRelatedTags(tagIds, false)).map((tag) => [
        String(tag._id),
        tag.related.map(String),
      ]),
    );

    const descendants = new Map(
      (await getRelatedTags(tagIds, true)).map((tag) => [String(tag._id), tag.related.map(String)]),
    );

    const updates = [...new Set(tagIds)].map((tagId) => ({
      tagId,
      updates: {
        ancestorIds: ancestors.get(tagId) ?? [],
        descendantIds: descendants.get(tagId) ?? [],
      },
    }));

    await models.TagModel.bulkWrite(
      normalizeMediaPathWrites(
        "Tag",
        updates.map(({ tagId, updates }) => ({
          updateOne: {
            filter: { _id: objectId(tagId) },
            update: { $set: updates },
          },
        })),
      ),
      { ...metadataWriteOptions(), session: getBackgroundSession() },
    );

    if (withSub) socket.emit("onTagsUpdated", { tags: updates, withFileReload: true });

    return updates;
  },
);

export const regenTagMeta = makeAction(
  async ({ tagIds, withSub = true }: { tagIds: string[]; withSub?: boolean }) => {
    const updates: { tagId: string; updates: Partial<models.TagSchema> }[] = [];

    const snapshot = await readTagMetadata([...new Set(tagIds.map(String))]);

    for (const tags of chunkArray(snapshot.tags, 100))
      updates.push(...(await writeTagMetadata({ ...snapshot, tags }, withSub)));

    return updates;
  },
);

const cleanTagName = (name: string) =>
  Fmt.titleCase(name.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase());

const repairTagNames = (
  tag: Pick<models.TagSchema, "aliases" | "label">,
  decodeLabels = false,
  cleanNames = false,
) => [
  ...new Set(
    [tag.label, ...(tag.aliases ?? [])]
      .map((name) => {
        const decoded = decodeLabels ? Fmt.decodeHtmlEntities(name) : name;

        return (cleanNames ? cleanTagName(decoded) : decoded.trim()).toLowerCase();
      })
      .filter(Boolean),
  ),
];

const mergeRepairTags = (
  retainedId: string,
  duplicateId: string,
  decodeLabels = false,
  cleanNames = false,
) =>
  (async () => {
    const current = await models.TagModel.findById(retainedId).lean();
    const duplicate = await models.TagModel.findById(duplicateId).lean();

    if (!current || !duplicate)
      throw new Error("Duplicate tags changed during repair; retry repair");

    const label = cleanNames
      ? cleanTagName(current.label)
      : decodeLabels
        ? Fmt.decodeHtmlEntities(current.label)
        : current.label;

    const names = new Set(repairTagNames(current, decodeLabels, cleanNames));

    if (!repairTagNames(duplicate, decodeLabels, cleanNames).some((name) => names.has(name)))
      throw new Error("Duplicate tag labels or aliases changed during repair; retry repair");

    const result = await mergeTags({
      aliases: current.aliases ?? [],
      cleanNames,
      childIds: [...new Set([...current.childIds, ...duplicate.childIds].map(String))].filter(
        (id) => id !== retainedId && id !== duplicateId,
      ),
      label,
      parentIds: [...new Set([...current.parentIds, ...duplicate.parentIds].map(String))].filter(
        (id) => id !== retainedId && id !== duplicateId,
      ),
      regEx: current.regEx,
      tagIdToKeep: retainedId,
      tagIdToMerge: duplicateId,
      withRegen: true,
      withSub: true,
    });

    if (!result.success) throw new Error(result.error);

    return result;
  })();

export const repairTags = makeAction(
  async ({
    cleanNames = false,
    decodeLabels = true,
    mergeDuplicateLabels = true,
    regenerateMetadata = true,
    repairHierarchy = true,
    repairId,
  }: {
    cleanNames?: boolean;
    decodeLabels?: boolean;
    mergeDuplicateLabels?: boolean;
    regenerateMetadata?: boolean;
    repairHierarchy?: boolean;
    repairId: string;
  }) => {
    const { perfLog } = makePerfLog("[repairTags]", true);
    const { checkCancelled, progress, report, run } = makeRepairReporter(repairId, "repairTags");

    return run(async () => {
      let processedCount = 0;
      const totalCount = await models.TagModel.countDocuments();
      let mergedCount = 0;
      let regeneratedMetadataCount = 0;
      let repairedDerivedHierarchyCount = 0;
      const tagsWithRepairedDirectRelations = new Set<string>();

      if (decodeLabels) {
        report("Decoding tag labels.");
        progress("Tag repair: decoding labels.");

        await repairMetadata(
          models.TagModel.find({
            label: { $regex: Fmt.htmlEntityRegex },
          })
            .select({ _id: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor(),
          async (candidate) => {
            checkCancelled();

            const tag = await models.TagModel.findById(candidate._id).select({ label: 1 }).lean();

            if (!tag) return;

            const label = Fmt.decodeHtmlEntities(tag.label);

            if (label === tag.label) return;

            const existing = await models.TagModel.findOne({ _id: { $ne: tag._id }, label })
              .select({ _id: 1 })
              .lean();

            if (existing) {
              if (!mergeDuplicateLabels && !cleanNames)
                throw new Error(
                  "Decoded label already exists; enable duplicate label merging to repair it",
                );

              const result = await mergeRepairTags(String(existing._id), String(tag._id), true);

              if (!result.success) throw new Error(result.error);

              checkCancelled();

              return true;
            }

            await models.TagModel.updateOne({ _id: tag._id }, { $set: { label } });

            socket.emit("onTagsUpdated", {
              tags: [{ tagId: String(tag._id), updates: { label } }],
              withFileReload: false,
            });

            checkCancelled();
          },
          async ({ result: merged }) => {
            checkCancelled();

            if (merged) mergedCount++;
          },
        );

        report("HTML entity repair completed.", "progress");
      }

      if (cleanNames) {
        report("Cleaning tag labels and aliases.");
        processedCount = 0;
        progress(`Tag repair: cleaning names, 0 / ${totalCount} tags.`);

        await repairMetadata(
          models.TagModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean().cursor(),
          async (candidate) => {
            checkCancelled();

            const tag = await models.TagModel.findById(candidate._id)
              .select({ aliases: 1, label: 1 })
              .lean();

            if (!tag) return false;

            const label = cleanTagName(tag.label);

            if (!label) throw new Error(`Tag ${tag._id} has an empty label after cleanup`);

            const aliases = [...new Set((tag.aliases ?? []).map(cleanTagName))].filter(
              (alias) => alias && alias !== label,
            );

            const existing = await models.TagModel.findOne({ _id: { $ne: tag._id }, label })
              .select({ _id: 1 })
              .lean();

            if (existing) {
              const result = await mergeRepairTags(
                String(existing._id),
                String(tag._id),
                false,
                true,
              );

              if (!result.success) throw new Error(result.error);

              return true;
            }

            if (label !== tag.label || !isDeepEqual(aliases, tag.aliases)) {
              await models.TagModel.updateOne({ _id: tag._id }, { $set: { aliases, label } });
              socket.emit("onTagsUpdated", {
                tags: [{ tagId: String(tag._id), updates: { aliases, label } }],
                withFileReload: false,
              });
            }

            checkCancelled();

            return false;
          },
          async ({ result: merged }) => {
            checkCancelled();

            if (merged) mergedCount++;

            progress(
              `Tag repair: cleaning names, ${++processedCount} / ${totalCount} tags scanned.`,
            );
          },
        );

        report("Tag name cleanup completed.", "progress");
      }

      if (mergeDuplicateLabels || cleanNames) {
        report("Searching for overlapping tag labels and aliases.");
        progress("Tag repair: finding overlapping labels and aliases.");
        checkCancelled();

        for await (const group of models.TagModel.aggregate<{ _id: string }>([
          {
            $project: {
              names: {
                $setUnion: [
                  {
                    $map: {
                      input: { $concatArrays: [["$label"], { $ifNull: ["$aliases", []] }] },
                      as: "name",
                      in: { $toLower: { $trim: { input: "$$name" } } },
                    },
                  },
                  [],
                ],
              },
            },
          },
          { $unwind: "$names" },
          { $match: { names: { $ne: "" } } },
          { $group: { _id: "$names", count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $sort: { _id: 1 } },
        ])
          .allowDiskUse(true)
          .cursor({ batchSize: 100 })) {
          while (true) {
            checkCancelled();

            const matches = await models.TagModel.find({
              $or: [
                {
                  label: { $regex: "^\\s*" + Fmt.regexEscape(group._id) + "\\s*$", $options: "i" },
                },
                {
                  aliases: {
                    $regex: "^\\s*" + Fmt.regexEscape(group._id) + "\\s*$",
                    $options: "i",
                  },
                },
              ],
            })
              .select({ _id: 1 })
              .sort({ count: -1, _id: 1 })
              .limit(2)
              .lean();

            if (matches.length < 2) break;

            const merged = await mergeRepairTags(
              String(matches[0]._id),
              String(matches[1]._id),
              false,
              cleanNames,
            );

            if (!merged.success) throw new Error(merged.error);

            mergedCount++;
            progress(`Tag repair: merged ${mergedCount} duplicate tags.`);
            checkCancelled();

            if (mergedCount % 25 === 0) report(`Merged ${mergedCount} duplicate tags.`, "progress");
          }
        }

        perfLog(`Merged ${mergedCount} duplicate tags`);
      }

      if (repairHierarchy || mergedCount > 0) {
        report("Reconciling each tag with its current direct relationships.");
        processedCount = 0;
        progress(`Tag repair: reconciling hierarchy, 0 / ${totalCount - mergedCount} tags.`);

        await repairMetadata(
          models.TagModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean().cursor(),
          async (candidate) => {
            checkCancelled();

            const tag = await models.TagModel.findById(candidate._id)
              .setOptions({ storedHierarchy: true })
              .lean();

            if (!tag) return null;

            const related = await models.TagModel.find({
              _id: { $ne: tag._id },
              $or: [
                { _id: { $in: [...(tag.childIds ?? []), ...(tag.parentIds ?? [])] } },
                { childIds: tag._id },
                { parentIds: tag._id },
              ],
            })
              .select({ childIds: 1, parentIds: 1 })
              .lean();

            const childIds = related
              .filter(
                (item) =>
                  (tag.childIds ?? []).some((id) => String(id) === String(item._id)) ||
                  item.parentIds?.some((id) => String(id) === String(tag._id)),
              )
              .map(({ _id }) => String(_id))
              .sort();

            const parentIds = related
              .filter(
                (item) =>
                  (tag.parentIds ?? []).some((id) => String(id) === String(item._id)) ||
                  item.childIds?.some((id) => String(id) === String(tag._id)),
              )
              .map(({ _id }) => String(_id))
              .sort();

            const directChanged =
              [...(tag.childIds ?? [])].map(String).sort().join(",") !== childIds.join(",") ||
              [...(tag.parentIds ?? [])].map(String).sort().join(",") !== parentIds.join(",");

            if (directChanged) {
              const result = await editTag({
                childIds,
                id: String(tag._id),
                parentIds,
                withRegen: true,
                withSub: true,
              });

              if (!result.success) throw new Error(result.error);
            }

            const ancestorIds = await deriveAncestorTagIds([String(tag._id)]);
            const descendantIds = await deriveDescendantTagIds([String(tag._id)]);

            const derivedChanged =
              [...(tag.ancestorIds ?? [])].map(String).sort().join(",") !==
                [...ancestorIds].sort().join(",") ||
              [...(tag.descendantIds ?? [])].map(String).sort().join(",") !==
                [...descendantIds].sort().join(",");

            if (derivedChanged) {
              await models.TagModel.updateOne(
                { _id: tag._id },
                {
                  $set: {
                    ancestorIds: objectIds(ancestorIds),
                    descendantIds: objectIds(descendantIds),
                  },
                },
              );

              socket.emit("onTagsUpdated", {
                tags: [{ tagId: String(tag._id), updates: { ancestorIds, descendantIds } }],
                withFileReload: true,
              });
            }

            checkCancelled();

            return { derivedChanged, directChanged };
          },
          async ({ candidate, result: repaired }) => {
            checkCancelled();

            if (repaired?.directChanged) tagsWithRepairedDirectRelations.add(String(candidate._id));

            if (repaired?.derivedChanged) repairedDerivedHierarchyCount++;

            progress(
              `Tag repair: reconciling hierarchy, ${++processedCount} / ${totalCount - mergedCount} tags.`,
            );
          },
        );
      }

      if (regenerateMetadata || mergedCount > 0) {
        report("Scanning files once for all tag metadata.");
        checkCancelled();

        const tags = await models.TagModel.find({}).select({ _id: 1 }).lean();
        const snapshot = await readTagMetadata(
          tags.map((tag) => String(tag._id)),
          undefined,
          checkCancelled,
        );

        for (const batch of chunkArray(snapshot.tags, 100)) {
          checkCancelled();

          const updates = await writeTagMetadata({ ...snapshot, tags: batch }, true);
          regeneratedMetadataCount += updates.length;
          progress(
            `Tag repair: saving metadata, ${regeneratedMetadataCount} / ${tags.length} tags.`,
          );
        }

        perfLog("Regenerated tag metadata");
      }

      report(
        `Tag repair completed successfully: merged ${mergedCount} duplicates, repaired ${tagsWithRepairedDirectRelations.size} direct relationships, repaired ${repairedDerivedHierarchyCount} derived hierarchies, and regenerated metadata for ${regeneratedMetadataCount} tags.`,
        "success",
      );

      return {
        mergedCount,
        repairedDerivedHierarchyCount,
        repairedDirectRelationshipCount: tagsWithRepairedDirectRelations.size,
        regeneratedMetadataCount,
      };
    });
  },
);

export const setTagCount = makeAction(async ({ count, id }: { count: number; id: string }) => {
  const dateModified = dayjs().toISOString();

  return models.TagModel.updateOne({ _id: id }, { $set: { count }, dateModified });
});

export const upsertTag = makeAction(
  async ({
    aliases,
    category,
    label,
    parentLabels,
    regEx,
    withRegEx = false,
  }: {
    aliases?: string[];
    category?: models.TagSchema["category"];
    label: string;
    parentLabels?: string[];
    regEx?: string;
    withRegEx?: boolean;
  }) => {
    const parentIds: string[] = [];

    for (const label of parentLabels ?? []) {
      const parent = await upsertTag({ label });

      if (!parent.success) throw new Error(parent.error);

      parentIds.push(parent.data.id);
    }

    const tag = await models.TagModel.findOne({
      label: new RegExp(`^${Fmt.regexEscape(label)}$`, "i"),
    }).sort({ label: 1 });

    const tagId = tag?._id?.toString();

    if (tagId) {
      label = preferredTagLabel(tag.label, label);

      const existingParentIds = new Set(tag?.parentIds.map(String));
      const missingParentIds = parentIds.filter((id) => !existingParentIds.has(id));

      if (missingParentIds.length || category !== undefined || label !== tag.label) {
        const res = await editTag({
          ...(category !== undefined ? { category } : {}),
          id: tagId,
          label,
          parentIds: [...existingParentIds, ...missingParentIds],
          withSub: false,
        });

        if (!res.success) throw new Error(res.error);
      }

      return { id: tagId, label, parentIds };
    }

    const res = await createTag({
      aliases: aliases?.length ? aliases : [],
      category,
      label,
      parentIds,
      regEx: regEx ?? (withRegEx ? tagsToRegEx([{ aliases, label }]) : null),
      withSub: false,
    });

    if (!res.success) throw new Error(res.error);

    return { id: res.data.id, label: res.data.label, parentIds };
  },
);

/** Resolve shared parents once and regenerate only relationships changed by this batch. */
export const upsertImportTags = makeAction(
  registerMetadataWork("upsertImportTags", async (tags: Parameters<typeof upsertTag>[0][]) => {
    tags = mergeTagDefinitions(tags);

    const labels = mergeTagDefinitions(
      tags.flatMap((tag) => [tag.label, ...(tag.parentLabels ?? [])]).map((label) => ({ label })),
    ).map((tag) => tag.label);

    const existing = await readMetadataSnapshot("upsertImportTags:existing", async () =>
      (
        await models.TagModel.find({
          label: { $in: labels.map((label) => new RegExp(`^${Fmt.regexEscape(label)}$`, "i")) },
        })
          .select({ category: 1, label: 1, parentIds: 1 })
          .lean()
      ).map((tag) => leanModelToJson<models.TagSchema>(tag)),
    );

    const byLabel = new Map<string, models.TagSchema>();

    for (const tag of existing) {
      const key = tag.label.toLowerCase();
      const previous = byLabel.get(key);

      if (!previous || preferredTagLabel(previous.label, tag.label) === tag.label)
        byLabel.set(key, tag);
    }

    const definitions = new Map(tags.map((tag) => [tag.label.toLowerCase(), tag]));
    const changedIds = new Set<string>();
    let modified = false;
    const results: { id: string; label: string; parentIds: string[] }[] = [];

    const categoryValues = (category: models.TagSchema["category"]) => ({
      color: category?.color ?? null,
      icon: category?.icon ?? null,
      inheritable: category?.inheritable ?? false,
      sortRank: category?.sortRank ?? null,
    });

    // Create missing labels before linking them, including parents shared by several tags.
    for (const label of labels) {
      const key = label.toLowerCase();
      const existingTag = byLabel.get(key);

      if (existingTag) {
        const preferred = preferredTagLabel(existingTag.label, label);

        if (preferred !== existingTag.label) {
          const edited = await editTag({
            id: existingTag.id,
            label: preferred,
            withRegen: false,
            withSub: false,
          });

          if (!edited.success) throw new Error(edited.error);

          existingTag.label = preferred;
          modified = true;
        }

        continue;
      }

      const definition = definitions.get(key);

      const created = await createTag({
        aliases: definition?.aliases ?? [],
        category: definition?.category,
        label,
        regEx: definition?.regEx ?? (definition?.withRegEx ? tagsToRegEx([definition]) : null),
        withRegen: false,
        withSub: true,
      });

      if (!created.success) throw new Error(created.error);

      byLabel.set(key, created.data);
    }

    for (const definition of tags) {
      const tag = byLabel.get(definition.label.toLowerCase());
      const parentIds = new Set(tag.parentIds ?? []);

      const addedParentIds = (definition.parentLabels ?? [])
        .map((label) => byLabel.get(label.toLowerCase()).id)
        .filter((id) => id !== tag.id && !parentIds.has(id));

      for (const id of addedParentIds) parentIds.add(id);

      const categoryChanged =
        definition.category !== undefined &&
        !isDeepEqual(categoryValues(definition.category), categoryValues(tag.category));

      if (addedParentIds.length || categoryChanged) {
        const edited = await editTag({
          ...(categoryChanged ? { category: definition.category } : {}),
          id: tag.id,
          parentIds: [...parentIds],
          withRegen: false,
          withSub: false,
        });

        if (!edited.success) throw new Error(edited.error);

        modified = true;

        if (addedParentIds.length) {
          changedIds.add(tag.id);

          for (const id of addedParentIds) changedIds.add(id);
        }
      }

      tag.parentIds = [...parentIds];
      results.push({ id: tag.id, label: tag.label, parentIds: tag.parentIds });
    }

    if (changedIds.size) {
      const queued = await regenTags({
        tagIds: [...changedIds],
        withDescendantMetadata: false,
        withSub: true,
      });

      if (!queued.success) throw new Error(queued.error);
    }

    if (modified) socket.emit("onReloadTags");

    return results;
  }),
);
