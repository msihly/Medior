import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson } from "./utils";

const makeCollAttrs = (files: db.File[]) => {
  const rating = files.reduce((acc, f) => acc + f.rating, 0) / files.length;
  const tagIds = [...new Set(files.flatMap((f) => f.tagIds))];
  const thumbPaths = files.slice(0, 10).map((f) => f.thumbPaths[0]);
  return { rating, tagIds, thumbPaths };
};

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

export const listCollections = ({ ids }: db.ListCollectionsInput = {}) =>
  handleErrors(async () =>
    (await db.FileCollectionModel.find(ids ? { _id: { $in: ids } } : undefined).lean()).map((f) =>
      leanModelToJson<db.FileCollection>(f)
    )
  );

export const onCollectionCreated = async ({ collection }: db.OnCollectionCreatedInput) =>
  handleErrors(async () => !!socket.emit("collectionCreated", { collection }));

export const updateCollection = (updates: db.UpdateCollectionInput) =>
  handleErrors(async () => {
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const filesRes = await db.listFiles({ ids: updates.fileIdIndexes.map((f) => f.fileId) });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data;

      const { rating, tagIds, thumbPaths } = makeCollAttrs(files);
      updates.rating = rating;
      updates.tagIds = tagIds;
      updates.thumbPaths = thumbPaths;
    }

    return await db.FileCollectionModel.updateOne({ _id: updates.id }, updates);
  });
