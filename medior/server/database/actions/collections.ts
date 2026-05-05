import * as models from "medior/_generated/server/models";
import { FilterQuery } from "mongoose";
import * as actions from "medior/server/database/actions";
import { dayjs, PromiseQueue } from "medior/utils/common";
import {
  fileLog,
  leanModelToJson,
  makeAction,
  makePerfLog,
  objectIds,
  socket,
} from "medior/utils/server";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const dedupeFileIdIndexes = (fileIdIndexes: { fileId: string; index: number }[]) => {
  const seenFileIds = new Set<string>();
  return fileIdIndexes
    .filter(({ fileId }) => {
      if (!fileId) return false;
      const id = fileId.toString();
      if (seenFileIds.has(id)) return false;
      seenFileIds.add(id);
      return true;
    })
    .sort((a, b) => a.index - b.index)
    .map((entry, index) => ({ ...entry, index }));
};

const makeCollAttrs = async (
  files: models.FileSchema[],
  fileIdIndexes: { fileId: string; index: number }[],
): Promise<{
  fileCount: number;
  rating: number;
  size: number;
  tagIds: string[];
  tagIdsWithAncestors: string[];
}> => {
  const indexMap = new Map(fileIdIndexes.map((f) => [f.fileId, f.index]));
  const sortedFiles = [...files].sort((a, b) => indexMap.get(a.id) - indexMap.get(b.id));
  const ratedFiles = sortedFiles.filter((f) => f.rating > 0);
  const tagIds = [
    ...new Set([...sortedFiles.map((f) => f.tagIds.map((id) => id.toString())).flat()]),
  ];

  return {
    fileCount: sortedFiles.length,
    rating:
      ratedFiles.length > 0
        ? ratedFiles.reduce((acc, f) => acc + f.rating, 0) / ratedFiles.length
        : 0,
    size: sortedFiles.reduce((acc, f) => acc + f.size, 0),
    tagIds,
    tagIdsWithAncestors: await actions.deriveAncestorTagIds(tagIds),
  };
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const addFilesToCollection = makeAction(
  async (args: { collId: string; fileIds: string[] }) => {
    const collRes = await models.FileCollectionModel.findById(args.collId).lean();
    if (!collRes) throw new Error("Collection not found");

    const existingFileIds = collRes.fileIdIndexes.map((f) => f.fileId);
    const fileIdsToAdd = args.fileIds.filter((id) => !existingFileIds.includes(id));

    const newFileIdIndexes = [...new Set([...fileIdsToAdd, ...existingFileIds])].map(
      (fileId, index) => ({ fileId, index }),
    );

    const updateRes = await updateCollection({ id: args.collId, fileIdIndexes: newFileIdIndexes });
    if (!updateRes.success) throw new Error(updateRes.error);
    return updateRes.data;
  },
);

export const createCollection = makeAction(
  async (args: {
    fileIdIndexes: { fileId: string; index: number }[];
    title: string;
    withSub?: boolean;
  }) => {
    const deduped = dedupeFileIdIndexes(args.fileIdIndexes);
    const filesRes = await actions.listFile({
      args: { filter: { id: deduped.map((f) => f.fileId) } },
    });
    if (!filesRes.success) throw new Error(filesRes.error);
    if (filesRes.data.items?.length !== deduped.length) {
      fileLog({ deduped, resFileIds: filesRes.data.items.map((f) => f.id) });
      throw new Error(`Some files not found (${deduped.length} != ${filesRes.data.items?.length})`);
    }

    const dateCreated = dayjs().toISOString();
    const collection = {
      ...(await makeCollAttrs(filesRes.data.items, args.fileIdIndexes)),
      dateCreated,
      dateModified: dateCreated,
      fileIdIndexes: args.fileIdIndexes,
      title: args.title,
    };

    const res = await models.FileCollectionModel.create(collection);
    if (args.withSub) socket.emit("onFileCollectionCreated", res);
    return { ...collection, id: res._id.toString() };
  },
);

export const deleteCollections = makeAction(async (args: { ids: string[] }) => {
  const res = await models.FileCollectionModel.deleteMany({ _id: { $in: objectIds(args.ids) } });
  if (res.deletedCount) socket.emit("onFileCollectionsDeleted", args);
  return res;
});

export const listAllCollectionIds = makeAction(async () => {
  return (await models.FileCollectionModel.find().select({ _id: 1 }).lean()).map((c) =>
    c._id.toString(),
  );
});

export const listCollectionsByFileIds = makeAction(async (args: { fileIds: string[] }) => {
  const collections = (
    await models.FileCollectionModel.find({
      fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } },
    }).lean()
  ).map((f) => leanModelToJson<models.FileCollectionSchema>(f));

  const tagIds = [...new Set(collections.flatMap((c) => c.tagIds.map((id) => id.toString())))];
  const res = await actions.listTag({ filter: { id: tagIds } });
  if (!res.success) throw new Error(res.error);

  const tagsMap = new Map(res.data.map((t) => [t.id, t]));

  return collections.map((c) => ({
    ...c,
    tags: c.tagIds.map((id) => tagsMap.get(id.toString())).filter(Boolean),
  }));
});

