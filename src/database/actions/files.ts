import {
  AddTagsToFilesInput,
  DeleteFilesInput,
  File,
  FileModel,
  GetFileByHashInput,
  ImportFileInput,
  ListFilesByTagIdsInput,
  ListFilesInput,
  ListFilteredFilesInput,
  OnFileTagsUpdatedInput,
  OnFilesUpdatedInput,
  RemoveTagFromAllFilesInput,
  RemoveTagsFromFilesInput,
  SetFileIsArchivedInput,
  SetFileRatingInput,
  UpdateFileInput,
} from "database";
import { LeanDocument, Types } from "mongoose";
import { dayjs, handleErrors, socket, trpc } from "utils";

export const addTagsToFiles = ({ fileIds = [], tagIds = [] }: AddTagsToFilesInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await FileModel.updateMany(
      { _id: { $in: fileIds } },
      { $addToSet: { tagIds: { $each: tagIds } }, dateModified }
    );
    return dateModified;
  });

export const deleteFiles = ({ fileIds = [] }: DeleteFilesInput) =>
  handleErrors(async () => await FileModel.deleteMany({ _id: { $in: fileIds } }));

export const getFileByHash = ({ hash }: GetFileByHashInput) =>
  handleErrors(async () => (await FileModel.findOne({ hash }))?.toJSON?.() as File);

export const importFile = ({
  dateCreated,
  duration,
  ext,
  frameRate,
  hash,
  height,
  originalName,
  originalPath,
  path,
  size,
  tagIds,
  thumbPaths,
  width,
}: ImportFileInput) =>
  handleErrors(
    async () =>
      (
        await FileModel.create({
          dateCreated,
          dateModified: dayjs().toISOString(),
          duration,
          ext,
          frameRate,
          hash,
          height,
          isArchived: false,
          originalHash: hash,
          originalName,
          originalPath,
          path,
          rating: 0,
          size,
          tagIds,
          thumbPaths,
          width,
        })
      ).toJSON() as File
  );

const leanFileToJson = (file: LeanDocument<File & { _id: Types.ObjectId }>) => {
  const { _id, ...rest } = file;
  return { ...rest, id: _id.toString() } as File;
};

export const listFiles = ({ ids }: ListFilesInput = {}) =>
  handleErrors(async () => {
    return (await FileModel.find(ids ? { _id: { $in: ids } } : undefined).lean()).map((f) =>
      leanFileToJson(f)
    );
  });

export const listFilesByTagIds = ({ tagIds }: ListFilesByTagIdsInput) =>
  handleErrors(async () => {
    return (await FileModel.find({ tagIds: { $in: tagIds } }).lean()).map((f) => leanFileToJson(f));
  });

export const listFilteredFiles = ({
  includeTagged,
  includeUntagged,
  isArchived,
  selectedImageTypes,
  selectedVideoTypes,
}: ListFilteredFilesInput) =>
  handleErrors(async () => {
    const enabledExts = Object.entries({
      ...selectedImageTypes,
      ...selectedVideoTypes,
    }).reduce((acc, [key, isEnabled]) => {
      if (isEnabled) acc.push(`.${key}`);
      return acc;
    }, [] as string[]);

    return (
      await FileModel.find({
        isArchived,
        ext: { $in: enabledExts },
        ...(includeTagged
          ? { tagIds: { $ne: [] } }
          : includeUntagged
          ? { tagIds: { $eq: [] } }
          : {}),
      }).lean()
    ).map((f) => leanFileToJson(f));
  });

export const onFilesDeleted = async ({ fileIds }: DeleteFilesInput) =>
  handleErrors(async () => !!socket.emit("filesDeleted", { fileIds }));

export const onFilesUpdated = async ({ fileIds, updates }: OnFilesUpdatedInput) =>
  handleErrors(async () => !!socket.emit("filesUpdated", { fileIds, updates }));

export const onFileTagsUpdated = async ({
  addedTagIds,
  fileIds,
  removedTagIds,
}: OnFileTagsUpdatedInput) =>
  handleErrors(
    async () => !!socket.emit("fileTagsUpdated", { addedTagIds, fileIds, removedTagIds })
  );

export const removeTagFromAllFiles = ({ tagId }: RemoveTagFromAllFilesInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    const fileRes = await FileModel.updateMany(
      { tagIds: tagId },
      { $pull: { tagIds: tagId }, dateModified }
    );
    if (fileRes?.matchedCount !== fileRes?.modifiedCount)
      throw new Error("Failed to remove tag from all files");

    return dateModified;
  });

export const removeTagsFromFiles = ({ fileIds = [], tagIds = [] }: RemoveTagsFromFilesInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await FileModel.updateMany({ _id: { $in: fileIds } }, { $pullAll: { tagIds }, dateModified });
    return dateModified;
  });

export const setFileRating = ({ fileIds = [], rating }: SetFileRatingInput) =>
  handleErrors(async () => {
    const updates = { rating, dateModified: dayjs().toISOString() };
    await FileModel.updateMany({ _id: { $in: fileIds } }, updates);
    await trpc.onFilesUpdated.mutate({ fileIds, updates });
    return { fileIds, updates };
  });

export const setFileIsArchived = ({ fileIds = [], isArchived }: SetFileIsArchivedInput) =>
  handleErrors(async () => await FileModel.updateMany({ _id: { $in: fileIds } }, { isArchived }));

export const updateFile = async ({ id, ...updates }: UpdateFileInput) =>
  handleErrors(async () => await FileModel.updateOne({ _id: id }, updates));
