import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson, objectId, objectIds } from "./utils";

const FACE_MIN_CONFIDENCE = 0.4;
const FACE_MODELS_PATH = app.isPackaged
  ? path.resolve(process.resourcesPath, "extraResources/face-models")
  : "src/face-models";
const VALID_TF_DECODE_IMAGE_EXTS = ["bmp", "gif", "jpg", "jpeg", "png"];

const createFilterPipeline = ({
  excludedTagIds,
  includeTagged,
  includeUntagged,
  isArchived,
  isSortDesc,
  optionalTagIds,
  requiredTagIdArrays,
  requiredTagIds,
  selectedImageTypes,
  selectedVideoTypes,
  sortKey,
}: db.CreateFilterPipelineInput) => {
  const enabledExts = Object.entries({
    ...selectedImageTypes,
    ...selectedVideoTypes,
  }).reduce((acc, [key, isEnabled]) => {
    if (isEnabled) acc.push(`.${key}`);
    return acc;
  }, [] as string[]);

  const sortDir = isSortDesc ? -1 : 1;

  const hasExcludedTags = excludedTagIds?.length > 0;
  const hasOptionalTags = optionalTagIds?.length > 0;
  const hasRequiredTags = requiredTagIds.length > 0;

  return {
    $match: {
      isArchived,
      ext: { $in: enabledExts },
      ...(hasExcludedTags || hasOptionalTags || hasRequiredTags || includeTagged || includeUntagged
        ? {
            tagIds: {
              ...(hasExcludedTags ? { $nin: objectIds(excludedTagIds) } : {}),
              ...(hasOptionalTags ? { $in: objectIds(optionalTagIds) } : {}),
              ...(hasRequiredTags ? { $all: objectIds(requiredTagIds) } : {}),
              ...(includeTagged ? { $ne: [] } : {}),
              ...(includeUntagged ? { $eq: [] } : {}),
            },
          }
        : {}),
        ...(requiredTagIdArrays.length > 0
        ? { $and: requiredTagIdArrays.map((ids) => ({ tagIds: { $in: objectIds(ids) } })) }
        : {}),
    },
    $sort: { [sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export const deleteFiles = ({ fileIds }: db.DeleteFilesInput) =>
  handleErrors(async () => {
    const collections = (
      await db.FileCollectionModel.find({
        fileIdIndexes: { $elemMatch: { fileId: { $in: fileIds } } },
      }).lean()
    ).map((c) => leanModelToJson<db.FileCollection>(c));

    await Promise.all(
      collections.map((collection) => {
        const fileIdIndexes = collection.fileIdIndexes.filter(
          (fileIdIndex) => !fileIds.includes(String(fileIdIndex.fileId))
        );

        if (!fileIdIndexes.length) return db.deleteCollection({ id: collection.id });
        return db.updateCollection({ fileIdIndexes, id: collection.id });
      })
    );

    await db.FileModel.deleteMany({ _id: { $in: fileIds } });

    socket.emit("filesDeleted", { fileIds });
  });

export const detectFaces = async ({ imagePath }: db.DetectFacesInput) =>
  handleErrors(async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
    const tf = await import("@tensorflow/tfjs-node-gpu");

    let buffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase().substring(1);
    if (!VALID_TF_DECODE_IMAGE_EXTS.includes(ext)) buffer = await sharp(buffer).png().toBuffer();

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

export const editFileTags = ({
  addedTagIds = [],
  batchId,
  fileIds,
  removedTagIds = [],
  withSub = true,
}: db.EditFileTagsInput) =>
  handleErrors(async () => {
    if (!fileIds.length) throw new Error("Missing fileIds in editFileTags");
    if (!addedTagIds.length && !removedTagIds.length)
      throw new Error("Missing updated tagIds in editFileTags");

    const dateModified = dayjs().toISOString();

    await Promise.all([
      addedTagIds.length > 0 &&
        db.FileModel.updateMany(
          { _id: { $in: fileIds } },
          { $addToSet: { tagIds: { $each: addedTagIds } }, dateModified }
        ),
      removedTagIds.length > 0 &&
        db.FileModel.updateMany(
          { _id: { $in: fileIds } },
          { $pullAll: { tagIds: removedTagIds }, dateModified }
        ),
    ]);

    if (batchId) {
      await Promise.all([
        addedTagIds.length > 0 &&
          db.FileImportBatchModel.updateMany(
            { _id: batchId },
            { $addToSet: { tagIds: { $each: addedTagIds } } }
          ),
        removedTagIds.length > 0 &&
          db.FileImportBatchModel.updateMany(
            { _id: batchId },
            { $pullAll: { tagIds: removedTagIds } }
          ),
      ]);
    }

    await db.recalculateTagCounts({ tagIds: [...new Set([...addedTagIds, ...removedTagIds])] });

    if (withSub) socket.emit("fileTagsUpdated", { addedTagIds, batchId, fileIds, removedTagIds });
  });

export const getFileByHash = ({ hash }: db.GetFileByHashInput) =>
  handleErrors(async () => leanModelToJson<db.File>(await db.FileModel.findOne({ hash }).lean()));

export const getShiftSelectedFiles = ({
  clickedId,
  clickedIndex,
  isSortDesc,
  selectedIds,
  sortKey,
  ...filterParams
}: db.GetShiftSelectedFilesInput) =>
  handleErrors(async () => {
    if (selectedIds.length === 0) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (selectedIds.length === 1 && selectedIds[0] === clickedId)
      return { idsToDeselect: [clickedId], idsToSelect: [] };

    const filterPipeline = createFilterPipeline({ ...filterParams, isSortDesc, sortKey });

    const getSelectedIndex = async (type: "first" | "last") => {
      const sortOp = isSortDesc ? "$gt" : "$lt";

      const selectedFiles = await db.FileModel.find({
        ...filterPipeline.$match,
        _id: { $in: objectIds(selectedIds) },
      }).sort(filterPipeline.$sort);

      if (!selectedFiles || selectedFiles.length === 0)
        throw new Error(`Failed to load selected files`);

      const selectedFile =
        type === "first" ? selectedFiles[0] : selectedFiles[selectedFiles.length - 1];

      const selectedFileIndex = await db.FileModel.countDocuments({
        ...filterPipeline.$match,
        $or: [
          { [sortKey]: selectedFile[sortKey], _id: { [sortOp]: selectedFile._id } },
          { [sortKey]: { [sortOp]: selectedFile[sortKey] } },
        ],
      });
      if (!(selectedFileIndex > -1)) throw new Error(`Failed to load ${type} selected index`);

      return selectedFileIndex;
    };

    const firstSelectedIndex = await getSelectedIndex("first");
    if (!(firstSelectedIndex > -1)) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (firstSelectedIndex === clickedIndex) return { idsToDeselect: [clickedId], idsToSelect: [] };

    const isFirstAfterClicked = firstSelectedIndex > clickedIndex;
    const lastSelectedIndex = isFirstAfterClicked ? await getSelectedIndex("last") : null;

    const endIndex = isFirstAfterClicked ? lastSelectedIndex : clickedIndex;
    const startIndex = isFirstAfterClicked ? clickedIndex : firstSelectedIndex;

    const limit = endIndex + 1;
    const skip = startIndex;

    const mainPipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      { $sort: filterPipeline.$sort },
      ...(limit > -1 ? [{ $limit: limit }] : []),
      ...(skip > -1 ? [{ $skip: skip }] : []),
      { $project: { _id: 1 } },
      { $group: { _id: null, filteredIds: { $push: "$_id" } } },
      {
        $addFields: {
          selectedIdsNotInFiltered: {
            $filter: {
              input: objectIds(selectedIds),
              as: "id",
              cond: { $not: { $in: ["$$id", "$filteredIds"] } },
            },
          },
          selectedIdsInFiltered: {
            $filter: {
              input: objectIds(selectedIds),
              as: "id",
              cond: { $in: ["$$id", "$filteredIds"] },
            },
          },
        },
      },
      {
        $addFields: {
          newSelectedIds:
            startIndex === endIndex
              ? []
              : isFirstAfterClicked
              ? { $slice: ["$filteredIds", 0, limit] }
              : { $slice: ["$filteredIds", 0, limit - skip] },
        },
      },
      {
        $addFields: {
          idsToDeselect: {
            $concatArrays: [
              "$selectedIdsNotInFiltered",
              {
                $filter: {
                  input: "$selectedIdsInFiltered",
                  as: "id",
                  cond: { $not: { $in: ["$$id", "$newSelectedIds"] } },
                },
              },
            ],
          },
          idsToSelect: {
            $filter: {
              input: "$newSelectedIds",
              as: "id",
              cond: { $not: { $in: ["$$id", objectIds(selectedIds)] } },
            },
          },
        },
      },
      { $project: { _id: 0, idsToDeselect: 1, idsToSelect: 1 } },
    ];

    const mainRes: {
      idsToDeselect: string[];
      idsToSelect: string[];
    } = (await db.FileModel.aggregate(mainPipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
    if (!mainRes) throw new Error("Failed to load shift selected file IDs");

    return mainRes;
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
}: db.ImportFileInput) =>
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

    const res = await db.FileModel.create(file);
    return { ...file, id: res._id.toString() };
  });

export const listFaceModels = ({ ids }: db.ListFaceModelsInput = {}) =>
  handleErrors(async () => {
    return (
      await db.FileModel.find({
        faceModels: { $exists: true, $ne: [] },
        ...(ids ? { _id: { $in: ids } } : {}),
      })
        .select({ _id: 1, faceModels: 1 })
        .lean()
    ).flatMap((file) => {
      return leanModelToJson<db.File>(file).faceModels.map((faceModel) => ({
        box: faceModel.box,
        descriptors: faceModel.descriptors,
        fileId: file._id.toString(),
        tagId: faceModel.tagId,
      }));
    });
  });

type ListFilesResult = db.File & { hasFaceModels: boolean };

export const listFiles = ({ ids, withFaceModels = false }: db.ListFilesInput = {}) =>
  handleErrors(async () => {
    const res: ListFilesResult[] = await db.FileModel.aggregate([
      { $match: ids ? { _id: { $in: objectIds(ids) } } : {} },
      ...(!withFaceModels
        ? [
            {
              $addFields: {
                hasFaceModels: {
                  $cond: {
                    if: { $gt: [{ $size: { $ifNull: ["$faceModels", []] } }, 0] },
                    then: true,
                    else: false,
                  },
                },
                id: "$_id",
              },
            },
            { $project: { faceModels: 0, _id: 0 } },
          ]
        : []),
    ]);

    return res;
  });

export const listFilesByTagIds = ({ tagIds }: db.ListFilesByTagIdsInput) =>
  handleErrors(async () => {
    return (await db.FileModel.find({ tagIds: { $in: tagIds } }).lean()).map((f) =>
      leanModelToJson<db.File>(f)
    );
  });

export const listFileIdsForCarousel = ({
  clickedId,
  ...filterParams
}: db.ListFileIdsForCarouselInput) =>
  handleErrors(async () => {
    const filterPipeline = createFilterPipeline(filterParams);

    const pipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      {
        $facet: {
          filteredIds: [
            { $sort: filterPipeline.$sort },
            { $limit: 2000 },
            { $project: { _id: 1 } },
          ],
        },
      },
    ];

    const res: {
      filteredIds: { _id: string }[];
    } = (await db.FileModel.aggregate(pipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
    if (!res) throw new Error("Failed to load filtered file IDs");

    return res.filteredIds.map((f) => f._id.toString());
  });

export const listFilteredFiles = ({ page, pageSize, ...filterParams }: db.ListFilteredFilesInput) =>
  handleErrors(async () => {
    const filterPipeline = createFilterPipeline(filterParams);
    const pipeline: PipelineStage[] = [
      { $match: filterPipeline.$match },
      {
        $facet: {
          files: [
            { $sort: filterPipeline.$sort },
            { $skip: Math.max(0, page - 1) * pageSize },
            { $limit: pageSize },
            { $addFields: { id: "$_id" } },
          ],
          totalDocuments: [{ $count: "count" }],
        },
      },
    ];

    const res: {
      files: db.File[];
      totalDocuments: { count: number }[];
    } = (await db.FileModel.aggregate(pipeline).allowDiskUse(true))?.[0];
    if (!res) throw new Error("Failed to load filtered file IDs");

    const totalDocuments = res.totalDocuments[0]?.count || 0;
    return { files: res.files, pageCount: Math.ceil(totalDocuments / pageSize) };
  });

export const loadFaceApiNets = async () =>
  handleErrors(async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceExpressionNet.loadFromDisk(FACE_MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_MODELS_PATH);
  });

export const setFileFaceModels = async ({ faceModels, id }: db.SetFileFaceModelsInput) =>
  handleErrors(async () => {
    const updates = { faceModels, dateModified: dayjs().toISOString() };
    await db.FileModel.findOneAndUpdate({ _id: id }, { $set: updates });
    socket.emit("filesUpdated", { fileIds: [id], updates });
  });

export const setFileIsArchived = ({ fileIds = [], isArchived }: db.SetFileIsArchivedInput) =>
  handleErrors(async () => {
    const updates = { isArchived };
    await db.FileModel.updateMany({ _id: { $in: fileIds } }, updates);

    if (isArchived) socket.emit("filesArchived", { fileIds });
    socket.emit("filesUpdated", { fileIds, updates });
  });

export const setFileRating = ({ fileIds = [], rating }: db.SetFileRatingInput) =>
  handleErrors(async () => {
    const updates = { rating, dateModified: dayjs().toISOString() };
    await db.FileModel.updateMany({ _id: { $in: fileIds } }, updates);
    socket.emit("filesUpdated", { fileIds, updates });
  });

export const updateFile = async ({ id, ...updates }: db.UpdateFileInput) =>
  handleErrors(async () => await db.FileModel.updateOne({ _id: id }, updates));
