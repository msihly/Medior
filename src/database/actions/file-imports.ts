import {
  AddTagsToBatchInput,
  CompleteImportBatchInput,
  CreateImportBatchesInput,
  CreateRegExMapsInput,
  DeleteImportBatchInput,
  DeleteRegExMapsInput,
  FileImportBatchModel,
  RegExMap,
  RegExMapModel,
  RemoveTagsFromBatchInput,
  StartImportBatchInput,
  UpdateFileImportByPathInput,
  UpdateRegExMapsInput,
} from "database";
import { ImportBatchInput } from "store";
import { dayjs, handleErrors } from "utils";
import { leanModelToJson } from "./utils";

export const addTagsToBatch = ({ batchId, tagIds }: AddTagsToBatchInput) =>
  handleErrors(
    async () =>
      await FileImportBatchModel.updateOne(
        { _id: batchId },
        { $addToSet: { tagIds: { $each: tagIds } } }
      )
  );

export const completeImportBatch = ({ collectionId, id }: CompleteImportBatchInput) =>
  handleErrors(async () => {
    const completedAt = dayjs().toISOString();
    await FileImportBatchModel.updateOne({ _id: id }, { collectionId, completedAt });
    return completedAt;
  });

export const createImportBatches = (batches: CreateImportBatchesInput) =>
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

    const res = await FileImportBatchModel.insertMany(importBatches);
    if (res.length !== importBatches.length) throw new Error("Failed to create import batches");
  });

export const createRegExMaps = ({ regExMaps }: CreateRegExMapsInput) =>
  handleErrors(async () => {
    const res = await RegExMapModel.insertMany(regExMaps);
    return res;
  });

export const deleteAllImportBatches = () =>
  handleErrors(async () => await FileImportBatchModel.deleteMany({}));

export const deleteImportBatch = ({ id }: DeleteImportBatchInput) =>
  handleErrors(async () => await FileImportBatchModel.deleteOne({ _id: id }));

export const deleteRegExMaps = ({ ids }: DeleteRegExMapsInput) =>
  handleErrors(async () => await RegExMapModel.deleteMany({ _id: { $in: ids } }));

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

export const listRegExMaps = () =>
  handleErrors(async () =>
    (await RegExMapModel.find().lean()).map((r) => leanModelToJson<RegExMap>(r))
  );

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

export const updateRegExMaps = ({ regExMaps }: UpdateRegExMapsInput) =>
  handleErrors(() =>
    Promise.all(regExMaps.map((r) => RegExMapModel.updateOne({ _id: r.id }, { $set: r })))
  );