export const listCollectionIdsByTagIds = makeAction(async (args: { tagIds: string[] }) => {
  return (
    await models.FileCollectionModel.find({ tagIds: { $in: objectIds(args.tagIds) } })
      .select({ _id: 1 })
      .lean()
  ).map((f) => f._id.toString());
});

export const regenCollAttrs = makeAction(
  async (
    args: {
      collFilter?: FilterQuery<models.FileCollectionSchema>;
      collIds?: string[];
      fileIds?: string[];
    } = {},
  ) => {
    const { perfLog, perfLogTotal } = makePerfLog("[regenCollAttrs]");

    const collections = (
      await models.FileCollectionModel.find(
        {
          ...(args.collFilter ??
            (args.collIds?.length
              ? { _id: { $in: objectIds(args.collIds) } }
              : args.fileIds?.length
                ? { fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } } }
                : {})),
        },
        null,
        { strict: false },
      )
        .select({ _id: 1, fileIdIndexes: 1 })
        .allowDiskUse(true)
        .lean()
    ).map((r) => leanModelToJson<models.FileCollectionSchema>(r));

    perfLog(`Found ${collections.length} to regen.`);

    const queue = new PromiseQueue({ concurrency: 10 });

    const errors: { collId: string; error: string }[] = [];
    collections.forEach((c) => {
      queue.add(async () => {
        try {
          const fileIds = c.fileIdIndexes.map((f) => f.fileId);
          const filesRes = await actions.listFile({ args: { filter: { id: fileIds } } });
          if (!filesRes.success) throw new Error(filesRes.error);

          const updates = await makeCollAttrs(filesRes.data.items, c.fileIdIndexes);
          await models.FileCollectionModel.updateOne({ _id: c.id }, updates);
          socket.emit("onFileCollectionUpdated", { id: c.id, updates });
        } catch (err) {
          errors.push({ collId: c.id, error: err.message });
          perfLog(`[ERROR] ${err.message}`);
        }
      });
    });

    await queue.resolve();
    if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
    perfLogTotal("Regenerated collections.");
  },
);

export const regenCollTagAncestors = makeAction(
  async (
    args: { collectionIds: string[]; tagIds?: never } | { collectionIds?: never; tagIds: string[] },
  ) => {
    const collections = (
      await models.FileCollectionModel.find({
        ...(args.collectionIds ? { _id: { $in: objectIds(args.collectionIds) } } : {}),
        ...(args.tagIds ? { tagIdsWithAncestors: { $in: objectIds(args.tagIds) } } : {}),
      })
        .select({ _id: 1, tagIds: 1, tagIdsWithAncestors: 1 })
        .lean()
    ).map(leanModelToJson<models.FileCollectionSchema>);

    const ancestorsMap = await actions.makeAncestorIdsMap(collections.flatMap((c) => c.tagIds));

    await Promise.all(
      collections.map(async (c) => {
        const { hasUpdates, tagIdsWithAncestors } = actions.makeUniqueAncestorUpdates({
          ancestorsMap,
          oldTagIdsWithAncestors: c.tagIdsWithAncestors,
          tagIds: c.tagIds,
        });

        if (!hasUpdates) return;
        await models.FileCollectionModel.updateOne(
          { _id: c.id },
          { $set: { tagIdsWithAncestors } },
        );
      }),
    );
  },
);

