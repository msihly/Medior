import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import checkDiskSpace from "check-disk-space";
import { AnyBulkWriteOperation } from "mongodb";
import * as actions from "medior/database/actions";
import * as models from "medior/_generated/models";
import { createFileFilterPipeline, CreateFileFilterPipelineInput } from "medior/database/actions";
import { leanModelToJson, makeAction, objectId, objectIds } from "medior/database/utils";
import { SortValue } from "medior/store";
import {
  CONSTANTS,
  dayjs,
  dirToFilePaths,
  getConfig,
  makePerfLog,
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

  const fileIdSet = new Set(args.fileIds);

  await Promise.all(
    collections.map((collection) => {
      const fileIdIndexes = collection.fileIdIndexes.filter(
        (fileIdIndex) => !fileIdSet.has(String(fileIdIndex.fileId))
      );
      if (!fileIdIndexes.length) return actions.deleteCollections({ ids: [collection.id] });
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
  return await checkDiskSpace(diskPath);
});

export const getFileByHash = makeAction(async ({ hash }: { hash: string }) =>
  leanModelToJson<models.FileSchema>(await models.FileModel.findOne({ hash }).lean())
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
    originalHash?: string;
    originalName: string;
    originalPath: string;
    path: string;
    size: number;
    tagIds: string[];
    thumbPaths: string[];
    videoCodec: string;
    width: number;
  }) => {
    const file = {
      ...args,
      dateModified: dayjs().toISOString(),
      isArchived: false,
      originalHash: args.originalHash ?? args.hash,
      path: args.path,
      rating: 0,
      tagIdsWithAncestors: await actions.deriveAncestorTagIds(args.tagIds),
    };

    const res = await models.FileModel.create(file);
    return { ...file, id: res._id.toString() };
  }
);

export const listDeletedFiles = makeAction(async () =>
  (await models.DeletedFileModel.find().lean()).map((f) =>
    leanModelToJson<models.DeletedFileSchema>(f)
  )
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

export const listFilesWithBrokenThumbs = makeAction(async () => {
  const { perfLog, perfLogTotal } = makePerfLog("[Thumbs]", true);

  const files = await models.FileModel.find({})
    .allowDiskUse(true)
    .select({ _id: 1, thumbPaths: 1 })
    .lean();

  perfLog(`Loaded files (${files.length})`);

  const brokenIds: string[] = [];

  // TODO: Find a feasible way of scanning massive storage locations
  const filePathSet = new Set(
    (
      await Promise.all(getConfig().db.fileStorage.locations.map((loc) => dirToFilePaths(loc)))
    ).flat()
  );

  perfLog(`Loaded filePathSet (${filePathSet.size})`);

  for (const file of files) {
    if (file.thumbPaths.some((t) => !filePathSet.has(t))) brokenIds.push(file._id.toString());
  }

  perfLogTotal("Done");
  return brokenIds;
});

export const listFilesWithBrokenVideoCodec = makeAction(async () => {
  const files = await models.FileModel.find({
    ext: { $in: CONSTANTS.VIDEO_TYPES.map((t) => `.${t}`) },
    $or: [{ videoCodec: { $exists: false } }, { videoCodec: "" }],
  })
    .allowDiskUse(true)
    .select({ _id: 1, path: 1 })
    .lean();

  return files.map((f) => ({ id: f._id.toString(), path: f.path }));
});

export const listSortedFileIds = makeAction(
  async (args: { ids: string[]; sortValue: SortValue }) => {
    const files = await models.FileModel.find({ _id: { $in: objectIds(args.ids) } })
      .sort({ [args.sortValue.key]: args.sortValue.isDesc ? -1 : 1 })
      .select({ _id: 1 })
      .lean();

    return files.map((f) => leanModelToJson<models.FileSchema>(f).id);
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

  await actions.regenCollAttrs({ fileIds: args.fileIds });
});

export const updateFile = makeAction(
  async ({ id, ...updates }: Partial<models.FileSchema> & { id: string }) =>
    await models.FileModel.updateOne({ _id: id }, updates)
);
