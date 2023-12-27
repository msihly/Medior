import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import {
  AddTagsToFilesInput,
  DeleteFilesInput,
  DetectFacesInput,
  File,
  FileCollection,
  FileCollectionModel,
  FileModel,
  GetFileByHashInput,
  ImportFileInput,
  ListFaceModelsInput,
  ListFilesByTagIdsInput,
  ListFilesInput,
  OnFileTagsUpdatedInput,
  OnFilesArchivedInput,
  OnFilesDeletedInput,
  OnFilesUpdatedInput,
  RemoveTagFromAllFilesInput,
  RemoveTagsFromFilesInput,
  SetFileFaceModelsInput,
  SetFileIsArchivedInput,
  SetFileRatingInput,
  UpdateFileInput,
  deleteCollection,
  ListFilteredFileIdsInput,
  updateCollection,
} from "database";
import { dayjs, handleErrors, socket, trpc } from "utils";
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

export const listFilteredFileIds = ({
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
}: ListFilteredFileIdsInput) =>
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
        $and: [
          includeTagged ? { tagIds: { $ne: [] } } : {},
          includeUntagged ? { tagIds: { $eq: [] } } : {},
          includedAllTagIds?.length > 0 ? { tagIds: { $all: includedAllTagIds } } : {},
          includedAnyTagIds?.length > 0 ? { tagIds: { $in: includedAnyTagIds } } : {},
          excludedAnyTagIds?.length > 0 ? { tagIds: { $nin: excludedAnyTagIds } } : {},
        ],
      })
        .allowDiskUse(true)
        .select("_id")
        .sort({ [sortKey]: isSortDesc ? -1 : 1 })
        .lean()
    ).map((f) => f._id.toString());
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
