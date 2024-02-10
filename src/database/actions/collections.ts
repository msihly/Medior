import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson, objectIds } from "./utils";

const createCollectionFilterPipeline = ({
  excludedTagIds,
  isSortDesc,
  optionalTagIds,
  requiredTagIdArrays,
  requiredTagIds,
  sortKey,
  title,
}: db.CreateCollectionFilterPipelineInput) => {
  const sortDir = isSortDesc ? -1 : 1;

  const hasExcludedTags = excludedTagIds?.length > 0;
  const hasOptionalTags = optionalTagIds?.length > 0;
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
      ...(requiredTagIdArrays.length > 0
        ? { $and: requiredTagIdArrays.map((ids) => ({ tagIds: { $in: objectIds(ids) } })) }
        : {}),
    },
    $sort: { [sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

const makeCollAttrs = (files: db.File[]) => ({
  fileCount: files.length,
  rating: files.reduce((acc, f) => acc + f.rating, 0) / files.length,
  tagIds: [...new Set(files.flatMap((f) => f.tagIds))],
  thumbPaths: files.slice(0, 10).map((f) => f.thumbPaths[0]),
});

export const createCollection = ({ fileIdIndexes, title }: db.CreateCollectionInput) =>
  handleErrors(async () => {
    const filesRes = await db.listFiles({ ids: fileIdIndexes.map((f) => f.fileId) });
    if (!filesRes.success) throw new Error(filesRes.error);
    const files = filesRes.data;

    const dateCreated = dayjs().toISOString();
    const collection = {
      ...makeCollAttrs(files),
      dateCreated,
      dateModified: dateCreated,
      fileIdIndexes,
      title,
    };

    const res = await db.FileCollectionModel.create(collection);
    return { ...collection, id: res._id.toString() };
  });

export const deleteCollection = ({ id }: db.DeleteCollectionInput) =>
  handleErrors(async () => await db.FileCollectionModel.deleteOne({ _id: id }));

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

export const onCollectionCreated = async ({ collection }: db.OnCollectionCreatedInput) =>
  handleErrors(async () => !!socket.emit("collectionCreated", { collection }));

export const updateCollection = (updates: db.UpdateCollectionInput) =>
  handleErrors(async () => {
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const filesRes = await db.listFiles({ ids: updates.fileIdIndexes.map((f) => f.fileId) });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data;

      const { fileCount, rating, tagIds, thumbPaths } = makeCollAttrs(files);
      updates.fileCount = fileCount;
      updates.rating = rating;
      updates.tagIds = tagIds;
      updates.thumbPaths = thumbPaths;
    }

    return await db.FileCollectionModel.updateOne({ _id: updates.id }, updates);
  });