export const repairCollections = makeAction(async () => {
  const deletedIds: string[] = [];

  /* -------------------- Deduplicate collections by fileId ------------------- */
  fileLog(`Getting all collections...`);
  const collections = await models.FileCollectionModel.find({});
  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  fileLog(`Found ${collections.length} collections.`);
  for (const collection of collections) {
    const key = [...collection.fileIdIndexes]
      .filter((f) => f.fileId)
      .map((f) => f.fileId.toString())
      .sort()
      .join(",");
    if (seen.has(key)) duplicateIds.push(collection._id.toString());
    else seen.add(key);
  }

  fileLog(`Found ${duplicateIds.length} duplicate collections.`);
  if (duplicateIds.length) {
    await models.FileCollectionModel.deleteMany({ _id: { $in: duplicateIds } });
    deletedIds.push(...duplicateIds);
  }

  /* ------------------------ Delete empty collections ------------------------ */
  fileLog(`Searching for empty collections...`);
  const emptyCollections = await models.FileCollectionModel.find({ fileCount: 0 }, { _id: 1 });
  const emptyIds = emptyCollections.map((c) => c._id.toString());

  fileLog(`Found ${emptyIds.length} empty collections`);
  if (emptyIds.length) {
    await models.FileCollectionModel.deleteMany({ _id: { $in: emptyIds } });
    deletedIds.push(...emptyIds);
  }

  /* -------- Remove duplicate and invalid fileIds, collapse index gaps ------- */
  fileLog(`Searching for remaining collections...`);
  const remaining = await models.FileCollectionModel.find({});
  const bulkOps = [];

  fileLog(`Found ${remaining.length} remaining collections.`);
  for (const collection of remaining) {
    const cleaned = dedupeFileIdIndexes(collection.fileIdIndexes);

    const hasChanges =
      cleaned.length !== collection.fileIdIndexes.length ||
      cleaned.some((entry, i) => entry.index !== collection.fileIdIndexes[i]?.index);

    if (hasChanges)
      bulkOps.push({
        updateOne: {
          filter: { _id: collection._id },
          update: { $set: { fileIdIndexes: cleaned, fileCount: cleaned.length } },
        },
      });
  }

  fileLog(`Found ${bulkOps.length} collections to update.`);
  if (bulkOps.length) {
    const res = await models.FileCollectionModel.bulkWrite(bulkOps);
    if (res.modifiedCount !== bulkOps.length) {
      fileLog({ bulkOps, res }, { type: "error" });
      throw new Error("Deduplication of fileIdIndexes failed!");
    }
  }

  /* --------------- Delete collections that are subsets of others ------------ */
  fileLog(`Searching for remaining collections...`);
  const remaining1 = await models.FileCollectionModel.find({});
  const fileIdSets = remaining1.map((collection) => ({
    id: collection._id.toString(),
    fileIds: new Set(
      collection.fileIdIndexes.filter((f) => f.fileId).map((f) => f.fileId.toString()),
    ),
  }));
  fileIdSets.sort((a, b) => a.fileIds.size - b.fileIds.size);
  fileLog(`Found ${fileIdSets.length} remaining collections.`);

  fileLog(`Searching for subset collections...`);
  const subsetIds: string[] = [];
  for (let i = 0; i < fileIdSets.length; i++) {
    if (subsetIds.includes(fileIdSets[i].id)) continue;
    for (let j = i + 1; j < fileIdSets.length; j++) {
      if (fileIdSets[i].fileIds.size === fileIdSets[j].fileIds.size) continue;
      if ([...fileIdSets[i].fileIds].every((id) => fileIdSets[j].fileIds.has(id))) {
        subsetIds.push(fileIdSets[i].id);
        break;
      }
    }
  }

  fileLog(`Found ${subsetIds.length} subset collections.`);
  if (subsetIds.length) {
    await models.FileCollectionModel.deleteMany({ _id: { $in: subsetIds } });
    deletedIds.push(...subsetIds);
  }

  if (deletedIds.length) socket.emit("onFileCollectionsDeleted", { ids: deletedIds });
});

export const updateCollection = makeAction(
  async (updates: Omit<Partial<models.FileCollectionSchema>, "tagIds"> & { id: string }) => {
    const coll = await models.FileCollectionModel.findOne({ _id: updates.id });
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const fileIds = updates.fileIdIndexes.map((f) => f.fileId);
      const filesRes = await actions.listFile({ args: { filter: { id: fileIds } } });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data.items;
      const fileMap = new Map(files.map((file) => [String(file.id), file]));

      const newFileIndexes = updates.fileIdIndexes
        .filter((f) => fileMap.has(String(f.fileId)))
        .map((f, i) => ({ fileId: f.fileId, index: i }));

      const newAttrs = await makeCollAttrs(files, newFileIndexes);
      updates = {
        ...updates,
        ...newAttrs,
        fileIdIndexes: newFileIndexes,
        rating: updates.ratingIsManual ? updates.rating : newAttrs.rating,
      };
    } else if (!updates.ratingIsManual && coll.ratingIsManual) {
      const fileIds = coll.fileIdIndexes.map((f) => f.fileId);
      const filesRes = await actions.listFile({ args: { filter: { id: fileIds } } });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data.items;

      const newAttrs = await makeCollAttrs(files, coll.fileIdIndexes);
      updates = { ...updates, ...newAttrs };
    }

    const res = await models.FileCollectionModel.updateOne({ _id: updates.id }, updates, {
      new: true,
    });
    socket.emit("onFileCollectionUpdated", { id: updates.id, updates });
    return res;
  },
);
