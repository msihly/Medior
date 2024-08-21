import * as db from "medior/database";
import { leanModelToJson, makeAction, objectIds } from "medior/database/utils";
import { dayjs, socket } from "medior/utils";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
type CreateCollectionFilterPipelineInput = Parameters<typeof createCollectionFilterPipeline>[0];

const createCollectionFilterPipeline = (args: {
  excludedDescTagIds: string[];
  excludedTagIds: string[];
  isSortDesc: boolean;
  optionalTagIds: string[];
  requiredDescTagIds: string[];
  requiredTagIds: string[];
  sortKey: string;
  title: string;
}) => {
  const sortDir = args.isSortDesc ? -1 : 1;

  const hasExcludedTags = args.excludedTagIds?.length > 0;
  const hasExcludedDescTags = args.excludedDescTagIds?.length > 0;
  const hasOptionalTags = args.optionalTagIds?.length > 0;
  const hasRequiredDescTags = args.requiredDescTagIds?.length > 0;
  const hasRequiredTags = args.requiredTagIds.length > 0;

  return {
    $match: {
      ...(args.title ? { title: { $regex: new RegExp(args.title, "i") } } : {}),
      ...(hasExcludedTags || hasOptionalTags || hasRequiredTags
        ? {
            tagIds: {
              ...(hasExcludedTags ? { $nin: objectIds(args.excludedTagIds) } : {}),
              ...(hasOptionalTags ? { $in: objectIds(args.optionalTagIds) } : {}),
              ...(hasRequiredTags ? { $all: objectIds(args.requiredTagIds) } : {}),
            },
          }
        : {}),
      ...(hasExcludedDescTags || hasRequiredDescTags
        ? {
            tagIdsWithAncestors: {
              ...(hasExcludedDescTags ? { $nin: objectIds(args.excludedDescTagIds) } : {}),
              ...(hasRequiredDescTags ? { $all: objectIds(args.requiredDescTagIds) } : {}),
            },
          }
        : {}),
    },
    $sort: { [args.sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

const makeCollAttrs = async (files: db.FileSchema[]) => {
  const ratedFiles = files.filter((f) => f.rating > 0);
  const tagIds = [...new Set(files.flatMap((f) => f.tagIds))];
  return {
    fileCount: files.length,
    rating:
      ratedFiles.length > 0
        ? ratedFiles.reduce((acc, f) => acc + f.rating, 0) / ratedFiles.length
        : 0,
    tagIds,
    tagIdsWithAncestors: await db.deriveAncestorTagIds(tagIds),
    thumbPaths: files.slice(0, 10).map((f) => f.thumbPaths[0]),
  };
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const createCollection = makeAction(
  async (args: {
    fileIdIndexes: { fileId: string; index: number }[];
    title: string;
    withSub?: boolean;
  }) => {
    const filesRes = await db.listFiles({
      args: { filter: { ids: args.fileIdIndexes.map((f) => f.fileId) } },
    });
    if (!filesRes.success) throw new Error(filesRes.error);

    const dateCreated = dayjs().toISOString();
    const collection = {
      ...(await makeCollAttrs(filesRes.data.items)),
      dateCreated,
      dateModified: dateCreated,
      fileIdIndexes: args.fileIdIndexes,
      title: args.title,
    };

    const res = await db.FileCollectionModel.create(collection);
    if (args.withSub) socket.emit("onFileCollectionCreated", res);
    return { ...collection, id: res._id.toString() };
  }
);

export const deleteCollection = makeAction(async (args: { id: string }) => {
  const res = await db.FileCollectionModel.deleteOne({ _id: args.id });
  if (res.deletedCount) socket.emit("onFileCollectionDeleted", args);
  return res;
});

export const deleteEmptyCollections = makeAction(async () => {
  const res = await db.FileCollectionModel.deleteMany({ fileCount: 0 });
  return res.deletedCount;
});

export const listAllCollectionIds = makeAction(async () => {
  return (await db.FileCollectionModel.find().select({ _id: 1 }).lean()).map((c) =>
    c._id.toString()
  );
});

export const listCollectionIdsByTagIds = makeAction(async (args: { tagIds: string[] }) => {
  return (
    await db.FileCollectionModel.find({ tagIds: { $in: objectIds(args.tagIds) } })
      .select({ _id: 1 })
      .lean()
  ).map((f) => f._id.toString());
});

export const listFilteredCollections = makeAction(
  async ({
    page,
    pageSize,
    ...filterParams
  }: CreateCollectionFilterPipelineInput & {
    page: number;
    pageSize: number;
  }) => {
    const filterPipeline = createCollectionFilterPipeline(filterParams);

    const [collections, totalDocuments] = await Promise.all([
      db.FileCollectionModel.find(filterPipeline.$match)
        .sort(filterPipeline.$sort)
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.FileCollectionModel.countDocuments(filterPipeline.$match),
    ]);

    if (!collections || !(totalDocuments > -1))
      throw new Error("Failed to load filtered collection IDs");

    return {
      collections: collections.map((c) => leanModelToJson<db.FileCollectionSchema>(c)),
      pageCount: Math.ceil(totalDocuments / pageSize),
    };
  }
);

export const regenCollAttrs = makeAction(
  async (args: { collIds?: string[]; fileIds?: string[] } = {}) => {
    const collections = (
      await db.FileCollectionModel.find({
        ...(args.collIds?.length
          ? { _id: { $in: objectIds(args.collIds) } }
          : args.fileIds?.length
            ? { fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } } }
            : {}),
      })
        .select({ _id: 1, fileIdIndexes: 1 })
        .lean()
    ).map((r) => leanModelToJson<db.FileCollectionSchema>(r));

    await Promise.all(
      collections.map(async (collection) => {
        const filesRes = await db.listFiles({
          args: { filter: { ids: collection.fileIdIndexes.map((f) => f.fileId) } },
        });
        if (!filesRes.success) throw new Error(filesRes.error);

        const updates = await makeCollAttrs(filesRes.data.items);
        await db.FileCollectionModel.updateOne({ _id: collection.id }, { $set: updates });

        socket.emit("onFileCollectionUpdated", { id: collection.id, updates });
      })
    );
  }
);

export const regenCollRating = makeAction(async (fileIds: string[]) => {
  const collections = (
    await db.FileCollectionModel.find({
      fileIdIndexes: { $elemMatch: { fileId: { $in: fileIds } } },
    })
      .select({ _id: 1, fileIdIndexes: 1 })
      .lean()
  ).map((r) => leanModelToJson<db.FileCollectionSchema>(r));

  await Promise.all(
    collections.map(async (collection) => {
      const filesRes = await db.listFiles({
        args: { filter: { ids: collection.fileIdIndexes.map((f) => f.fileId) } },
      });
      if (!filesRes.success) throw new Error(filesRes.error);

      const rating =
        filesRes.data.items.reduce((acc, f) => acc + f.rating, 0) / filesRes.data.items.length;
      await db.FileCollectionModel.updateOne({ _id: collection.id }, { $set: { rating } });

      socket.emit("onFileCollectionUpdated", { id: collection.id, updates: { rating } });
    })
  );
});

export const regenCollTagAncestors = makeAction(
  async (
    args: { collectionIds: string[]; tagIds?: never } | { collectionIds?: never; tagIds: string[] }
  ) => {
    const collections = (
      await db.FileCollectionModel.find({
        ...(args.collectionIds ? { _id: { $in: objectIds(args.collectionIds) } } : {}),
        ...(args.tagIds ? { tagIdsWithAncestors: { $in: objectIds(args.tagIds) } } : {}),
      })
        .select({ _id: 1, tagIds: 1, tagIdsWithAncestors: 1 })
        .lean()
    ).map(leanModelToJson<db.FileCollectionSchema>);

    const ancestorsMap = await db.makeAncestorIdsMap(collections.flatMap((c) => c.tagIds));

    await Promise.all(
      collections.map(async (c) => {
        const { hasUpdates, tagIdsWithAncestors } = db.makeUniqueAncestorUpdates({
          ancestorsMap,
          oldTagIdsWithAncestors: c.tagIdsWithAncestors,
          tagIds: c.tagIds,
        });

        if (!hasUpdates) return;
        await db.FileCollectionModel.updateOne({ _id: c.id }, { $set: { tagIdsWithAncestors } });
      })
    );
  }
);

export const updateCollection = makeAction(
  async (updates: Omit<Partial<db.FileCollectionSchema>, "tagIds"> & { id: string }) => {
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const filesRes = await db.listFiles({
        args: { filter: { ids: updates.fileIdIndexes.map((f) => f.fileId) } },
      });
      if (!filesRes.success) throw new Error(filesRes.error);
      updates = { ...updates, ...(await makeCollAttrs(filesRes.data.items)) };
    }

    return await db.FileCollectionModel.updateOne({ _id: updates.id }, updates);
  }
);
