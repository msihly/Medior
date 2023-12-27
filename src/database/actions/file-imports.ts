import * as db from "database";
import { ImportBatchInput } from "store";
import { dayjs, handleErrors } from "utils";
import { leanModelToJson } from "./utils";

export const addTagsToBatch = ({ batchId, tagIds }: db.AddTagsToBatchInput) =>
  handleErrors(
    async () =>
      await db.FileImportBatchModel.updateOne(
        { _id: batchId },
        { $addToSet: { tagIds: { $each: tagIds } } }
      )
  );

export const completeImportBatch = ({ collectionId, id }: db.CompleteImportBatchInput) =>
  handleErrors(async () => {
    const completedAt = dayjs().toISOString();
    await db.FileImportBatchModel.updateOne({ _id: id }, { collectionId, completedAt });
    return completedAt;
  });

export const createImportBatches = (batches: db.CreateImportBatchesInput) =>
  handleErrors(async () => {
    const importBatches = batches.map(
      ({ collectionTitle, createdAt, deleteOnImport, imports, tagIds }) => ({
        collectionTitle,
        completedAt: null,
        createdAt,
        deleteOnImport,
        imports,
        startedAt: null,
        tagIds: tagIds ? [...tagIds].flat() : [],
      })
    );

    const res = await db.FileImportBatchModel.insertMany(importBatches);
    if (res.length !== importBatches.length) throw new Error("Failed to create import batches");
  });

export const createRegExMaps = ({ regExMaps }: db.CreateRegExMapsInput) =>
  handleErrors(async () => {
    const res = await db.RegExMapModel.insertMany(regExMaps);
    return res;
  });

export const deleteAllImportBatches = () =>
  handleErrors(async () => await db.FileImportBatchModel.deleteMany({}));

export const deleteImportBatch = ({ id }: db.DeleteImportBatchInput) =>
  handleErrors(async () => await db.FileImportBatchModel.deleteOne({ _id: id }));

export const deleteRegExMaps = ({ ids }: db.DeleteRegExMapsInput) =>
  handleErrors(async () => await db.RegExMapModel.deleteMany({ _id: { $in: ids } }));

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

export const listRegExMaps = () =>
  handleErrors(async () =>
    (await db.RegExMapModel.find().lean()).map((r) => leanModelToJson<db.RegExMap>(r))
  );

export const removeTagsFromBatch = ({ batchId, tagIds }: db.RemoveTagsFromBatchInput) =>
  handleErrors(
    async () => await db.FileImportBatchModel.updateOne({ _id: batchId }, { $pullAll: { tagIds } })
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

export const updateRegExMaps = ({ regExMaps }: db.UpdateRegExMapsInput) =>
  handleErrors(() =>
    Promise.all(regExMaps.map((r) => db.RegExMapModel.updateOne({ _id: r.id }, { $set: r })))
  );
