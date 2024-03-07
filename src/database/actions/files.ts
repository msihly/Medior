import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { FilterQuery, PipelineStage } from "mongoose";
import * as db from "database";
import { dayjs, handleErrors, socket } from "utils";
import { leanModelToJson, objectIds } from "./utils";

const FACE_MIN_CONFIDENCE = 0.4;
const FACE_MODELS_PATH = app.isPackaged
  ? path.resolve(process.resourcesPath, "extraResources/face-models")
  : "src/face-models";

/* ---------------------------- HELPER FUNCTIONS ---------------------------- */
const createFileFilterPipeline = ({
  excludedDescTagIds,
  excludedFileIds,
  excludedTagIds,
  includeTagged,
  includeUntagged,
  isArchived,
  isSortDesc,
  optionalTagIds,
  requiredDescTagIds,
  requiredTagIds,
  selectedImageTypes,
  selectedVideoTypes,
  sortKey,
}: db.CreateFileFilterPipelineInput) => {
  const enabledExts = Object.entries({
    ...selectedImageTypes,
    ...selectedVideoTypes,
  }).reduce((acc, [key, isEnabled]) => {
    if (isEnabled) acc.push(`.${key}`);
    return acc;
  }, [] as string[]);

  const sortDir = isSortDesc ? -1 : 1;

  const hasExcludedTags = excludedTagIds?.length > 0;
  const hasExcludedDescTags = excludedDescTagIds?.length > 0;
  const hasOptionalTags = optionalTagIds?.length > 0;
  const hasRequiredDescTags = requiredDescTagIds?.length > 0;
  const hasRequiredTags = requiredTagIds.length > 0;

  return {
    $match: {
      isArchived,
      ext: { $in: enabledExts },
      ...(excludedFileIds?.length > 0 ? { _id: { $nin: objectIds(excludedFileIds) } } : {}),
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
      ...(hasExcludedDescTags || hasRequiredDescTags
        ? {
            tagIdsWithAncestors: {
              ...(hasExcludedDescTags ? { $nin: objectIds(excludedDescTagIds) } : {}),
              ...(hasRequiredDescTags ? { $all: objectIds(requiredDescTagIds) } : {}),
            },
          }
        : {}),
    },
    $sort: { [sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export const regenFileTagAncestors = async (tagIdsFilter: FilterQuery<db.File>) =>
  handleErrors(async () => {
    const files = (await db.FileModel.find(tagIdsFilter).select({ _id: 1, tagIds: 1 }).lean()).map(
      (r) => leanModelToJson<db.File>(r)
    );

    await Promise.all(
      files.map(async (file) => {
        const tagIdsWithAncestors = await db.deriveTagIdsWithAncestors(file.tagIds);
        await db.FileModel.updateOne(
          { _id: file.id },
          { $set: { tagIdsWithAncestors, dateModified: dayjs().toISOString() } }
        );
      })
    );
  });

/* ------------------------------ API ENDPOINTS ----------------------------- */
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

    const fileHashes = (
      await db.FileModel.find({ _id: { $in: fileIds } })
        .select({ _id: 1, hash: 1 })
        .lean()
    ).map((f) => leanModelToJson<db.File>(f).hash);

    const deletedHashesBulkOps = fileHashes.map((hash) => ({
      updateOne: {
        filter: { hash },
        update: { $setOnInsert: { hash } },
        upsert: true,
      },
    }));

    await Promise.all([
      db.FileModel.deleteMany({ _id: { $in: fileIds } }),
      db.DeletedFileModel.bulkWrite(deletedHashesBulkOps),
    ]);

    socket.emit("filesDeleted", { fileHashes, fileIds });
  });

export const detectFaces = async ({ imagePath }: db.DetectFacesInput) =>
  handleErrors(async () => {
    const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
    const tf = await import("@tensorflow/tfjs-node-gpu");

    let buffer: Buffer;

    try {
      buffer = await fs.readFile(imagePath);
      buffer = await sharp(buffer).png().toBuffer();
    } catch (err) {
      throw new Error(`Failed to convert image to buffer: ${err.message}`);
    }

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
      batchId &&
        addedTagIds.length > 0 &&
        db.FileImportBatchModel.updateMany(
          { _id: batchId },
          { $addToSet: { tagIds: { $each: addedTagIds } } }
        ),
      batchId &&
        removedTagIds.length > 0 &&
        db.FileImportBatchModel.updateMany(
          { _id: batchId },
          { $pullAll: { tagIds: removedTagIds } }
        ),
    ]);

    const updatedTagIds = [...new Set([...addedTagIds, ...removedTagIds])];

    await Promise.all([
      regenFileTagAncestors({ tagIds: { $in: updatedTagIds } }),
      db.recalculateTagCounts({ tagIds: updatedTagIds }),
    ]);

    if (withSub) socket.emit("fileTagsUpdated", { addedTagIds, batchId, fileIds, removedTagIds });
  });

