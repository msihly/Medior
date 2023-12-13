import {
  AddTagsToBatchInput,
  CompleteImportBatchInput,
  CreateImportBatchInput,
  DeleteImportBatchInput,
  FileImportBatchModel,
  RemoveTagsFromAllBatchesInput,
  RemoveTagsFromBatchInput,
  StartImportBatchInput,
  UpdateFileImportByPathInput,
} from "database";
import { ImportBatchInput } from "store";
import { dayjs, handleErrors } from "utils";

export const addTagsToBatch = ({ batchId, tagIds }: AddTagsToBatchInput) =>
  handleErrors(
    async () =>
      await FileImportBatchModel.updateOne(
        { _id: batchId },
        { $addToSet: { tagIds: { $each: tagIds } } }
      )
  );

export const completeImportBatch = ({ id }: CompleteImportBatchInput) =>
  handleErrors(async () => {
    const completedAt = dayjs().toISOString();
    await FileImportBatchModel.updateOne({ _id: id }, { completedAt });
    return completedAt;
  });

export const createImportBatch = ({
  collectionTitle,
  createdAt,
  deleteOnImport,
  imports,
  tagIds = [],
}: CreateImportBatchInput) =>
  handleErrors(
    async () =>
      await FileImportBatchModel.create({
        collectionTitle,
        completedAt: null,
        createdAt,
        deleteOnImport,
        imports,
        startedAt: null,
        tagIds,
      })
  );

export const deleteImportBatch = ({ id }: DeleteImportBatchInput) =>
  handleErrors(async () => await FileImportBatchModel.deleteOne({ _id: id }));

export const deleteAllImportBatches = () =>
  handleErrors(async () => await FileImportBatchModel.deleteMany({}));

export const listImportBatches = () =>
  handleErrors(async () =>
    (await FileImportBatchModel.find().lean()).map(
      (b) =>
        ({
          ...b,
          id: b._id.toString(),
          imports: b.imports.map((i) => ({ ...i, _id: undefined })),
          _id: undefined,
          __v: undefined,
        } as ImportBatchInput)
    )
  );

export const removeTagsFromAllBatches = ({ tagIds }: RemoveTagsFromAllBatchesInput) =>
  handleErrors(async () => {
    const importRes = await FileImportBatchModel.updateMany({ tagIds }, { $pull: { tagIds } });
    if (importRes?.matchedCount !== importRes?.modifiedCount)
      throw new Error("Failed to remove tag from all import batches");
  });

export const removeTagsFromBatch = ({ batchId, tagIds }: RemoveTagsFromBatchInput) =>
  handleErrors(
    async () => await FileImportBatchModel.updateOne({ _id: batchId }, { $pullAll: { tagIds } })
  );

export const startImportBatch = ({ id }: StartImportBatchInput) =>
  handleErrors(async () => {
    const startedAt = dayjs().toISOString();
    await FileImportBatchModel.updateOne({ _id: id }, { startedAt });
    return startedAt;
  });

export const updateFileImportByPath = async ({
  batchId,
  errorMsg,
  fileId,
  filePath,
  status,
  thumbPaths,
}: UpdateFileImportByPathInput) =>
  handleErrors(async () => {
    const res = await FileImportBatchModel.updateOne(
      { _id: batchId },
      {
        $set: {
          "imports.$[fileImport].errorMsg": errorMsg,
          "imports.$[fileImport].fileId": fileId,
          "imports.$[fileImport].status": status,
          "imports.$[fileImport].thumbPaths": thumbPaths,
        },
      },
      { arrayFilters: [{ "fileImport.path": filePath }] }
    );

    if (res?.matchedCount !== res?.modifiedCount)
      throw new Error("Failed to update file import by path");
  });
