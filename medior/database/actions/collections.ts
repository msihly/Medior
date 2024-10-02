import * as actions from "medior/database/actions";
import * as models from "medior/_generated/models";
import { leanModelToJson, makeAction, objectIds } from "medior/database/utils";
import { dayjs, socket } from "medior/utils";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const makeCollAttrs = async (
  files: models.FileSchema[],
  fileIdIndexes: { fileId: string; index: number }[]
) => {
  const indexMap = new Map(fileIdIndexes.map((f) => [f.fileId, f.index]));
  const sortedFiles = [...files].sort((a, b) => indexMap.get(a.id) - indexMap.get(b.id));
  const ratedFiles = sortedFiles.filter((f) => f.rating > 0);
  const tagIds = [...new Set([...sortedFiles.map((f) => f.tagIds)].flat())];
  return {
    fileCount: sortedFiles.length,
    rating:
      ratedFiles.length > 0
        ? ratedFiles.reduce((acc, f) => acc + f.rating, 0) / ratedFiles.length
        : 0,
    tagIds,
    tagIdsWithAncestors: await actions.deriveAncestorTagIds(tagIds),
    thumbPaths: sortedFiles.slice(0, 10).map((f) => f.thumbPaths[0]),
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
      (fileId, index) => ({ fileId, index })
    );

    const updateRes = await updateCollection({ id: args.collId, fileIdIndexes: newFileIdIndexes });
    if (!updateRes.success) throw new Error(updateRes.error);
    return updateRes.data;
  }
);

export const createCollection = makeAction(
  async (args: {
    fileIdIndexes: { fileId: string; index: number }[];
    title: string;
    withSub?: boolean;
  }) => {
    const filesRes = await actions.listFiles({
      args: { filter: { id: args.fileIdIndexes.map((f) => f.fileId) } },
    });
    if (!filesRes.success) throw new Error(filesRes.error);

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
  }
);

export const deduplicateCollections = makeAction(async () => {
  const collections: { ids: string[]; title: string }[] =
    await models.FileCollectionModel.aggregate([
      { $group: { _id: { title: "$title", fileCount: "$fileCount" }, ids: { $push: "$_id" } } },
      { $match: { "ids.1": { $exists: true } } },
      { $project: { title: "$_id.title", ids: { $slice: ["$ids", 1, { $size: "$ids" }] } } },
    ]);

  const collectionIdsToDelete = collections.flatMap((c) => c.ids);
  const res = await models.FileCollectionModel.deleteMany({
    _id: { $in: collectionIdsToDelete },
  });

  if (res.deletedCount) socket.emit("onFileCollectionsDeleted", { ids: collectionIdsToDelete });
  return res.deletedCount;
});

export const deleteCollections = makeAction(async (args: { ids: string[] }) => {
  const res = await models.FileCollectionModel.deleteMany({ _id: { $in: objectIds(args.ids) } });
  if (res.deletedCount) socket.emit("onFileCollectionsDeleted", args);
  return res;
});

export const deleteEmptyCollections = makeAction(async () => {
  const res = await models.FileCollectionModel.deleteMany({ fileCount: 0 });
  return res.deletedCount;
});

export const listAllCollectionIds = makeAction(async () => {
  return (await models.FileCollectionModel.find().select({ _id: 1 }).lean()).map((c) =>
    c._id.toString()
  );
});

export const listCollectionIdsByTagIds = makeAction(async (args: { tagIds: string[] }) => {
  return (
    await models.FileCollectionModel.find({ tagIds: { $in: objectIds(args.tagIds) } })
      .select({ _id: 1 })
      .lean()
  ).map((f) => f._id.toString());
});

export const regenCollAttrs = makeAction(
  async (args: { collIds?: string[]; fileIds?: string[] } = {}) => {
    const collections = (
      await models.FileCollectionModel.find({
        ...(args.collIds?.length
          ? { _id: { $in: objectIds(args.collIds) } }
          : args.fileIds?.length
            ? { fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } } }
            : {}),
      })
        .select({ _id: 1, fileIdIndexes: 1 })
        .lean()
    ).map((r) => leanModelToJson<models.FileCollectionSchema>(r));

    await Promise.all(
      collections.map(async (collection) => {
        const filesRes = await actions.listFiles({
          args: { filter: { id: collection.fileIdIndexes.map((f) => f.fileId) } },
        });
        if (!filesRes.success) throw new Error(filesRes.error);

        const updates = await makeCollAttrs(filesRes.data.items, collection.fileIdIndexes);
        await models.FileCollectionModel.updateOne({ _id: collection.id }, updates);
        socket.emit("onFileCollectionUpdated", { id: collection.id, updates });
      })
    );
  }
);

export const regenCollRating = makeAction(async (fileIds: string[]) => {
  const collections = (
    await models.FileCollectionModel.find({
      fileIdIndexes: { $elemMatch: { fileId: { $in: fileIds } } },
    })
      .select({ _id: 1, fileIdIndexes: 1 })
      .lean()
  ).map((r) => leanModelToJson<models.FileCollectionSchema>(r));

  await Promise.all(
    collections.map(async (collection) => {
      const filesRes = await actions.listFiles({
        args: { filter: { id: collection.fileIdIndexes.map((f) => f.fileId) } },
      });
      if (!filesRes.success) throw new Error(filesRes.error);

      const rating =
        filesRes.data.items.reduce((acc, f) => acc + f.rating, 0) / filesRes.data.items.length;
      await models.FileCollectionModel.updateOne({ _id: collection.id }, { rating });

      socket.emit("onFileCollectionUpdated", { id: collection.id, updates: { rating } });
    })
  );
});

export const regenCollTagAncestors = makeAction(
  async (
    args: { collectionIds: string[]; tagIds?: never } | { collectionIds?: never; tagIds: string[] }
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
          { $set: { tagIdsWithAncestors } }
        );
      })
    );
  }
);

export const updateCollection = makeAction(
  async (updates: Omit<Partial<models.FileCollectionSchema>, "tagIds"> & { id: string }) => {
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const fileIds = updates.fileIdIndexes.map((f) => f.fileId);
      const filesRes = await actions.listFiles({ args: { filter: { id: fileIds } } });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data.items;
      const fileMap = new Map(files.map((file) => [String(file.id), file]));

      const newFileIndexes = updates.fileIdIndexes
        .filter((f) => fileMap.has(String(f.fileId)))
        .map((f, i) => ({ fileId: f.fileId, index: i }));

      updates = {
        ...updates,
        fileIdIndexes: newFileIndexes,
        ...(await makeCollAttrs(files, newFileIndexes)),
      };
    }

    const res = await models.FileCollectionModel.updateOne({ _id: updates.id }, updates, {
      new: true,
    });
    socket.emit("onFileCollectionUpdated", { id: updates.id, updates });
    return res;
  }
);
