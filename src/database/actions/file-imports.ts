import * as db from "database";
import { ImportBatchInput } from "store";
import { dayjs, handleErrors, socket } from "utils";

export const completeImportBatch = ({
  collectionId,
  fileIds,
  id,
  tagIds,
}: db.CompleteImportBatchInput) =>
  handleErrors(async () => {
    const completedAt = dayjs().toISOString();
    await Promise.all([
      db.FileImportBatchModel.updateOne({ _id: id }, { collectionId, completedAt }),
      tagIds.length && db.regenFileTagAncestors({ fileIds }),
      tagIds.length && db.recalculateTagCounts({ tagIds }),
    ]);

    socket.emit("importBatchCompleted");
    return completedAt;
  });

export const createImportBatches = (batches: db.CreateImportBatchesInput) =>
  handleErrors(async () => {
    const res = await db.FileImportBatchModel.insertMany(
      batches.map((batch) => ({
        ...batch,
        completedAt: null,
        startedAt: null,
        tagIds: batch.tagIds ? [...new Set(batch.tagIds)].flat() : [],
      }))
    );

    if (res.length !== batches.length) throw new Error("Failed to create import batches");
    return res;
  });

export const deleteImportBatches = ({ ids }: db.DeleteImportBatchesInput) =>
  handleErrors(async () => await db.FileImportBatchModel.deleteMany({ _id: { $in: ids } }));

export const listImportBatches = () =>
  handleErrors(async () =>
    (await db.FileImportBatchModel.find().lean()).map(
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

export const startImportBatch = ({ id }: db.StartImportBatchInput) =>
  handleErrors(async () => {
    const startedAt = dayjs().toISOString();
    await db.FileImportBatchModel.updateOne({ _id: id }, { startedAt });
    return startedAt;
  });

export const updateFileImportByPath = async ({
  batchId,
  errorMsg,
  fileId,
  filePath,
  status,
  thumbPaths,
}: db.UpdateFileImportByPathInput) =>
  handleErrors(async () => {
    const res = await db.FileImportBatchModel.updateOne(
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
