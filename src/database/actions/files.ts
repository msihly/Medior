import {
  AddTagsToFilesInput,
  DeleteFilesInput,
  File,
  FileModel,
  GetFileByHashInput,
  ListFilesByTagIdsInput,
  ListFilesInput,
  ListFilteredFilesInput,
  RemoveTagFromAllFilesInput,
  RemoveTagsFromFilesInput,
  SetFileIsArchivedInput,
  SetFileRatingInput,
  UpdateFileInput,
} from "database";
import { dayjs, handleErrors } from "utils";

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

export const listFiles = ({ ids }: ListFilesInput = {}) =>
  handleErrors(async () =>
    (await FileModel.find(ids ? { _id: { $in: ids } } : undefined)).map((r) => r.toJSON() as File)
  );

export const listFilesByTagIds = ({ tagIds }: ListFilesByTagIdsInput) =>
  handleErrors(async () =>
    (await FileModel.find({ tagIds: { $in: tagIds } })).map((r) => r.toJSON() as File)
  );

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
      })
    ).map((r) => r.toJSON() as File);
  });

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
    const dateModified = dayjs().toISOString();
    return await FileModel.updateMany({ _id: { $in: fileIds } }, { rating, dateModified });
  });

export const setFileIsArchived = ({ fileIds = [], isArchived }: SetFileIsArchivedInput) =>
  handleErrors(async () => await FileModel.updateMany({ _id: { $in: fileIds } }, { isArchived }));

export const updateFile = async ({ id, ...updates }: UpdateFileInput) =>
  handleErrors(async () => await FileModel.updateOne({ _id: id }, updates));
