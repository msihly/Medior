import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import checkDiskSpace from "check-disk-space";
import { AnyBulkWriteOperation } from "mongodb";
import { FilterQuery, PipelineStage } from "mongoose";
import * as actions from "medior/database/actions";
import * as models from "medior/_generated/models";
import { leanModelToJson, makeAction, objectId, objectIds } from "medior/database/utils";
import { SelectedImageTypes, SelectedVideoTypes } from "medior/store";
import {
  dayjs,
  LogicalOp,
  logicOpsToMongo,
  makePerfLog,
  setObj,
  sharp,
  socket,
} from "medior/utils";

const FACE_MIN_CONFIDENCE = 0.4;
const FACE_MODELS_PATH = app.isPackaged
  ? path.resolve(process.resourcesPath, "extraResources/face-models")
  : "medior/face-models";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
type CreateFileFilterPipelineInput = Parameters<typeof createFileFilterPipeline>[0];

const createFileFilterPipeline = (args: {
  dateCreatedEnd?: string;
  dateCreatedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedStart?: string;
  excludedDescTagIds: string[];
  excludedFileIds?: string[];
  excludedTagIds: string[];
  hasDiffParams: boolean;
  isArchived: boolean;
  isSortDesc: boolean;
  numOfTagsOp: LogicalOp | "";
  numOfTagsValue?: number;
  optionalTagIds: string[];
  requiredDescTagIds: string[];
  requiredTagIds: string[];
  selectedImageTypes: SelectedImageTypes;
  selectedVideoTypes: SelectedVideoTypes;
  sortKey: string;
}) => {
  const enabledExts = Object.entries({
    ...args.selectedImageTypes,
    ...args.selectedVideoTypes,
  }).reduce((acc, [key, isEnabled]) => {
    if (isEnabled) acc.push(`.${key}`);
    return acc;
  }, [] as string[]);

  const sortDir = args.isSortDesc ? -1 : 1;

  const hasExcludedTags = args.excludedTagIds?.length > 0;
  const hasExcludedDescTags = args.excludedDescTagIds?.length > 0;
  const hasNumOfTags = args.numOfTagsOp !== "" && args.numOfTagsValue !== undefined;
  const hasOptionalTags = args.optionalTagIds?.length > 0;
  const hasRequiredDescTags = args.requiredDescTagIds?.length > 0;
  const hasRequiredTags = args.requiredTagIds.length > 0;

  const $match: FilterQuery<models.FileSchema> = {
    isArchived: args.isArchived,
    ext: { $in: enabledExts },
  };

  if (args.dateCreatedEnd) setObj($match, ["dateCreated", "$lte"], args.dateCreatedEnd);
  if (args.dateCreatedStart) setObj($match, ["dateCreated", "$gte"], args.dateCreatedStart);
  if (args.dateModifiedEnd) setObj($match, ["dateModified", "$lte"], args.dateModifiedEnd);
  if (args.dateModifiedStart) setObj($match, ["dateModified", "$gte"], args.dateModifiedStart);
  if (args.excludedFileIds?.length)
    setObj($match, ["_id", "$nin"], objectIds(args.excludedFileIds));
  if (hasExcludedTags) setObj($match, ["tagIds", "$nin"], objectIds(args.excludedTagIds));
  if (hasOptionalTags) setObj($match, ["tagIds", "$in"], objectIds(args.optionalTagIds));
  if (hasRequiredTags) setObj($match, ["tagIds", "$all"], objectIds(args.requiredTagIds));
  if (hasExcludedDescTags)
    setObj($match, ["tagIdsWithAncestors", "$nin"], objectIds(args.excludedDescTagIds));
  if (hasRequiredDescTags)
    setObj($match, ["tagIdsWithAncestors", "$all"], objectIds(args.requiredDescTagIds));
  if (args.hasDiffParams)
    setObj(
      $match,
      ["$expr", "$and"],
      [{ $eq: [{ $type: "$diffusionParams" }, "string"] }, { $ne: ["$diffusionParams", ""] }]
    );
  if (hasNumOfTags)
    setObj(
      $match,
      ["$expr", logicOpsToMongo(args.numOfTagsOp)],
      [{ $size: "$tagIds" }, args.numOfTagsValue]
    );

  return {
    $match,
    $sort: { [args.sortKey]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
  };
};

export const listFileIdsByTagIds = makeAction(async (args: { tagIds: string[] }) => {
  return (
    await models.FileModel.find({ tagIds: { $in: objectIds(args.tagIds) } })
      .select({ _id: 1 })
      .lean()
  ).map((f) => f._id.toString());
});

export const regenFileTagAncestors = makeAction(
  async (args: { fileIds: string[]; tagIds?: never } | { fileIds?: never; tagIds: string[] }) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[regenFileTagAncestors]", true);

    const files = (
      await models.FileModel.find({
        ...(args.fileIds ? { _id: { $in: objectIds(args.fileIds) } } : {}),
        ...(args.tagIds
          ? {
              $or: [
                { tagIds: { $in: objectIds(args.tagIds) } },
                { tagIdsWithAncestors: { $in: objectIds(args.tagIds) } },
              ],
            }
          : {}),
      })
        .select({ _id: 1, tagIds: 1, tagIdsWithAncestors: 1 })
        .lean()
    ).map(leanModelToJson<models.FileSchema>);

    if (debug) perfLog(`Loaded files (${files.length})`);

    const ancestorsMap = await actions.makeAncestorIdsMap(files.flatMap((f) => f.tagIds));

    if (debug) perfLog(`Loaded ancestorsMap (${Object.keys(ancestorsMap).length})`);

    await Promise.all(
      files.map(async (f) => {
        const { hasUpdates, tagIdsWithAncestors } = actions.makeUniqueAncestorUpdates({
          ancestorsMap,
          oldTagIdsWithAncestors: f.tagIdsWithAncestors,
          tagIds: f.tagIds,
        });

        if (!hasUpdates) return;
        await models.FileModel.updateOne({ _id: f.id }, { $set: { tagIdsWithAncestors } });
      })
    );

    if (debug) perfLogTotal("Updated file tag ancestors");
  }
);

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const deleteFiles = makeAction(async (args: { fileIds: string[] }) => {
  const collections = (
    await models.FileCollectionModel.find({
      fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } },
    }).lean()
  ).map((c) => leanModelToJson<models.FileCollectionSchema>(c));

  await Promise.all(
    collections.map((collection) => {
      const fileIdIndexes = collection.fileIdIndexes.filter(
        (fileIdIndex) => !args.fileIds.includes(String(fileIdIndex.fileId))
      );

      if (!fileIdIndexes.length) return actions.deleteCollection({ id: collection.id });
      return actions.updateCollection({ fileIdIndexes, id: collection.id });
    })
  );

  const files = (
    await models.FileModel.find({ _id: { $in: args.fileIds } })
      .select({ _id: 1, hash: 1, tagIds: 1 })
      .lean()
  ).map((f) => leanModelToJson<models.FileSchema>(f));

  const fileHashes = files.map((f) => f.hash);
  const tagIds = [...new Set(files.flatMap((f) => f.tagIds))];

  const deletedHashesBulkOps = fileHashes.map((hash) => ({
    updateOne: {
      filter: { hash },
      update: { $setOnInsert: { hash } },
      upsert: true,
    },
  }));

  await Promise.all([
    models.FileModel.deleteMany({ _id: { $in: args.fileIds } }),
    models.DeletedFileModel.bulkWrite(deletedHashesBulkOps),
  ]);

  await Promise.all([
    actions.recalculateTagCounts({ tagIds }),
    actions.regenCollAttrs({ fileIds: args.fileIds }),
    ...tagIds.map((tagId) => actions.regenTagThumbPaths({ tagId })),
  ]);

  socket.emit("onFilesDeleted", { fileHashes, fileIds: args.fileIds });
});

