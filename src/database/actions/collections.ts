import {
  CreateCollectionInput,
  DeleteCollectionInput,
  File,
  FileCollection,
  FileCollectionModel,
  ListCollectionsInput,
  OnCollectionCreatedInput,
  UpdateCollectionInput,
  listFiles,
} from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson } from "./utils";

const makeCollAttrs = (files: File[]) => {
  const rating = files.reduce((acc, f) => acc + f.rating, 0) / files.length;
  const tagIds = [...new Set(files.flatMap((f) => f.tagIds))];
  const thumbPaths = files.slice(0, 10).map((f) => f.thumbPaths[0]);
  return { rating, tagIds, thumbPaths };
};

export const createCollection = ({ fileIdIndexes, title }: CreateCollectionInput) =>
  handleErrors(async () => {
    const filesRes = await listFiles({ ids: fileIdIndexes.map((f) => f.fileId) });
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

    const res = await FileCollectionModel.create(collection);
    return { ...collection, id: res._id.toString() };
  });

export const deleteCollection = ({ id }: DeleteCollectionInput) =>
  handleErrors(async () => await FileCollectionModel.deleteOne({ _id: id }));

export const listCollections = ({ ids }: ListCollectionsInput = {}) =>
  handleErrors(async () =>
    (await FileCollectionModel.find(ids ? { _id: { $in: ids } } : undefined).lean()).map((f) =>
      leanModelToJson<FileCollection>(f)
    )
  );

export const onCollectionCreated = async ({ collection }: OnCollectionCreatedInput) =>
  handleErrors(async () => !!socket.emit("collectionCreated", { collection }));

export const updateCollection = (updates: UpdateCollectionInput) =>
  handleErrors(async () => {
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const filesRes = await listFiles({ ids: updates.fileIdIndexes.map((f) => f.fileId) });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data;

      const { rating, tagIds, thumbPaths } = makeCollAttrs(files);
      updates.rating = rating;
      updates.tagIds = tagIds;
      updates.thumbPaths = thumbPaths;
    }

    return await FileCollectionModel.updateOne({ _id: updates.id }, updates);
  });