export const getDeletedFile = ({ hash }: db.GetDeletedFileInput) =>
  handleErrors(async () =>
    leanModelToJson<db.DeletedFile>(await db.DeletedFileModel.findOne({ hash }).lean())
  );

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

    const filterPipeline = createFileFilterPipeline({ ...filterParams, isSortDesc, sortKey });

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
  tagIdsWithAncestors,
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
      tagIdsWithAncestors,
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

type ListFilesResult = db.File & { _id: string; hasFaceModels: boolean };

export const listFiles = ({
  ids,
  withFaceModels = false,
  withHasFaceModels = false,
}: db.ListFilesInput = {}) =>
  handleErrors(async () => {
    const res: ListFilesResult[] = await db.FileModel.aggregate([
      { $match: ids ? { _id: { $in: objectIds(ids) } } : {} },
      ...(withHasFaceModels
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
              },
            },
            { $project: { faceModels: 0 } },
          ]
        : !withFaceModels
        ? [{ $project: { faceModels: 0 } }]
        : []),
    ]);

    return res.map((r) => ({ ...r, id: r._id.toString() }));
  });

export const listDeletedFiles = () =>
  handleErrors(async () => {
    return (await db.DeletedFileModel.find().lean()).map((f) => leanModelToJson<db.DeletedFile>(f));
  });

export const listFilesByTagIds = ({ tagIds }: db.ListFilesByTagIdsInput) =>
  handleErrors(async () => {
    return (await db.FileModel.find({ tagIds: { $in: tagIds } }).lean()).map((f) =>
      leanModelToJson<db.File>(f)
    );
  });

export const listFileIdsForCarousel = ({
  page,
  pageSize,
  ...filterParams
}: db.ListFileIdsForCarouselInput) =>
  handleErrors(async () => {
    const filterPipeline = createFileFilterPipeline(filterParams);

    const files = await db.FileModel.find(filterPipeline.$match)
      .sort(filterPipeline.$sort)
      .skip(Math.max(0, Math.max(0, page - 1) * pageSize - 500))
      .limit(1001)
      .allowDiskUse(true)
      .select({ _id: 1 });

    return files.map((f) => f._id.toString());
  });

export const listFilteredFiles = ({ page, pageSize, ...filterParams }: db.ListFilteredFilesInput) =>
  handleErrors(async () => {
    const filterPipeline = createFileFilterPipeline(filterParams);

    const [files, totalDocuments] = await Promise.all([
      db.FileModel.find(filterPipeline.$match)
        .sort(filterPipeline.$sort)
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      db.FileModel.countDocuments(filterPipeline.$match),
    ]);

    if (!files || !(totalDocuments > -1)) throw new Error("Failed to load filtered file IDs");

    return {
      files: files.map((f) => leanModelToJson<db.File>(f)),
      pageCount: Math.ceil(totalDocuments / pageSize),
    };
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
