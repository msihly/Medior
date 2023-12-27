import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import mongoose, { PipelineStage } from "mongoose";
import {
  AddTagsToFilesInput,
  CreateFilterPipelineInput,
  deleteCollection,
  DeleteFilesInput,
  DetectFacesInput,
  File,
  FileCollection,
  FileCollectionModel,
  FileModel,
  GetFileByHashInput,
  GetShiftSelectedFilesInput,
  ImportFileInput,
  ListFaceModelsInput,
  ListFileIdsForCarouselInput,
  ListFilesByTagIdsInput,
  ListFilesInput,
  ListFilteredFileIdsInput,
  OnFilesArchivedInput,
  OnFilesDeletedInput,
  OnFilesUpdatedInput,
  OnFileTagsUpdatedInput,
  RemoveTagsFromFilesInput,
  SetFileFaceModelsInput,
  SetFileIsArchivedInput,
  SetFileRatingInput,
  updateCollection,
  UpdateFileInput,
} from "database";
import { centeredSlice, dayjs, handleErrors, socket, trpc, uniqueArrayFilter } from "utils";
import { leanModelToJson } from "./utils";

const FACE_MIN_CONFIDENCE = 0.4;
const FACE_MODELS_PATH = app.isPackaged
  ? path.resolve(process.resourcesPath, "extraResources/face-models")
  : "src/face-models";

export const addTagsToFiles = ({ fileIds = [], tagIds = [] }: AddTagsToFilesInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await FileModel.updateMany(
      { _id: { $in: fileIds } },
      { $addToSet: { tagIds: { $each: tagIds } }, dateModified }
    );
    return dateModified;
  });

const createFilterPipeline = ({
  excludedAnyTagIds,
  includedAllTagIds,
  includedAnyTagIds,
  includeTagged,
  includeUntagged,
  isArchived,
  selectedImageTypes,
  selectedVideoTypes,
}: CreateFilterPipelineInput) => {
  const enabledExts = Object.entries({
    ...selectedImageTypes,
    ...selectedVideoTypes,
  }).reduce((acc, [key, isEnabled]) => {
    if (isEnabled) acc.push(`.${key}`);
    return acc;
  }, [] as string[]);

  return {
    $match: {
      isArchived,
      ext: { $in: enabledExts },
      $and: [
        includeTagged ? { tagIds: { $ne: [] } } : {},
        includeUntagged ? { tagIds: { $eq: [] } } : {},
        includedAllTagIds?.length > 0
          ? {
              tagIds: {
                $all: includedAllTagIds.map((tagId) => new mongoose.Types.ObjectId(tagId)),
              },
            }
          : {},
        includedAnyTagIds?.length > 0
          ? {
              tagIds: {
                $in: includedAnyTagIds.map((tagId) => new mongoose.Types.ObjectId(tagId)),
              },
            }
          : {},
        excludedAnyTagIds?.length > 0
          ? {
              tagIds: {
                $nin: excludedAnyTagIds.map((tagId) => new mongoose.Types.ObjectId(tagId)),
              },
            }
          : {},
      ],
    },
  };
};

export const deleteFiles = ({ fileIds }: DeleteFilesInput) =>
  handleErrors(async () => {
    const collections = (
      await FileCollectionModel.find({
        fileIdIndexes: { $elemMatch: { fileId: { $in: fileIds } } },
      }).lean()
    ).map((c) => leanModelToJson<FileCollection>(c));

    await Promise.all(
      collections.map((collection) => {
        const fileIdIndexes = collection.fileIdIndexes.filter(
          (fileIdIndex) => !fileIds.includes(String(fileIdIndex.fileId))
        );

        if (!fileIdIndexes.length) return deleteCollection({ id: collection.id });
        return updateCollection({ fileIdIndexes, id: collection.id });
      })
    );

    await FileModel.deleteMany({ _id: { $in: fileIds } });
  });

export const detectFaces = async ({ imagePath }: DetectFacesInput) =>
  handleErrors(async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
    const tf = await import("@tensorflow/tfjs-node-gpu");
    const buffer = await fs.readFile(imagePath);
    const tensor = tf.node.decodeImage(buffer);

    try {
      const options = new faceapi.SsdMobilenetv1Options({ minConfidence: FACE_MIN_CONFIDENCE });
      const faces = await faceapi
        .detectAllFaces(tensor as any, options)
        .withFaceLandmarks()
        .withFaceExpressions()
        .withFaceDescriptors()
        .run();

      tf.dispose(tensor);
      return faces;
    } catch (err) {
      tf.dispose(tensor);
      throw new Error(err);
    }
  });

