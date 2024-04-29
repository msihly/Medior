import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson, objectIds } from "./utils";

/* ---------------------------- HELPER FUNCTIONS ---------------------------- */
const createCollectionFilterPipeline = ({
  excludedDescTagIds,
  excludedTagIds,
  isSortDesc,
  optionalTagIds,
  requiredDescTagIds,
  requiredTagIds,
  sortKey,
  title,
}: db.CreateCollectionFilterPipelineInput) => {
  const sortDir = isSortDesc ? -1 : 1;

  const hasExcludedTags = excludedTagIds?.length > 0;
  const hasExcludedDescTags = excludedDescTagIds?.length > 0;
  const hasOptionalTags = optionalTagIds?.length > 0;
  const hasRequiredDescTags = requiredDescTagIds?.length > 0;
  const hasRequiredTags = requiredTagIds.length > 0;

  return {
    $match: {
      ...(title ? { title: { $regex: new RegExp(title, "i") } } : {}),
      ...(hasExcludedTags || hasOptionalTags || hasRequiredTags
        ? {
            tagIds: {
              ...(hasExcludedTags ? { $nin: objectIds(excludedTagIds) } : {}),
              ...(hasOptionalTags ? { $in: objectIds(optionalTagIds) } : {}),
              ...(hasRequiredTags ? { $all: objectIds(requiredTagIds) } : {}),
            },
          }
        : {}),
      ...(hasExcludedDescTags || hasRequiredDescTags
        ? {
            tagIdsWithAncestors: {
              ...(hasExcludedDescTags ? { $nin: objectIds(excludedDescTagIds) } : {}),
              ...(hasRequiredDescTags ? { $all: objectIds(requiredDescTagIds) } : {}),
            },
          }
        : {}),
    },
    $sort: { [sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export const listCollectionIdsByTagIds = async ({ tagIds }: db.ListCollectionIdsByTagIdsInput) =>
  handleErrors(async () => {
    return (
      await db.FileCollectionModel.find({ tagIds: { $in: objectIds(tagIds) } })
        .select({ _id: 1 })
        .lean()
    ).map((f) => f._id.toString());
  });

const makeCollAttrs = async (files: db.File[]) => {
  const ratedFiles = files.filter((f) => f.rating > 0);
  const tagIds = [...new Set(files.flatMap((f) => f.tagIds))];
  return {
    fileCount: files.length,
    rating: ratedFiles.reduce((acc, f) => acc + f.rating, 0) / ratedFiles.length,
    tagIds,
    tagIdsWithAncestors: await db.deriveTagIdsWithAncestors(tagIds),
    thumbPaths: files.slice(0, 10).map((f) => f.thumbPaths[0]),
  };
};

export const regenCollAttrs = async ({ collIds, fileIds }: db.RegenCollAttrsInput = {}) =>
  handleErrors(async () => {
    const collections = (
      await db.FileCollectionModel.find({
        ...(collIds.length
          ? { _id: { $in: objectIds(collIds) } }
          : fileIds.length
          ? { fileIdIndexes: { $elemMatch: { fileId: { $in: fileIds } } } }
          : {}),
      })
        .select({ _id: 1, fileIdIndexes: 1 })
        .lean()
    ).map((r) => leanModelToJson<db.FileCollection>(r));

    await Promise.all(
      collections.map(async (collection) => {
        const filesRes = await db.listFiles({ ids: collection.fileIdIndexes.map((f) => f.fileId) });
        if (!filesRes.success) throw new Error(filesRes.error);

        const updates = await makeCollAttrs(filesRes.data);
        await db.FileCollectionModel.updateOne({ _id: collection.id }, { $set: updates });

        socket.emit("collectionUpdated", { collectionId: collection.id, updates });
      })
    );
  });

export const regenCollRating = async (fileIds: string[]) =>
  handleErrors(async () => {
    const collections = (
      await db.FileCollectionModel.find({
        fileIdIndexes: { $elemMatch: { fileId: { $in: fileIds } } },
      })
        .select({ _id: 1, fileIdIndexes: 1 })
        .lean()
    ).map((r) => leanModelToJson<db.FileCollection>(r));

    await Promise.all(
      collections.map(async (collection) => {
        const filesRes = await db.listFiles({ ids: collection.fileIdIndexes.map((f) => f.fileId) });
        if (!filesRes.success) throw new Error(filesRes.error);

        const rating = filesRes.data.reduce((acc, f) => acc + f.rating, 0) / filesRes.data.length;
        await db.FileCollectionModel.updateOne({ _id: collection.id }, { $set: { rating } });

        socket.emit("collectionUpdated", { collectionId: collection.id, updates: { rating } });
      })
    );
  });

export const regenCollTagAncestors = async ({
  collectionIds,
  tagIds,
}: { collectionIds: string[]; tagIds?: never } | { collectionIds?: never; tagIds: string[] }) =>
  handleErrors(async () => {
    const collections = (
      await db.FileCollectionModel.find({
        ...(collectionIds ? { _id: { $in: objectIds(collectionIds) } } : {}),
        ...(tagIds ? { tagIdsWithAncestors: { $in: objectIds(tagIds) } } : {}),
      })
        .select({ _id: 1, tagIds: 1, tagIdsWithAncestors: 1 })
        .lean()
    ).map(leanModelToJson<db.FileCollection>);

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
  });

/* ------------------------------ API ENDPOINTS ----------------------------- */
export const createCollection = ({ fileIdIndexes, title, withSub }: db.CreateCollectionInput) =>
  handleErrors(async () => {
    const filesRes = await db.listFiles({ ids: fileIdIndexes.map((f) => f.fileId) });
    if (!filesRes.success) throw new Error(filesRes.error);

    const dateCreated = dayjs().toISOString();
    const collection = {
      ...(await makeCollAttrs(filesRes.data)),
      dateCreated,
      dateModified: dateCreated,
      fileIdIndexes,
      title,
    };

    const res = await db.FileCollectionModel.create(collection);
    if (withSub) socket.emit("collectionCreated", { collection: res });
    return { ...collection, id: res._id.toString() };
  });

export const deleteCollection = ({ id }: db.DeleteCollectionInput) =>
  handleErrors(async () => {
    const res = await db.FileCollectionModel.deleteOne({ _id: id });
    if (res.deletedCount) socket.emit("collectionDeleted", { collectionId: id });
    return res;
  });

export const listAllCollectionIds = () =>
  handleErrors(async () => {
    return (await db.FileCollectionModel.find().select({ _id: 1 }).lean()).map((c) =>
      c._id.toString()
    );
  });

export const listFilteredCollections = ({
  page,
  pageSize,
  ...filterParams
}: db.ListFilteredCollectionsInput) =>
  handleErrors(async () => {
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
      collections: collections.map((c) => leanModelToJson<db.FileCollection>(c)),
      pageCount: Math.ceil(totalDocuments / pageSize),
    };
  });

export const updateCollection = (updates: db.UpdateCollectionInput) =>
  handleErrors(async () => {
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const filesRes = await db.listFiles({ ids: updates.fileIdIndexes.map((f) => f.fileId) });
      if (!filesRes.success) throw new Error(filesRes.error);
      updates = { ...updates, ...(await makeCollAttrs(filesRes.data)) };
    }

    return await db.FileCollectionModel.updateOne({ _id: updates.id }, updates);
  });