export const detectFaces = makeAction(async ({ imagePath }: { imagePath: string }) => {
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

export const editFileTags = makeAction(
  async ({
    addedTagIds = [],
    batchId,
    fileIds,
    removedTagIds = [],
    withSub = true,
  }: {
    addedTagIds?: string[];
    batchId?: string;
    fileIds: string[];
    removedTagIds?: string[];
    withSub?: boolean;
  }) => {
    if (!fileIds.length) throw new Error("Missing fileIds in editFileTags");
    if (!addedTagIds.length && !removedTagIds.length)
      throw new Error("Missing updated tagIds in editFileTags");

    const dateModified = dayjs().toISOString();
    const fileBulkWriteOps: AnyBulkWriteOperation<models.FileSchema>[] = [];
    const fileImportBatchBulkWriteOps: AnyBulkWriteOperation<models.FileImportBatchSchema>[] = [];

    if (addedTagIds.length > 0) {
      fileBulkWriteOps.push({
        updateMany: {
          filter: { _id: objectIds(fileIds) },
          update: { $addToSet: { tagIds: { $each: addedTagIds } }, dateModified },
        },
      });

      if (batchId)
        fileImportBatchBulkWriteOps.push({
          updateMany: {
            filter: { _id: objectId(batchId) },
            update: { $addToSet: { tagIds: { $each: addedTagIds } } },
          },
        });
    }

    if (removedTagIds.length > 0) {
      fileBulkWriteOps.push({
        updateMany: {
          filter: { _id: objectIds(fileIds) },
          update: { $pullAll: { tagIds: removedTagIds }, dateModified },
        },
      });

      if (batchId)
        fileImportBatchBulkWriteOps.push({
          updateMany: {
            filter: { _id: objectId(batchId) },
            update: { $pullAll: { tagIds: removedTagIds } },
          },
        });
    }

    await Promise.all([
      fileBulkWriteOps.length > 0 ? models.FileModel.bulkWrite(fileBulkWriteOps) : null,
      fileImportBatchBulkWriteOps.length > 0
        ? models.FileImportBatchModel.bulkWrite(fileImportBatchBulkWriteOps)
        : null,
    ]);

    await regenFileTagAncestors({ fileIds });

    const changedTagIds = [...new Set([...addedTagIds, ...removedTagIds])];
    await Promise.all([
      actions.recalculateTagCounts({ tagIds: changedTagIds, withSub }),
      actions.regenCollAttrs({ fileIds }),
      ...changedTagIds.map((tagId) => actions.regenTagThumbPaths({ tagId })),
    ]);

    if (withSub) socket.emit("onFileTagsUpdated", { addedTagIds, batchId, fileIds, removedTagIds });
  }
);

export const getDeletedFile = makeAction(async ({ hash }: { hash: string }) =>
  leanModelToJson<models.DeletedFileSchema>(await models.DeletedFileModel.findOne({ hash }).lean())
);

export const getDiskStats = makeAction(async ({ diskPath }: { diskPath: string }) => {
  if (!diskPath || !(await fs.stat(diskPath).catch(() => null)))
    throw new Error("Invalid disk path");
  return await checkDiskSpace(diskPath);
});

export const getFileByHash = makeAction(async ({ hash }: { hash: string }) =>
  leanModelToJson<models.FileSchema>(await models.FileModel.findOne({ hash }).lean())
);

export const getShiftSelectedFiles = makeAction(
  async ({
    clickedId,
    clickedIndex,
    isSortDesc,
    selectedIds,
    sortKey,
    ...filterParams
  }: CreateFileFilterPipelineInput & {
    clickedId: string;
    clickedIndex: number;
    selectedIds: string[];
  }) => {
    if (selectedIds.length === 0) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (selectedIds.length === 1 && selectedIds[0] === clickedId)
      return { idsToDeselect: [clickedId], idsToSelect: [] };

    const filterPipeline = createFileFilterPipeline({ ...filterParams, isSortDesc, sortKey });

    const getSelectedIndex = async (type: "first" | "last") => {
      const sortOp = isSortDesc ? "$gt" : "$lt";

      const selectedFiles = await models.FileModel.find({
        ...filterPipeline.$match,
        _id: { $in: objectIds(selectedIds) },
      }).sort(filterPipeline.$sort);

      if (!selectedFiles || selectedFiles.length === 0)
        throw new Error(`Failed to load selected files`);

      const selectedFile =
        type === "first" ? selectedFiles[0] : selectedFiles[selectedFiles.length - 1];

      const selectedFileIndex = await models.FileModel.countDocuments({
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
    } = (await models.FileModel.aggregate(mainPipeline).allowDiskUse(true)).flatMap((f) => f)?.[0];
    if (!mainRes) throw new Error("Failed to load shift selected file IDs");

    return mainRes;
  }
);

export const importFile = makeAction(
  async (args: {
    dateCreated: string;
    diffusionParams: string;
    duration: number;
    ext: string;
    frameRate: number;
    hash: string;
    height: number;
    originalName: string;
    originalPath: string;
    path: string;
    size: number;
    tagIds: string[];
    thumbPaths: string[];
    width: number;
  }) => {
    const file = {
      ...args,
      dateModified: dayjs().toISOString(),
      isArchived: false,
      originalHash: args.hash,
      path: args.path,
      rating: 0,
      tagIdsWithAncestors: await actions.deriveAncestorTagIds(args.tagIds),
    };

    const res = await models.FileModel.create(file);
    return { ...file, id: res._id.toString() };
  }
);

export const listDeletedFiles = makeAction(async () =>
  (await models.DeletedFileModel.find().lean()).map((f) => leanModelToJson<models.DeletedFileSchema>(f))
);

export const listFaceModels = makeAction(async ({ ids }: { ids?: string[] } = {}) => {
  return (
    await models.FileModel.find({
      faceModels: { $exists: true, $ne: [] },
      ...(ids ? { _id: { $in: ids } } : {}),
    })
      .select({ _id: 1, faceModels: 1 })
      .lean()
  ).flatMap((file) => {
    return leanModelToJson<models.FileSchema>(file).faceModels.map((faceModel) => ({
      box: faceModel.box,
      descriptors: faceModel.descriptors,
      fileId: file._id.toString(),
      tagId: faceModel.tagId,
    }));
  });
});

export const listFilesByTagIds = makeAction(async ({ tagIds }: { tagIds: string[] }) => {
  return (await models.FileModel.find({ tagIds: { $in: tagIds } }).lean()).map((f) =>
    leanModelToJson<models.FileSchema>(f)
  );
});

export const listFileIdsForCarousel = makeAction(
  async ({
    page,
    pageSize,
    ...filterParams
  }: CreateFileFilterPipelineInput & {
    page: number;
    pageSize: number;
  }) => {
    const filterPipeline = createFileFilterPipeline(filterParams);

    const files = await models.FileModel.find(filterPipeline.$match)
      .sort(filterPipeline.$sort)
      .skip(Math.max(0, Math.max(0, page - 1) * pageSize - 500))
      .limit(1001)
      .allowDiskUse(true)
      .select({ _id: 1 });

    return files.map((f) => f._id.toString());
  }
);

export const listFilePaths = makeAction(async () => {
  return (await models.FileModel.find().select({ _id: 1, path: 1 }).lean()).map((f) => ({
    id: f._id.toString(),
    path: f.path,
  }));
});

export const listFilteredFiles = makeAction(
  async ({
    page,
    pageSize,
    ...filterParams
  }: CreateFileFilterPipelineInput & {
    page: number;
    pageSize: number;
  }) => {
    const filterPipeline = createFileFilterPipeline(filterParams);

    const [files, totalDocuments] = await Promise.all([
      models.FileModel.find(filterPipeline.$match)
        .sort(filterPipeline.$sort)
        .skip(Math.max(0, page - 1) * pageSize)
        .limit(pageSize)
        .allowDiskUse(true)
        .lean(),
      models.FileModel.countDocuments(filterPipeline.$match),
    ]);

    if (!files || !(totalDocuments > -1)) throw new Error("Failed to load filtered file IDs");

    return {
      files: files.map((f) => leanModelToJson<models.FileSchema>(f)),
      pageCount: Math.ceil(totalDocuments / pageSize),
    };
  }
);

export const loadFaceApiNets = makeAction(async () => {
  const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(FACE_MODELS_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(FACE_MODELS_PATH);
  await faceapi.nets.faceExpressionNet.loadFromDisk(FACE_MODELS_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_MODELS_PATH);
});

export const relinkFiles = makeAction(
  async (args: { filesToRelink: { id: string; path: string }[] }) => {
    const oldFiles = (
      await models.FileModel.find({
        _id: { $in: objectIds(args.filesToRelink.map((f) => f.id)) },
      })
        .select({ _id: 1, path: 1, thumbPaths: 1 })
        .lean()
    ).map(leanModelToJson<{ id: string; path: string; thumbPaths: string[] }>);

    const filesToRelinkMap = new Map(args.filesToRelink.map((f) => [f.id, f.path]));
    const oldThumbsMap = new Map(oldFiles.map((f) => [f.id, f.thumbPaths]));
    const newFilesMap = new Map<string, { path: string; thumbPaths: string[] }>();

    oldFiles.forEach((f) => {
      const oldThumbs = oldThumbsMap.get(f.id);
      const newPath = filesToRelinkMap.get(f.id);
      const newThumbPaths =
        oldThumbs.length > 0
          ? oldThumbs.map((thumbPath) =>
              path.resolve(
                path.dirname(newPath),
                path.basename(thumbPath, path.extname(thumbPath)),
                ".jpg"
              )
            )
          : [];

      newFilesMap.set(f.id, { path: newPath, thumbPaths: newThumbPaths });
    });

    const fileRes = await models.FileModel.bulkWrite(
      [...newFilesMap].map(([id, { path, thumbPaths }]) => ({
        updateOne: {
          filter: { _id: objectId(id) },
          update: { $set: { path, thumbPaths } },
        },
      }))
    );

    if (fileRes.modifiedCount !== fileRes.matchedCount)
      throw new Error(`Failed to bulk write relinked file: ${JSON.stringify(fileRes, null, 2)}`);

    const fileIds = [...newFilesMap.keys()];
    const collRes = await actions.regenCollAttrs({ fileIds });
    if (!collRes.success) throw new Error(`Failed to update collections: ${collRes.error}`);

    const importBatches = (
      await models.FileImportBatchModel.find({
        imports: { $elemMatch: { fileId: { $in: objectIds(fileIds) } } },
      }).lean()
    ).map(leanModelToJson<models.FileImportBatchSchema>);

    const importsRes = await models.FileImportBatchModel.bulkWrite(
      importBatches.map((importBatch) => ({
        updateOne: {
          filter: { _id: objectId(importBatch.id) },
          update: {
            $set: {
              imports: importBatch.imports.map((fileImport) => {
                if (!fileIds.includes(fileImport.fileId)) return fileImport;
                return { ...fileImport, ...newFilesMap.get(fileImport.fileId) };
              }),
            },
          },
        },
      }))
    );

    if (importsRes.modifiedCount !== importBatches.length)
      throw new Error("Failed to bulk write relinked file imports");
  }
);

export const setFileFaceModels = makeAction(
  async (args: {
    faceModels: {
      box: { height: number; width: number; x: number; y: number };
      /** JSON representation of Float32Array[] */
      descriptors: string;
      fileId: string;
      tagId: string;
    }[];
    id: string;
  }) => {
    const updates = { faceModels: args.faceModels, dateModified: dayjs().toISOString() };
    await models.FileModel.findOneAndUpdate({ _id: args.id }, { $set: updates });
    socket.emit("onFilesUpdated", { fileIds: [args.id], updates });
  }
);

export const setFileIsArchived = makeAction(
  async (args: { fileIds: string[]; isArchived: boolean }) => {
    const updates = { isArchived: args.isArchived };
    await models.FileModel.updateMany({ _id: { $in: args.fileIds } }, updates);

    if (args.isArchived) socket.emit("onFilesArchived", { fileIds: args.fileIds });
    socket.emit("onFilesUpdated", { fileIds: args.fileIds, updates });
  }
);

export const setFileRating = makeAction(async (args: { fileIds: string[]; rating: number }) => {
  const updates = { rating: args.rating, dateModified: dayjs().toISOString() };
  await models.FileModel.updateMany({ _id: { $in: args.fileIds } }, updates);
  socket.emit("onFilesUpdated", { fileIds: args.fileIds, updates });

  await actions.regenCollRating(args.fileIds);
});

export const updateFile = makeAction(
  async ({ id, ...updates }: Partial<models.FileSchema> & { id: string }) =>
    await models.FileModel.updateOne({ _id: id }, updates)
);
