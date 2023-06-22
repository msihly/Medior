import {
  AddTagsToBatchInput,
  CompleteImportBatchInput,
  CreateImportBatchInput,
  DeleteImportBatchInput,
  FileImportBatch,
  FileImportBatchModel,
  RemoveTagFromAllBatchesInput,
  RemoveTagsFromBatchInput,
  StartImportBatchInput,
  UpdateFileImportByPathInput,
} from "database";
import { FileImport } from "store";
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

export const createImportBatch = ({ createdAt, imports, tagIds = [] }: CreateImportBatchInput) =>
  handleErrors(
    async () =>
      await FileImportBatchModel.create({
        createdAt,
        completedAt: null,
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
    (await FileImportBatchModel.find()).map((r) => {
      const batch = r.toJSON() as FileImportBatch;
      return { ...batch, imports: batch.imports as FileImport[] };
    })
  );

export const removeTagFromAllBatches = ({ tagId }: RemoveTagFromAllBatchesInput) =>
  handleErrors(async () => {
    const importRes = await FileImportBatchModel.updateMany(
      { tagIds: tagId },
      { $pull: { tagIds: tagId } }
    );
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
  filePath,
  fileId,
  status,
}: UpdateFileImportByPathInput) =>
  handleErrors(
    async () =>
      await FileImportBatchModel.updateOne(
        { _id: batchId },
        {
          $set: {
            "imports.$[fileImport].errorMsg": errorMsg,
            "imports.$[fileImport].fileId": fileId,
            "imports.$[fileImport].status": status,
          },
        },
        { arrayFilters: [{ "fileImport.path": filePath }] }
      )
  );