export const getFileByHash = ({ hash }: GetFileByHashInput) =>
  handleErrors(async () => leanModelToJson<File>(await FileModel.findOne({ hash }).lean()));

export const getShiftSelectedFiles = ({
  clickedId,
  excludedAnyTagIds,
  includedAllTagIds,
  includedAnyTagIds,
  includeTagged,
  includeUntagged,
  isArchived,
  isSortDesc,
  selectedIds,
  selectedImageTypes,
  selectedVideoTypes,
  sortKey,
}: GetShiftSelectedFilesInput) =>
  handleErrors(async () => {
    const pipeline: PipelineStage[] = [
      createFilterPipeline({
        excludedAnyTagIds,
        includedAllTagIds,
        includedAnyTagIds,
        includeTagged,
        includeUntagged,
        isArchived,
        selectedImageTypes,
        selectedVideoTypes,
      }),
      {
        $facet: {
          filteredFileIds: [
            { $sort: { [sortKey]: isSortDesc ? -1 : 1 } },
            { $group: { _id: null, filteredFileIds: { $push: "$_id" } } },
          ],
        },
      },
    ];

    const res: { filteredFileIds: { filteredFileIds: string[] }[] }[] = (
      await FileModel.aggregate(pipeline).allowDiskUse(true)
    ).flatMap((f) => f);
    if (!res) throw new Error("Failed to load filtered file IDs");

    const filteredFileIds = res[0].filteredFileIds[0].filteredFileIds.map((id) => id.toString());

    const clickedIndex = filteredFileIds.indexOf(clickedId);
    const firstIndex = filteredFileIds.indexOf(selectedIds[0]);
    const isFirstAfterClicked = firstIndex >= clickedIndex;
    const startIndex = isFirstAfterClicked ? clickedIndex : firstIndex;
    const endIndex = isFirstAfterClicked ? firstIndex : clickedIndex;
    const idsToSelect =
      startIndex === endIndex
        ? []
        : uniqueArrayFilter(filteredFileIds.slice(startIndex, endIndex + 1), selectedIds);
    /** Deselect the files before the clicked file if the first index is after it, or deselect the files after the clicked file if the first index is before it. */
    const idsToDeselect = selectedIds.filter(
      (id) =>
        (isFirstAfterClicked && filteredFileIds.indexOf(id) < clickedIndex) ||
        (!isFirstAfterClicked && filteredFileIds.indexOf(id) > clickedIndex)
    );

    return { idsToDeselect, idsToSelect };
  });

