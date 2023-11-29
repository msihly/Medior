import {
  CreateCollectionInput,
  DeleteCollectionInput,
  FileCollection,
  FileCollectionModel,
  ListCollectionsInput,
  OnCollectionCreatedInput,
  UpdateCollectionInput,
  listFiles,
} from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson } from "./utils";

export const createCollection = ({ fileIdIndexes, title }: CreateCollectionInput) =>
  handleErrors(async () => {
    const filesRes = await listFiles({ ids: fileIdIndexes.map((f) => f.fileId) });
    if (!filesRes.success) throw new Error(filesRes.error);
    const files = filesRes.data;

    const dateCreated = dayjs().toISOString();
    const collection = {
      dateCreated,
      dateModified: dateCreated,
      fileIdIndexes,
      rating: files.reduce((acc, f) => acc + f.rating, 0) / files.length,
      tagIds: [...new Set(files.flatMap((f) => f.tagIds))],
      thumbPaths: files.slice(0, 10).map((f) => f.thumbPaths[0]),
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

export const updateCollection = ({ collection }: UpdateCollectionInput) =>
  handleErrors(async () => {
    const updates = { ...collection, dateModified: dayjs().toISOString() };

    if (updates.fileIdIndexes) {
      const filesRes = await listFiles({ ids: updates.fileIdIndexes.map((f) => f.fileId) });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data;

      updates.rating = files.reduce((acc, f) => acc + f.rating, 0) / files.length;
      updates.tagIds = [...new Set(files.flatMap((f) => f.tagIds))];
      updates.thumbPaths = files.slice(0, 10).map((f) => f.thumbPaths[0]);
    }

    return await FileCollectionModel.updateOne({ _id: collection.id }, updates);
  });
