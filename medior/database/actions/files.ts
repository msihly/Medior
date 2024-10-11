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
  deleteFile,
  genFileInfo,
  logToFile,
  // getConfig,
  makePerfLog,
  PromiseQueue,
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
    dateModified?: string;
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
    thumb: models.FileImportBatchSchema["imports"][number]["thumb"];
    videoCodec: string;
    width: number;
  }) => {
    const file = {
      ...args,
      dateModified: args.dateModified ?? dayjs().toISOString(),
      isArchived: false,
      originalHash: args.originalHash ?? args.hash,
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

export const repairThumbs = makeAction(async () => {
  const { perfLog, perfLogTotal } = makePerfLog("[repairThumbs]", true);
  const errorLog = async (...args: any[]) => logToFile("error", ["repairThumbs", ...args]);

  /* ---------------------------------- FILES --------------------------------- */
  const chunkSize = 1000;
  const thumbMap = new Map<string, models.FileSchema["thumb"]>();

  const getFilesWithThumbPaths = async () =>
    (
      await models.FileModel.find({ thumbPaths: { $exists: true } }, null, { strict: false })
        .limit(chunkSize)
        .allowDiskUse(true)
        .lean()
    ).map((f) =>
      leanModelToJson<models.FileSchema & { thumbPaths: string[] }>({
        ...f,
        // @ts-expect-error
        thumbPaths: f.thumbPaths,
      })
    );

  const getTotalFilesWithThumbPaths = async () => {
    const res: { total: number } = (
      await models.FileModel.aggregate([
        { $match: { thumbPaths: { $exists: true } } },
        { $count: "total" },
      ]).allowDiskUse(true)
    ).flatMap((r) => r)[0];
    return res.total;
  };

  const regenThumbs = async (file: models.FileSchema) => {
    const info = await genFileInfo({ file, filePath: file.path, hash: file.hash });
    thumbMap.set(file.id, info.thumb);
    const res = await updateFile({ id: file.id, thumb: info.thumb });
    if (!res.success) throw new Error(`Failed to update file: ${res.error}`);
  };

  const totalCount = await getTotalFilesWithThumbPaths();
  perfLog(`Total files to process: ${totalCount}`);

  let hasThumbPaths = false;
  let hasMorePages = true;
  let iteration = 0;
  while (hasMorePages) {
    iteration++;
    const filesWithThumbPaths = await getFilesWithThumbPaths();
    perfLog(
      `Iteration ${iteration}: Found ${filesWithThumbPaths.length} files with old 'thumbPaths'`
    );

    if (!filesWithThumbPaths.length) hasMorePages = false;
    else {
      hasThumbPaths = true;

      const filesWithThumbPathsMap = new Map<string, models.FileSchema & { thumbPaths: string[] }>(
        filesWithThumbPaths.map((f) => [f.id, f])
      );
      const files = [...filesWithThumbPathsMap.values()];
      filesWithThumbPaths.forEach((f) => thumbMap.set(f.id, null));

      const processedFileIds: string[] = [];
      let idsToRegenThumb: string[] = [];
      let idsToUnset: string[] = [];
      let deletedThumbCount = 0;
      let skippedThumbCount = 0;

      for (const file of files) {
        if (file.thumbPaths.length === 1) {
          // TODO: Update image's file.thumb without regenerating
        } else {
          for (const t of file.thumbPaths) {
            const res = await deleteFile(t);
            if (!res.success) throw new Error(res.error);
            if (res.data) deletedThumbCount++;
            else skippedThumbCount++;
          }
        }

        processedFileIds.push(file.id);
        idsToUnset.push(file.id);
        if (!file.thumb?.path) idsToRegenThumb.push(file.id);

        if (processedFileIds.length % chunkSize === 0) {
          try {
            perfLog(
              `Processed files: ${processedFileIds.length + chunkSize * (iteration - 1)} / ${totalCount}. Deleted thumbs: ${deletedThumbCount}. Skipped thumbs: ${skippedThumbCount}. File IDs to Regen Thumb: ${idsToRegenThumb.length}. File IDs to Unset: ${idsToUnset.length}.`
            );

            for (const fileId of idsToRegenThumb) {
              try {
                await regenThumbs(filesWithThumbPathsMap.get(fileId));
              } catch (err) {
                errorLog(`Failed to regen thumb for file ${fileId}`);
              }
            }
            perfLog(`Regenerated 'thumb' for ${idsToRegenThumb.length} files`);

            const res = await models.FileModel.updateMany(
              { _id: idsToUnset },
              { $unset: { thumbPaths: "" } },
              { strict: false }
            );
            if (res.modifiedCount !== idsToUnset.length)
              errorLog(`Failed to unset 'thumbPaths': ${JSON.stringify(res, null, 2)}`);
            perfLog(`Removed 'thumbPaths' from ${res.modifiedCount} files`);
          } catch (err) {
            perfLog(`Failed to delete 'thumbPaths' and regenerate 'thumb': ${err.message}`);
          } finally {
            idsToRegenThumb = [];
            idsToUnset = [];
          }
        }
      }

      perfLog(`Deleted ${deletedThumbCount} old thumb paths`);
    }
  }

  const filesWithoutThumb = (
    await models.FileModel.find({ thumb: { $exists: false } })
      .allowDiskUse(true)
      .lean()
  ).map(leanModelToJson<models.FileSchema>);
  perfLog(`Found ${filesWithoutThumb.length} files without 'thumb'`);

  if (filesWithoutThumb?.length) {
    // filesWithoutThumb.forEach((f) => thumbGenQueue.add(async () => await regenThumbs(f)));
    // await thumbGenQueue.resolve();

    for (const file of filesWithoutThumb) {
      // const animated = animatedRegEx.test(file.ext);
      // const queue = animated ? thumbGenVideoQueue : thumbGenPhotoQueue;
      // queue.add(async () => await regenThumbs(file));
      await regenThumbs(file);
    }

    // await thumbGenPhotoQueue.resolve();
    // await thumbGenVideoQueue.resolve();
    perfLog("Generated 'thumb' for files without 'thumb'");
  }

  if (!hasThumbPaths && !filesWithoutThumb?.length) {
    perfLogTotal("No files with 'thumbPaths' found");
    return { collectionCount: 0, fileCount: 0, importCount: 0, tagCount: 0 };
  }

  /* ----------------------------- IMPORT BATCHES ----------------------------- */
  /*
  const importBatches = (
    await models.FileImportBatchModel.find({ "imports.$.fileId": [...thumbMap.keys()] }).lean()
  ).map((i) => leanModelToJson<models.FileImportBatchSchema>(i));
  perfLog(`Found ${importBatches.length} import batches with affected files`);

  if (importBatches.length > 0) {
    const res = await models.FileImportBatchModel.bulkWrite(
      importBatches.map((importBatch) => ({
        updateOne: {
          filter: { _id: objectId(importBatch.id) },
          update: {
            $unset: { thumbPaths: "" },
            $set: {
              imports: importBatch.imports.map((fileImport) => {
                if (!thumbPathsMap.has(fileImport.fileId)) return fileImport;
                return { ...fileImport, thumbPath: thumbPathMap.get(fileImport.fileId) };
              }),
            },
          },
        },
      }))
    );
    perfLog("Replaced 'thumbPaths' with 'thumb' on affected imports");
    if (res.modifiedCount !== importBatches.length)
      throw new Error(`Failed to bulk write imports: ${JSON.stringify(res)}`);
  }
  */

  /* ------------------------------- COLLECTIONS ------------------------------ */
  const collections = (
    await models.FileCollectionModel.find({ thumbPaths: { $exists: true } })
      .allowDiskUse(true)
      .lean()
  ).map(leanModelToJson<models.FileCollectionSchema>);
  perfLog(`Found ${collections.length} collections with old 'thumbPaths'`);

  if (collections.length > 0) {
    const res = await actions.regenCollAttrs({ collIds: collections.map((c) => c.id) });
    perfLog("Regenerated attributes for affected collections");
    if (!res.success) throw new Error(`Failed to update collections: ${res.error}`);
  }

  /* ---------------------------------- TAGS ---------------------------------- */
  const tags = (
    await models.TagModel.find({ thumbPaths: { $exists: true } })
      .allowDiskUse(true)
      .lean()
  ).map(leanModelToJson<models.TagSchema>);
  perfLog(`Found ${tags.length} tags with old 'thumbPaths'`);

  if (tags.length > 0) {
    const tagQueue = new PromiseQueue({ concurrency: 10 });
    tags.forEach((tag) =>
      tagQueue.add(async () => await actions.regenTagThumbPaths({ tagId: tag.id }))
    );
    await tagQueue.resolve();
    perfLog("Regenerated 'thumb' for affected tags");
  }

  perfLogTotal("Repaired all thumbs");
  return {
    collectionCount: collections.length,
    fileCount: thumbMap.size,
    // importCount: importBatches.length,
    tagCount: tags.length,
  };
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
      }).lean()
    ).map(leanModelToJson<models.FileSchema>);

    const filesToRelinkMap = new Map(args.filesToRelink.map((f) => [f.id, f.path]));
    const oldThumbsMap = new Map(oldFiles.map((f) => [f.id, f.thumb.path]));
    const newFilesMap = new Map<string, { path: string; thumb: models.FileSchema["thumb"] }>();

    oldFiles.forEach((f) => {
      const oldThumbPath = oldThumbsMap.get(f.id);
      const newPath = filesToRelinkMap.get(f.id);
      const newThumb = {
        path: path.resolve(
          path.dirname(newPath),
          path.basename(oldThumbPath, path.extname(oldThumbPath)),
          ".jpg"
        ),
      };

      newFilesMap.set(f.id, { path: newPath, thumb: newThumb });
    });

    const fileRes = await models.FileModel.bulkWrite(
      [...newFilesMap].map(([id, { path, thumb }]) => ({
        updateOne: {
          filter: { _id: objectId(id) },
          update: { $set: { path, thumb: { path: thumb.path } } },
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