export const importFile = ({
  dateCreated,
  diffusionParams,
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
  handleErrors(async () => {
    const file = {
      dateCreated,
      dateModified: dayjs().toISOString(),
      diffusionParams,
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
    };

    const res = await FileModel.create(file);
    return { ...file, id: res._id.toString() };
  });

export const listFaceModels = ({ ids }: ListFaceModelsInput = {}) =>
  handleErrors(async () => {
    return (
      await FileModel.find({
        faceModels: { $exists: true, $ne: [] },
        ...(ids ? { _id: { $in: ids } } : {}),
      })
        .select({ _id: 1, faceModels: 1 })
        .lean()
    ).flatMap((file) => {
      return leanModelToJson<File>(file).faceModels.map((faceModel) => ({
        box: faceModel.box,
        descriptors: faceModel.descriptors,
        fileId: file._id.toString(),
        tagId: faceModel.tagId,
      }));
    });
  });

export const listFiles = ({ ids }: ListFilesInput = {}) =>
  handleErrors(async () => {
    return (await FileModel.find(ids ? { _id: { $in: ids } } : undefined).lean()).map((f) =>
      leanModelToJson<File>(f)
    );
  });

export const listFilesByTagIds = ({ tagIds }: ListFilesByTagIdsInput) =>
  handleErrors(async () => {
    return (await FileModel.find({ tagIds: { $in: tagIds } }).lean()).map((f) =>
      leanModelToJson<File>(f)
    );
  });

export const listFileIdsForCarousel = ({
  clickedId,
  excludedAnyTagIds,
  includedAllTagIds,
  includedAnyTagIds,
  includeTagged,
  includeUntagged,
  isArchived,
  isSortDesc,
  selectedImageTypes,
  selectedVideoTypes,
  sortKey,
}: ListFileIdsForCarouselInput) =>
  handleErrors(async () => {
    const pipeline: PipelineStage[] = [
      createFilterPipeline({
        excludedAnyTagIds,
        includedAllTagIds,
        includedAnyTagIds,
        includeTagged,
        includeUntagged,
        isArchived,
        selectedImageTypes,
        selectedVideoTypes,
      }),
      {
        $facet: {
          filteredFileIds: [
            { $sort: { [sortKey]: isSortDesc ? -1 : 1 } },
            { $group: { _id: null, filteredFileIds: { $push: "$_id" } } },
          ],
        },
      },
    ];

    const res: { filteredFileIds: { filteredFileIds: string[] }[] }[] = (
      await FileModel.aggregate(pipeline).allowDiskUse(true)
    ).flatMap((f) => f);
    if (!res) throw new Error("Failed to load filtered file IDs");

    const filteredFileIds = res[0].filteredFileIds[0].filteredFileIds.map((id) => id.toString());
    const selectedIds = centeredSlice(filteredFileIds, filteredFileIds.indexOf(clickedId), 2000);
    return selectedIds;
  });

export const listFilteredFileIds = ({
  excludedAnyTagIds,
  includedAllTagIds,
  includedAnyTagIds,
  includeTagged,
  includeUntagged,
  isArchived,
  isSortDesc,
  selectedFileIds,
  selectedImageTypes,
  selectedVideoTypes,
  sortKey,
  page,
  pageSize,
}: ListFilteredFileIdsInput) =>
  handleErrors(async () => {
    const pipeline: PipelineStage[] = [
      createFilterPipeline({
        excludedAnyTagIds,
        includedAllTagIds,
        includedAnyTagIds,
        includeTagged,
        includeUntagged,
        isArchived,
        selectedImageTypes,
        selectedVideoTypes,
      }),
      {
        $facet: {
          totalDocuments: [{ $count: "count" }],
          displayedIds: [
            { $sort: { [sortKey]: isSortDesc ? -1 : 1 } },
            { $skip: Math.max(0, page - 1) * pageSize },
            { $limit: pageSize },
            { $project: { _id: 1 } },
          ],
          ...(selectedFileIds?.length > 0
            ? {
                deselectedIds: [
                  {
                    $match: {
                      _id: { $nin: selectedFileIds.map((id) => new mongoose.Types.ObjectId(id)) },
                    },
                  },
                  { $project: { _id: 1 } },
                ],
              }
            : {}),
        },
      },
    ];

    const result: {
      totalDocuments: { count: number }[];
      displayedIds: { _id: string }[];
      deselectedIds?: { _id: string }[];
    } = (await FileModel.aggregate(pipeline).allowDiskUse(true))?.[0];

    if (!result) throw new Error("Failed to load filtered file IDs");

    const totalDocuments = result.totalDocuments[0]?.count || 0;
    const displayedIds = result.displayedIds.map((f) => f._id.toString());
    const deselectedIds = result.deselectedIds?.map((f) => f._id.toString()) || [];

    return { deselectedIds, displayedIds, pageCount: Math.ceil(totalDocuments / pageSize) };
  });

export const loadFaceApiNets = async () =>
  handleErrors(async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceExpressionNet.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_MODELS_PATH);
  });

export const onFilesArchived = async ({ fileIds }: OnFilesArchivedInput) =>
  handleErrors(async () => !!socket.emit("filesArchived", { fileIds }));

export const onFilesDeleted = async ({ fileIds }: OnFilesDeletedInput) =>
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

export const removeTagsFromFiles = ({ fileIds = [], tagIds = [] }: RemoveTagsFromFilesInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await FileModel.updateMany({ _id: { $in: fileIds } }, { $pullAll: { tagIds }, dateModified });
    return dateModified;
  });

export const setFileFaceModels = async ({ faceModels, id }: SetFileFaceModelsInput) =>
  handleErrors(async () => {
    const dateModified = dayjs().toISOString();
    await FileModel.findOneAndUpdate({ _id: id }, { $set: { faceModels, dateModified } });
    await trpc.onFilesUpdated.mutate({ fileIds: [id], updates: { faceModels, dateModified } });
    return dateModified;
  });

export const setFileIsArchived = ({ fileIds = [], isArchived }: SetFileIsArchivedInput) =>
  handleErrors(async () => await FileModel.updateMany({ _id: { $in: fileIds } }, { isArchived }));

export const setFileRating = ({ fileIds = [], rating }: SetFileRatingInput) =>
  handleErrors(async () => {
    const updates = { rating, dateModified: dayjs().toISOString() };
    await FileModel.updateMany({ _id: { $in: fileIds } }, updates);
    await trpc.onFilesUpdated.mutate({ fileIds, updates });
    return { fileIds, updates };
  });

export const updateFile = async ({ id, ...updates }: UpdateFileInput) =>
  handleErrors(async () => await FileModel.updateOne({ _id: id }, updates));
