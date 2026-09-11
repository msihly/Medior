import fs from "fs/promises";
import path from "path";
import checkDiskSpace from "check-disk-space";
import md5File from "md5-file";
import * as models from "medior/_generated/server/models";
import { AnyBulkWriteOperation } from "mongodb";
import mongoose, { UpdateWithAggregationPipeline } from "mongoose";
import {
  checkFileExists,
  deleteFile,
  dirToFilePaths,
  fileLog,
  makePerfLog,
  removeEmptyFolders,
} from "trabecula/utils/server";
import trash from "trash";
import { SortValue } from "medior/store/_generated";
import * as actions from "medior/server/database/actions";
import { makeBackgroundOperationRunner } from "medior/server/database/actions/background-operations";
import { makeRepairReporter } from "medior/server/database/repair-progress";
import { genFileInfo } from "medior/utils/client";
import { chunkArray, CONSTANTS, dayjs, Fmt } from "medior/utils/common";
import {
  analyzeAudio,
  getConfig,
  leanModelToJson,
  makeAction,
  objectId,
  objectIds,
  releaseTranscriptionModel,
  retainTranscriptionModel,
  socket,
} from "medior/utils/server";

// const FACE_MIN_CONFIDENCE = 0.4;
// const FACE_MODELS_PATH = process.env.IS_PACKAGED
//   ? path.resolve(process.env.RESOURCES_PATH, "extraResources/face-models")
//   : "medior/face-models";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
export const listAllArchivedFileIds = makeAction(async () =>
  (await models.FileModel.find({ isArchived: true }).select({ _id: 1 }).lean()).map((file) =>
    file._id.toString(),
  ),
);

export const listFileIdsByTagIds = makeAction(async (args: { tagIds: string[] }) => {
  return (
    await models.FileModel.find({ tagIds: { $in: objectIds(args.tagIds) } })
      .select({ _id: 1 })
      .lean()
  ).map((f) => f._id.toString());
});

export const regenFileTagAncestors = makeAction(
  async (
    args: ({ fileIds: string[]; tagIds?: never } | { fileIds?: never; tagIds: string[] }) & {
      repairId?: string;
    },
  ) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[regenFileTagAncestors]", true);
    const batchSize = 1000;
    let processedCount = 0;
    let updatedCount = 0;
    let files: models.FileSchema[] = [];
    const reporter = args.repairId ? makeRepairReporter(args.repairId, "repairTags") : undefined;
    const report = reporter?.report;

    const processBatch = async () => {
      reporter?.checkCancelled();
      if (!files.length) return;

      const tagIds = new Set<string>();
      for (const file of files) {
        for (const tagId of file.tagIds) tagIds.add(tagId);
      }

      const ancestorsMap = await actions.makeAncestorIdsMap([...tagIds]);
      const updates: AnyBulkWriteOperation<models.FileSchema>[] = files.flatMap((file) => {
        const { hasUpdates, tagIdsWithAncestors } = actions.makeUniqueAncestorUpdates({
          ancestorsMap,
          oldTagIdsWithAncestors: file.tagIdsWithAncestors,
          tagIds: file.tagIds,
        });

        return !hasUpdates
          ? []
          : [
              {
                updateOne: {
                  filter: { _id: objectId(file.id) },
                  update: { $set: { tagIdsWithAncestors } },
                },
              },
            ];
      });

      if (updates.length > 0) await models.FileModel.bulkWrite(updates, { ordered: false });
      processedCount += files.length;
      updatedCount += updates.length;
      files = [];
      report?.(
        `Processed ${processedCount} files; repaired cached tag ancestors on ${updatedCount}.`,
        "progress",
      );
      if (debug) perfLog(`Processed ${processedCount} files`);
    };

    const cursor = models.FileModel.find({
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
      .cursor({ batchSize });

    for await (const file of cursor) {
      reporter?.checkCancelled();
      files.push(leanModelToJson<models.FileSchema>(file));
      if (files.length >= batchSize) await processBatch();
    }
    await processBatch();

    if (debug) perfLogTotal(`Updated ${updatedCount} / ${processedCount} file tag ancestors`);
    return { processedCount, updatedCount };
  },
);

const processFileTagAncestorRegenQueue = async () => {
  while (true) {
    const operation = leanModelToJson<models.BackgroundOperationSchema>(
      await models.BackgroundOperationModel.findOne({
        status: { $in: ["PENDING", "RUNNING"] },
        type: "fileTagAncestors",
      })
        .sort({ dateCreated: 1 })
        .lean(),
    );
    if (!operation) return;

    try {
      if (operation.status === "PENDING")
        await actions.setBackgroundOperationStatus(operation.id, "RUNNING");

      const fileIds = operation.targetIds.slice(0, 1000);
      if (!fileIds.length) {
        await actions.setBackgroundOperationStatus(operation.id, "COMPLETE", {
          message: "File tag ancestor regeneration completed.",
          processedCount: operation.totalCount,
        });
        continue;
      }

      const regenRes = await regenFileTagAncestors({ fileIds });
      if (!regenRes.success) throw new Error(regenRes.error);
      await actions.completeBackgroundOperationTargets(
        operation.id,
        fileIds,
        `File tag ancestors: processed ${operation.processedCount + fileIds.length} of ${operation.totalCount}.`,
      );
    } catch (error) {
      await actions.setBackgroundOperationStatus(operation.id, "ERROR", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

const runFileTagAncestorRegenQueue = makeBackgroundOperationRunner(
  "file tag ancestor regeneration",
  processFileTagAncestorRegenQueue,
);

// @generator-ignore-export
export const queueFileTagAncestorRegen = async (fileIds: string[]) => {
  await actions.queueBackgroundOperation({
    label: "File tag ancestor regeneration",
    targetIds: fileIds,
    type: "fileTagAncestors",
  });
  runFileTagAncestorRegenQueue();
};

// @generator-ignore-export
export const resumeFileRegens = () => runFileTagAncestorRegenQueue();

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const deleteFiles = makeAction(
  async (args: { fileIds: string[]; withTagRegen?: boolean }) => {
    const collRes = await actions.listCollectionsByFileIds(args);
    if (!collRes.success) throw new Error(collRes.error);
    const collections = collRes.data;

    const fileIdSet = new Set(args.fileIds);

    for (const collection of collections) {
      const fileIdIndexes = collection.fileIdIndexes.filter(
        (fileIdIndex) => !fileIdSet.has(String(fileIdIndex.fileId)),
      );
      if (!fileIdIndexes.length) await actions.deleteCollections({ ids: [collection.id] });
      else await actions.updateCollection({ fileIdIndexes, id: collection.id });
    }

    const filesRes = await actions.listFile({ args: { filter: { id: args.fileIds } } });
    if (!filesRes.success) throw new Error(filesRes.error);
    const files = filesRes.data.items;

    const fileHashes = files.map((f) => f.hash);
    const tagIds = [...new Set(files.flatMap((f) => f.tagIds))];

    for (const file of files) {
      await deleteFile(file.path);
      await deleteFile(file.thumb?.path);
    }

    await Promise.all([
      models.FileModel.deleteMany({ _id: { $in: args.fileIds } }),
      models.DeletedFileModel.bulkWrite(
        fileHashes.map((hash) => ({
          updateOne: {
            filter: { hash },
            update: { $setOnInsert: { hash } },
            upsert: true,
          },
        })),
      ),
    ]);

    if (args.withTagRegen !== false) {
      const regenRes = await actions.regenTags({ tagIds });
      if (!regenRes.success) throw new Error(regenRes.error);
    }

    socket.emit("onFilesDeleted", { fileHashes, fileIds: args.fileIds });
    return { tagIds };
  },
);

export const deleteFilesExternal = makeAction(
  async (args: { paths: string[]; progress?: { processedCount: number; totalCount: number } }) => {
    try {
      fileLog(`[DFE] Deleting ${args.paths.length} paths...`);

      const folderPaths: string[] = [];
      const filePaths: string[] = [];
      for (const p of args.paths) {
        if ((await fs.stat(p)).isDirectory()) {
          folderPaths.push(p);
          const files = await dirToFilePaths(p);
          for (const file of files) filePaths.push(file);
        } else filePaths.push(p);

        fileLog(`[DFE] Total files scanned: ${filePaths.length}`);
      }

      if (!filePaths.length) throw new Error("No valid files found");
      fileLog(`[DFE] Total files to delete: ${filePaths.length}`);

      if (!filePaths.length) throw new Error("No valid files found");

      const chunks = chunkArray(filePaths, 200);
      let deletedCount = 0;
      for (const chunk of chunks) {
        const fileHashes: string[] = [];
        for (const filePath of chunk) fileHashes.push(await md5File(filePath));
        fileLog(`[DFE] Hashed ${fileHashes.length} file hashes.`);

        await models.DeletedFileModel.bulkWrite(
          fileHashes.map((hash) => ({
            updateOne: {
              filter: { hash },
              update: { $setOnInsert: { hash } },
              upsert: true,
            },
          })),
        );
        fileLog(`[DFE] Stored ${fileHashes.length} file hashes.`);

        await trash(chunk);
        deletedCount += chunk.length;
        const processedCount = (args.progress?.processedCount ?? 0) + deletedCount;
        const totalCount = args.progress?.totalCount ?? filePaths.length;
        fileLog(`[DFE] Deleted ${processedCount} / ${totalCount} files.`);
      }

      const progress = {
        message: `Deleted ${(args.progress?.processedCount ?? 0) + filePaths.length} / ${args.progress?.totalCount ?? filePaths.length} files.`,
        processedCount: (args.progress?.processedCount ?? 0) + filePaths.length,
        totalCount: args.progress?.totalCount ?? filePaths.length,
      };
      fileLog(`[DFE] ${progress.message}`);

      const folders = new Set([
        ...folderPaths,
        ...filePaths
          .map((p) => path.dirname(p).split(path.sep))
          .sort((a, b) => b.length - a.length)
          .map((p) => p.join(path.sep)),
      ]);

      for (const folder of folders) await removeEmptyFolders(folder);
      fileLog(`[DFE] Deleted empty folders.`);

      return { success: true, data: filePaths.length, progress };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
);

export const detectFaces = makeAction(async ({ imagePath }: { imagePath: string }) => {
  return imagePath;

  // const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
  // const tf = await import("@tensorflow/tfjs-node-gpu");

  // let buffer: Buffer;

  // try {
  //   buffer = await fs.readFile(imagePath);
  //   buffer = await sharp(buffer).png().toBuffer();
  // } catch (err) {
  //   throw new Error(`Failed to convert image to buffer: ${err.message}`);
  // }

  // const tensor = tf.node.decodeImage(buffer as Uint8Array);

  // try {
  //   const options = new faceapi.SsdMobilenetv1Options({ minConfidence: FACE_MIN_CONFIDENCE });
  //   const faces = await faceapi
  //     .detectAllFaces(tensor as any, options)
  //     .withFaceLandmarks()
  //     .withFaceExpressions()
  //     .withFaceDescriptors()
  //     .run();

  //   tf.dispose(tensor);
  //   return faces;
  // } catch (err) {
  //   tf.dispose(tensor);
  //   throw new Error(err);
  // }
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

    const changedTagIds = [...new Set([...addedTagIds, ...removedTagIds])];
    await queueFileTagAncestorRegen(fileIds);
    await actions.queueTagMetadataRegen(await actions.deriveAncestorTagIds(changedTagIds));
    const collectionRes = await actions.regenCollAttrs({ fileIds });
    if (!collectionRes.success) throw new Error(collectionRes.error);

    if (withSub) socket.emit("onFileTagsUpdated", { addedTagIds, batchId, fileIds, removedTagIds });
  },
);

export const getDeletedFile = makeAction(async ({ hash }: { hash: string }) =>
  leanModelToJson<models.DeletedFileSchema>(await models.DeletedFileModel.findOne({ hash }).lean()),
);

export const getDiskStats = makeAction(async ({ diskPath }: { diskPath: string }) => {
  return await checkDiskSpace(diskPath);
});

export const getFileByHash = makeAction(async ({ hash }: { hash: string }) =>
  leanModelToJson<models.FileSchema>(await models.FileModel.findOne({ hash }).lean()),
);

export const importFile = makeAction(async (args: Omit<models.FileSchema, "id">) => {
  const file: Omit<models.FileSchema, "id"> = {
    ...args,
    dateModified: args.dateModified ?? dayjs().toISOString(),
    isArchived: false,
    originalBitrate: args.originalBitrate ?? args.bitrate,
    originalHash: args.originalHash ?? args.hash,
    originalSize: args.originalSize ?? args.size,
    rating: 0,
    tagIdsWithAncestors: await actions.deriveAncestorTagIds(args.tagIds),
  };

  const res = await models.FileModel.create(file);
  return { ...file, id: res._id.toString() };
});

export const listDeletedFiles = makeAction(async () =>
  (await models.DeletedFileModel.find().lean()).map((f) =>
    leanModelToJson<models.DeletedFileSchema>(f),
  ),
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
    leanModelToJson<models.FileSchema>(f),
  );
});

export const listFilePaths = makeAction(async () => {
  return (await models.FileModel.find().select({ _id: 1, path: 1 }).lean()).map((f) => ({
    id: f._id.toString(),
    path: f.path,
  }));
});

export const listSortedFileIds = makeAction(
  async (args: { ids: string[]; sortValue: SortValue }) => {
    const files = await models.FileModel.find({ _id: { $in: objectIds(args.ids) } })
      .sort({ [args.sortValue.key]: args.sortValue.isDesc ? -1 : 1 })
      .select({ _id: 1 })
      .lean();

    return files.map((f) => leanModelToJson<models.FileSchema>(f).id);
  },
);

export const listVideosWithMissingInfo = makeAction(async () => {
  const files = await models.FileModel.find({
    ext: { $in: CONSTANTS.VIDEO.EXTS },
    $or: [
      { audioBitrate: { $exists: false } },
      { audioBitrate: "" },
      { audioCodec: { $exists: false } },
      { audioCodec: "" },
      { bitrate: { $exists: false } },
      { bitrate: "" },
      { videoCodec: { $exists: false } },
      { videoCodec: "" },
    ],
  })
    .allowDiskUse(true)
    .select({ _id: 1, isCorrupted: 1, path: 1 })
    .lean();

  return files.map((f) => ({ id: f._id.toString(), isCorrupted: f.isCorrupted, path: f.path }));
});

export const loadFaceApiNets = makeAction(async () => {
  // const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
  // await faceapi.nets.ssdMobilenetv1.loadFromDisk(FACE_MODELS_PATH);
  // await faceapi.nets.faceLandmark68Net.loadFromDisk(FACE_MODELS_PATH);
  // await faceapi.nets.faceExpressionNet.loadFromDisk(FACE_MODELS_PATH);
  // await faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_MODELS_PATH);
});

export const relinkFiles = makeAction(
  async (args: { filesToRelink: { id: string; path: string }[] }) => {
    const oldFiles = (
      await models.FileModel.find({
        _id: { $in: objectIds(args.filesToRelink.map((f) => f.id)) },
      }).lean()
    ).map(leanModelToJson<models.FileSchema>);

    const filesToRelinkMap = new Map(args.filesToRelink.map((f) => [f.id, f.path]));
    const newFilesMap = new Map<string, { path: string; thumb: models.FileSchema["thumb"] }>();

    oldFiles.forEach((f) => {
      const newPath = filesToRelinkMap.get(f.id);
      const newThumb = {
        path: path.resolve(
          path.dirname(newPath),
          `${path.basename(newPath, path.extname(newPath))}-thumb`,
          ".jpg",
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
      })),
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
      })),
    );

    if (importsRes.modifiedCount !== importBatches.length)
      throw new Error("Failed to bulk write relinked file imports");
  },
);

export const repairFilesWithBrokenExt = makeAction(async ({ repairId }: { repairId: string }) => {
  const { perfLog } = makePerfLog("[repairFiles]", true);
  const { checkCancelled, report, run } = makeRepairReporter(repairId, "repairFiles");
  return run(async () => {
    report("Searching for files whose stored extension begins with a dot.");
    const filesWithDotPrefix = await models.FileModel.find({
      ext: { $regex: /^\./ },
    })
      .allowDiskUse(true)
      .select({ _id: 1, path: 1 })
      .lean();

    perfLog(`Found ${filesWithDotPrefix.length} files with legacy extension format`);
    report(
      `Found ${filesWithDotPrefix.length} files with a legacy dot-prefixed extension.`,
      "progress",
    );

    report("Comparing stored file extensions with the extensions in file paths.");
    checkCancelled();
    const filesWithIncorrectOrUppercaseExt: {
      _id: mongoose.Types.ObjectId;
      path: string;
    }[] = await models.FileModel.aggregate([
      {
        $addFields: {
          pathExt: { $regexFind: { input: "$path", regex: /\.(\w+)$/ } },
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              {
                $ne: [
                  { $toLower: { $arrayElemAt: ["$pathExt.captures", 0] } },
                  { $toLower: "$ext" },
                ],
              },
              { $ne: ["$ext", { $toLower: "$ext" }] },
            ],
          },
        },
      },
      { $project: { _id: 1, path: 1 } },
    ]).allowDiskUse(true);

    perfLog(
      `Found ${filesWithIncorrectOrUppercaseExt.length} files with incorrect or uppercase extensions`,
    );
    report(
      `Found ${filesWithIncorrectOrUppercaseExt.length} files with an incorrect or uppercase extension.`,
      "progress",
    );

    const filesToUpdate = new Map(filesWithDotPrefix.map((f) => [f._id.toString(), f.path]));

    filesWithIncorrectOrUppercaseExt.forEach((f) => {
      if (!filesToUpdate.has(f._id.toString())) filesToUpdate.set(f._id.toString(), f.path);
    });

    perfLog(`Found ${filesToUpdate.size} files to update`);
    report(`Updating extensions on ${filesToUpdate.size} unique files.`);
    checkCancelled();

    const bulkWriteRes = filesToUpdate.size
      ? await models.FileModel.bulkWrite(
          [...filesToUpdate].map((f) => ({
            updateOne: {
              filter: { _id: objectId(f[0]) },
              update: {
                $set: { ext: path.extname(f[1]).slice(1).toLowerCase() },
              },
            },
          })),
        )
      : { modifiedCount: 0 };

    perfLog(`Updated extensions of ${bulkWriteRes.modifiedCount} files`);

    if (bulkWriteRes.modifiedCount !== filesToUpdate.size)
      throw new Error(`Bulk write failed: ${JSON.stringify(bulkWriteRes, null, 2)}`);

    report(
      `File extension repair completed successfully: updated ${bulkWriteRes.modifiedCount} files.`,
      "success",
    );
    return {
      filesWithDotPrefixCount: filesWithDotPrefix.length,
      filesWithIncorrectExtCount: filesWithIncorrectOrUppercaseExt.length,
    };
  });
});

export const repairFilesWithMissingInfo = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, report, run } = makeRepairReporter(repairId, "repairFiles");
  return run(async () => {
    const updateMissingOriginal = async (name: string) => {
      checkCancelled();
      const originalName = `original${Fmt.capitalize(name)}`;
      report(`Searching for videos with ${name} but no ${originalName}.`);
      const files = await models.FileModel.find({
        ext: { $in: CONSTANTS.VIDEO.EXTS },
        $or: [
          {
            $and: [
              { [name]: { $exists: true } },
              { $or: [{ [originalName]: { $exists: false } }, { [originalName]: "" }] },
            ],
          },
        ],
      })
        .allowDiskUse(true)
        .select({ _id: 1, [name]: 1 })
        .lean();

      report(`Found ${files.length} videos missing ${originalName}.`, "progress");
      if (files.length)
        await models.FileModel.bulkWrite(
          files.map((file) => ({
            updateOne: {
              filter: { _id: file._id },
              update: { $set: { [originalName]: file[name] } },
            },
          })),
        );
      report(`Repaired ${originalName} on ${files.length} videos.`, "progress");
    };

    await updateMissingOriginal("bitrate");
    await updateMissingOriginal("size");
    await updateMissingOriginal("videoCodec");
    report("Missing original video information repair completed successfully.", "success");
    return { repairedFields: ["originalBitrate", "originalSize", "originalVideoCodec"] };
  });
});

export const repairMissingAudioAnalysis = makeAction(
  async ({
    maxTranscriptionDuration,
    repairId,
    repairTranscriptions,
    repairWaveforms,
  }: {
    maxTranscriptionDuration: number;
    repairId: string;
    repairTranscriptions: boolean;
    repairWaveforms: boolean;
  }) => {
    const { checkCancelled, report, run, signal } = makeRepairReporter(
      repairId,
      "repairAudioAnalysis",
    );
    return run(async () => {
      if (
        repairTranscriptions &&
        (!Number.isFinite(maxTranscriptionDuration) || maxTranscriptionDuration <= 0)
      )
        throw new Error("Maximum transcription duration must be greater than zero.");

      const missingFilters: mongoose.FilterQuery<models.FileSchema>[] = [];
      if (repairTranscriptions)
        missingFilters.push({
          duration: { $lte: maxTranscriptionDuration },
          transcription: null,
        });
      if (repairWaveforms) missingFilters.push({ "waveformPeaks.0": { $exists: false } });
      if (!missingFilters.length) return { repairedTranscriptions: 0, repairedWaveforms: 0 };

      report(
        `Searching for videos with audio and missing analysis data.${repairTranscriptions ? ` Transcriptions are limited to ${Fmt.duration(maxTranscriptionDuration)}.` : ""}`,
      );

      const fileFilter: mongoose.FilterQuery<models.FileSchema> = {
        $or: missingFilters,
        audioCodec: { $exists: true, $nin: ["", "None", null] },
        ext: { $in: CONSTANTS.VIDEO.EXTS },
      };

      const fileCount = await models.FileModel.countDocuments(fileFilter).allowDiskUse(true);
      report(`Found ${fileCount} videos requiring audio analysis.`, "progress");

      const cursor = models.FileModel.find(fileFilter)
        .allowDiskUse(true)
        .select({ _id: 1, duration: 1, path: 1, transcription: 1, waveformPeaks: 1 })
        .lean()
        .cursor({ batchSize: 100 });

      const modelOwnerId = `repair:${repairId}`;
      let completedCount = 0;
      let processedCount = 0;
      let repairedTranscriptions = 0;
      let repairedWaveforms = 0;
      let reportedModelDownloadProgress = -1;
      let totalProcessingTime = 0;

      const reportAnalysisProgress = (message: string, progress?: number) => {
        if (message.startsWith("Downloading transcription model:")) {
          const roundedProgress = Math.floor(progress / 10) * 10;
          if (roundedProgress <= reportedModelDownloadProgress) return;
          reportedModelDownloadProgress = roundedProgress;
          report(`${message.replace(/\.$/, "")} (${roundedProgress}%).`, "progress", true);
        } else if (message.startsWith("Transcribing audio:")) {
          report(message, "progress", true);
        } else if (
          message.startsWith("Audio duration:") ||
          message === "Extracting audio." ||
          message === "Generating waveform." ||
          message === "Loading transcription model." ||
          message === "Measuring peak volume." ||
          message === "Preparing transcription model." ||
          message === "Transcribing audio." ||
          message.startsWith("GPU transcription unavailable.") ||
          message.startsWith("Transcription model loaded on")
        )
          report(message, "progress");
      };

      if (repairTranscriptions) retainTranscriptionModel(modelOwnerId);

      try {
        for await (const file of cursor) {
          checkCancelled();
          processedCount++;
          const withTranscription =
            repairTranscriptions &&
            file.duration <= maxTranscriptionDuration &&
            !file.transcription;
          const withWaveform = repairWaveforms && !file.waveformPeaks?.length;
          if (!withTranscription && !withWaveform) continue;

          const startedAt = Date.now();

          report(`Analyzing video ${processedCount} / ${fileCount}.`, "progress");
          const analysis = await analyzeAudio(file.path, reportAnalysisProgress, signal, {
            withTranscription,
            withWaveform,
          });

          checkCancelled();
          const updates: Partial<models.FileSchema> = {};

          if (withTranscription) {
            updates.hasTranscript = Boolean(analysis.transcription);
            updates.transcription = analysis.transcription;
            repairedTranscriptions++;
          }

          if (withWaveform) {
            updates.waveformPeaks = analysis.waveformPeaks;
            repairedWaveforms++;
          }

          const updateRes = await actions.updateFile({
            args: { id: file._id.toString(), updates },
          });
          if (!updateRes.success) throw new Error(updateRes.error);
          completedCount++;
          totalProcessingTime += Date.now() - startedAt;
          report(
            `Completed video ${processedCount} / ${fileCount} in ${dayjs.duration(Date.now() - startedAt).format("HH:mm:ss")}; average ${dayjs.duration(totalProcessingTime / completedCount).format("HH:mm:ss")} per completed video.`,
            "progress",
          );
        }
      } finally {
        await cursor.close();
        if (repairTranscriptions) await releaseTranscriptionModel(modelOwnerId);
      }

      report(
        `Audio analysis repair completed successfully: regenerated ${repairedWaveforms} waveforms and ${repairedTranscriptions} transcriptions.`,
        "success",
      );
      return { repairedTranscriptions, repairedWaveforms };
    });
  },
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
  },
);

export const setFileIsArchived = makeAction(
  async (args: { fileIds: string[]; isArchived: boolean }) => {
    const updates = { isArchived: args.isArchived };
    await models.FileModel.updateMany({ _id: { $in: args.fileIds } }, updates);
    if (args.isArchived) {
      const res = await actions.deleteFileTransformsByFileIds({ fileIds: args.fileIds });
      if (!res.success) throw new Error(res.error);
    }

    if (args.isArchived) socket.emit("onFilesArchived", { fileIds: args.fileIds });
    socket.emit("onFilesUpdated", { fileIds: args.fileIds, updates });
  },
);

export const setFileRating = makeAction(async (args: { fileIds: string[]; rating: number }) => {
  const tagIds = [
    ...new Set(
      (
        await models.FileModel.find({ _id: { $in: args.fileIds } })
          .select({ tagIdsWithAncestors: 1 })
          .lean()
      ).flatMap((file) => file.tagIdsWithAncestors.map(String)),
    ),
  ];
  const updates = { rating: args.rating, dateModified: dayjs().toISOString() };
  await models.FileModel.updateMany({ _id: { $in: args.fileIds } }, updates);
  socket.emit("onFilesUpdated", { fileIds: args.fileIds, updates });

  await actions.regenCollAttrs({ fileIds: args.fileIds });
  if (tagIds.length) await actions.queueTagMetadataRegen(tagIds);
});

/* ----------------------------------------------------------------------- */
const generateFileThumbnail = async (file: models.FileSchema, skipThumbs = false) => {
  const info = await genFileInfo({ file, filePath: file.path, hash: file.hash, skipThumbs });
  const thumbnailExists = info.thumb?.path && (await checkFileExists(info.thumb.path));
  if (info.isCorrupted || !thumbnailExists)
    throw new Error(
      info.isCorrupted
        ? "Thumbnail generation reported that the source file is corrupted."
        : `Thumbnail ${skipThumbs ? "was not found at the expected path" : "generation did not create a file"}: ${info.thumb?.path ?? "no path returned"}`,
    );
  return info;
};

const fileThumbnailRepairPromises = new Map<
  string,
  Promise<{ status: "repaired" | "skipped"; thumb?: models.FileSchema["thumb"] }>
>();
const fileRefreshAbortControllers = new Map<string, AbortController>();

export const repairFileThumbnail = makeAction(async ({ fileId }: { fileId: string }) => {
  const pendingRepair = fileThumbnailRepairPromises.get(fileId);
  if (pendingRepair) return pendingRepair;

  const repairPromise = (async () => {
    const fileModel = await models.FileModel.findById(fileId).lean();
    if (!fileModel) throw new Error(`File ${fileId} was not found.`);
    const file = leanModelToJson<models.FileSchema>(fileModel);
    if (file.isCorrupted) return { status: "skipped" as const };

    try {
      const info = await generateFileThumbnail(file);
      const updateRes = await actions.updateFile({ args: { id: file.id, updates: info } });
      if (!updateRes.success) throw new Error(updateRes.error);
      return { status: "repaired" as const, thumb: info.thumb };
    } catch (error) {
      const updateRes = await actions.updateFile({
        args: { id: file.id, updates: { isCorrupted: true } },
      });
      if (!updateRes.success)
        throw new Error(
          `Thumbnail repair failed and the file could not be marked corrupted: ${updateRes.error}`,
        );
      throw error;
    }
  })();

  fileThumbnailRepairPromises.set(fileId, repairPromise);
  try {
    return await repairPromise;
  } finally {
    fileThumbnailRepairPromises.delete(fileId);
  }
});

export const cancelFileRefresh = makeAction(async ({ refreshId }: { refreshId: string }) => {
  const abortController = fileRefreshAbortControllers.get(refreshId);
  abortController?.abort();
  await releaseTranscriptionModel(`file-refresh:${refreshId}`);
  return Boolean(abortController);
});

export const finishFileRefresh = makeAction(async ({ refreshId }: { refreshId: string }) => {
  await releaseTranscriptionModel(`file-refresh:${refreshId}`);
});

export const refreshFileInfo = makeAction(
  async ({
    fileId,
    refreshId,
    withTranscription,
    withWaveform,
  }: {
    fileId: string;
    refreshId?: string;
    withTranscription?: boolean;
    withWaveform?: boolean;
  }) => {
    const abortController = new AbortController();
    if (refreshId) {
      fileRefreshAbortControllers.set(refreshId, abortController);
      if (withTranscription ?? getConfig().file.transcription.enabled)
        retainTranscriptionModel(`file-refresh:${refreshId}`);
    }

    try {
      const fileModel = await models.FileModel.findById(fileId).lean();
      if (!fileModel) throw new Error(`File ${fileId} was not found.`);

      const file = leanModelToJson<models.FileSchema>(fileModel);

      const report = (message: string, progress?: number) =>
        refreshId &&
        socket.emitReliable("onFileRefreshProgress", {
          fileId,
          fileName: file.originalName,
          message,
          progress,
          refreshId,
        });

      const updates = await genFileInfo({
        file,
        filePath: file.path,
        hash: file.hash,
        onProgress: report,
        signal: abortController.signal,
        withTranscription,
        withWaveform,
      });

      abortController.signal.throwIfAborted();
      report("Saving refreshed metadata.");

      const updateRes = await actions.updateFile({ args: { id: file.id, updates } });
      if (!updateRes.success) throw new Error(updateRes.error);
      return updateRes.data;
    } finally {
      if (refreshId && fileRefreshAbortControllers.get(refreshId) === abortController)
        fileRefreshAbortControllers.delete(refreshId);
    }
  },
);

/* ----------------------------------------------------------------------- */
class ThumbRepairer {
  private checkCancelled: ReturnType<typeof makeRepairReporter>["checkCancelled"];
  private logTag = "[repairThumbs]";
  private perfLog: (str: string) => void;
  private perfLogTotal: (str: string) => void;
  private report: ReturnType<typeof makeRepairReporter>["report"];

  private chunkSize = 1000;
  private fileChunkIteration = 0;
  private errorCount = 0;
  private hasFilesWithOldThumbPaths = false;
  private hasInvalidThumbnails = false;
  private hasMorePages = true;
  private thumbMap = new Map<string, models.FileSchema["thumb"]>();

  private tagCount = 0;
  private totalCount = 0;

  constructor(repairId: string) {
    const { perfLog, perfLogTotal } = makePerfLog(this.logTag, true);
    this.perfLog = perfLog;
    this.perfLogTotal = perfLogTotal;
    const reporter = makeRepairReporter(repairId, "repairThumbs");
    this.checkCancelled = reporter.checkCancelled;
    this.report = reporter.report;
  }

  private progressLog = (message: string) => {
    this.perfLog(message);
    this.report(message, "progress");
  };

  private errorLog = async (...args: any[]) => {
    this.errorCount++;
    const message = args.map(String).join(" ");
    this.report(message, "error");
  };

  private validateFileThumbnails = async () => {
    const validationBatchSize = 500;
    const fileFilter = { isCorrupted: { $ne: true } };
    const totalFileCount = await models.FileModel.countDocuments(fileFilter);
    let files: models.FileSchema[] = [];
    let loadedDirectoryPath: string;
    let loadedDirectoryFileNames = new Set<string>();
    let scannedCount = 0;
    let invalidThumbnailCount = 0;
    let regeneratedThumbnailCount = 0;
    let restoredThumbnailRecordCount = 0;

    const loadDirectoryFileNames = async (directoryPath: string) => {
      if (directoryPath === loadedDirectoryPath) return loadedDirectoryFileNames;

      try {
        loadedDirectoryFileNames = new Set(
          (await fs.readdir(directoryPath)).map((fileName) => fileName.toLowerCase()),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        loadedDirectoryFileNames = new Set();
      }
      loadedDirectoryPath = directoryPath;
      return loadedDirectoryFileNames;
    };

    const processBatch = async () => {
      if (!files.length) return;

      for (const file of files) {
        this.checkCancelled();
        const sourceDirectoryPath = path.dirname(file.path);
        const sourceDirectoryFileNames = await loadDirectoryFileNames(sourceDirectoryPath);
        const storedThumbnailPath = file.thumb?.path;
        const storedThumbnailExists = !storedThumbnailPath
          ? false
          : path.dirname(storedThumbnailPath).toLowerCase() === sourceDirectoryPath.toLowerCase()
            ? sourceDirectoryFileNames.has(path.basename(storedThumbnailPath).toLowerCase())
            : await checkFileExists(storedThumbnailPath);
        if (storedThumbnailExists) continue;

        invalidThumbnailCount++;
        const expectedThumbPath = path.resolve(path.dirname(file.path), `${file.hash}-thumb.jpg`);
        const expectedThumbnailExists = sourceDirectoryFileNames.has(
          path.basename(expectedThumbPath).toLowerCase(),
        );

        try {
          await this.regenThumbs(file, expectedThumbnailExists);
          if (expectedThumbnailExists) restoredThumbnailRecordCount++;
          else regeneratedThumbnailCount++;
        } catch (error) {
          this.checkCancelled();
          await this.errorLog(
            `Failed to repair thumbnail for file ${file.id} (${file.path}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        if (invalidThumbnailCount % 25 === 0)
          this.progressLog(
            `Processed ${invalidThumbnailCount} files with missing thumbnails so far; regenerated ${regeneratedThumbnailCount}, restored ${restoredThumbnailRecordCount}, and failed ${this.errorCount}.`,
          );
      }

      scannedCount += files.length;
      files = [];
      this.progressLog(
        `Scanned ${scannedCount} / ${totalFileCount} files. Found ${invalidThumbnailCount} missing thumbnail files; regenerated ${regeneratedThumbnailCount} and restored ${restoredThumbnailRecordCount} database records.`,
      );
    };

    const cursor = models.FileModel.find(fileFilter)
      .sort({ path: 1 })
      .allowDiskUse(true)
      .select({ _id: 1, dateModified: 1, hash: 1, isCorrupted: 1, path: 1, thumb: 1 })
      .lean()
      .cursor({ batchSize: validationBatchSize });
    for await (const file of cursor) {
      this.checkCancelled();
      files.push(leanModelToJson<models.FileSchema>(file));
      if (files.length >= validationBatchSize) await processBatch();
    }
    await processBatch();

    this.hasInvalidThumbnails = invalidThumbnailCount > 0;
    this.progressLog(
      `Thumbnail file validation completed: scanned ${scannedCount} files and found ${invalidThumbnailCount} missing thumbnail files. Regenerated ${regeneratedThumbnailCount} thumbnails and restored ${restoredThumbnailRecordCount} existing thumbnails to the database.`,
    );
  };

  private getFilesWithThumbPaths = async () =>
    (
      await models.FileModel.find({ thumbPaths: { $exists: true } }, null, { strict: false })
        .limit(this.chunkSize)
        .allowDiskUse(true)
        .lean()
    ).map((f) =>
      leanModelToJson<models.FileSchema & { thumbPaths: string[] }>({
        ...f,
        // @ts-expect-error
        thumbPaths: f.thumbPaths,
      }),
    );

  private getTotalFilesWithThumbPaths = async () => {
    const res: { total: number } = (
      await models.FileModel.aggregate([
        { $match: { thumbPaths: { $exists: true } } },
        { $count: "total" },
      ]).allowDiskUse(true)
    ).flatMap((r) => r)[0];
    return res?.total ?? 0;
  };

  private iterateFiles = async () => {
    const processedFileIds: string[] = [];
    let idsToRegenThumb: string[] = [];
    let idsToUnset: string[] = [];
    let deletedThumbCount = 0;
    let movedImageThumbCount = 0;
    let skippedThumbCount = 0;

    this.fileChunkIteration++;

    const filesWithThumbPaths = await this.getFilesWithThumbPaths();
    if (filesWithThumbPaths.length < this.chunkSize) this.hasMorePages = false;
    if (!this.hasFilesWithOldThumbPaths && filesWithThumbPaths.length > 0)
      this.hasFilesWithOldThumbPaths = true;

    const filesWithThumbPathsMap = new Map<string, models.FileSchema & { thumbPaths: string[] }>(
      filesWithThumbPaths.map((f) => [f.id, f]),
    );
    filesWithThumbPaths.forEach((f) => this.thumbMap.set(f.id, null));

    this.progressLog(
      `Files iteration ${this.fileChunkIteration}. Files to process: ${filesWithThumbPaths.length}.`,
    );

    for (const file of filesWithThumbPaths) {
      this.checkCancelled();
      if (file.thumbPaths.length === 1) {
        const originalPath = file.thumbPaths[0];
        const newThumbPath = this.makeFileThumbPath(file);
        await actions.copyFile({
          dirPath: path.dirname(file.path),
          originalPath,
          newPath: newThumbPath,
        });
        await actions.updateFile({
          args: {
            id: file.id,
            updates: { thumb: { frameHeight: null, frameWidth: null, path: newThumbPath } },
          },
        });
        await deleteFile(originalPath, newThumbPath);
        movedImageThumbCount++;
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

      if (
        processedFileIds.length % 100 === 0 ||
        processedFileIds.length === filesWithThumbPaths.length
      ) {
        for (const fileId of idsToRegenThumb) {
          this.checkCancelled();
          await this.regenThumbs(filesWithThumbPathsMap.get(fileId)).catch(() => {
            this.checkCancelled();
            return this.errorLog(`Failed to regen thumb for file ${fileId}`);
          });
        }
        this.progressLog(`Regenerated thumbnail data for ${idsToRegenThumb.length} files.`);
        idsToRegenThumb = [];

        try {
          const res = await models.FileModel.updateMany(
            { _id: idsToUnset },
            { $unset: { thumbPaths: "" } },
            { strict: false },
          );
          if (res.modifiedCount !== idsToUnset.length)
            throw new Error(JSON.stringify(res, null, 2));
          this.progressLog(`Removed legacy thumbnail paths from ${res.modifiedCount} files.`);
        } catch (err) {
          this.errorLog(`Failed to unset 'thumbPaths': ${err.message}`);
        }
        idsToUnset = [];
      }
    }

    this.progressLog(
      `Iteration complete. Deleted ${deletedThumbCount} thumbnail files. Moved and renamed ${movedImageThumbCount} image thumb paths. Found ${skippedThumbCount} thumbnail paths without files.`,
    );
  };

  private makeFileThumbPath = (file: models.FileSchema) =>
    path.resolve(path.dirname(file.path), `${path.basename(file.path, file.ext)}-thumb${file.ext}`);

  private processTags = async () => {
    this.checkCancelled();
    const filter = { thumbPaths: { $exists: true } };
    const tags = (
      await models.TagModel.find(filter, null, { strict: false }).allowDiskUse(true).lean()
    ).map(leanModelToJson<models.TagSchema>);
    this.tagCount = tags.length;
    this.progressLog(`Found ${this.tagCount} tags with legacy thumbnail paths.`);

    if (this.tagCount > 0) {
      const tagIds = [...new Set(tags.map((t) => t.id))];
      await actions.regenTagMeta({ tagIds });
      this.progressLog("Regenerated thumbnail metadata for affected tags.");

      const unsetRes = await models.TagModel.updateMany(
        filter,
        { $unset: { thumbPaths: "" } },
        { strict: false },
      );
      if (!unsetRes.matchedCount || unsetRes.modifiedCount !== unsetRes.matchedCount)
        throw new Error(
          `Failed to unset thumbPaths from tags: ${JSON.stringify(unsetRes, null, 2)}`,
        );

      this.progressLog("Removed legacy thumbnail paths from tags.");
    }
  };

  private regenThumbs = async (file: models.FileSchema, skipThumbs = false) => {
    this.checkCancelled();
    const info = await generateFileThumbnail(file, skipThumbs);
    this.checkCancelled();
    this.thumbMap.set(file.id, info.thumb);
    const res = await actions.updateFile({ args: { id: file.id, updates: info } });
    if (!res.success) throw new Error(`Failed to update file: ${res.error}`);
  };

  private fixMalformedThumbPaths = async () => {
    const pipeline: UpdateWithAggregationPipeline = [
      {
        $set: {
          "thumb.path": {
            $replaceOne: { input: "$thumb.path", find: "\\.jpg", replacement: ".jpg" },
          },
        },
      },
    ];

    const fileRes = await models.FileModel.updateMany(
      { "thumb.path": { $regex: "\\\\.jpg$" } },
      pipeline,
    );
    this.progressLog(`Fixed ${fileRes.matchedCount} files with malformed thumbnail paths.`);

    const tagRes = await models.TagModel.updateMany(
      { "thumb.path": { $regex: "\\\\.jpg$" } },
      pipeline,
    );
    this.progressLog(`Fixed ${tagRes.matchedCount} tags with malformed thumbnail paths.`);
  };

  /* ----------------------------------------------------------------------- */
  public processAllFiles = async ({
    repairMissingThumbnails,
    repairPaths,
  }: {
    repairMissingThumbnails: boolean;
    repairPaths: boolean;
  }) => {
    this.checkCancelled();
    if (repairPaths) {
      this.report("Searching for malformed thumbnail paths.");
      await this.fixMalformedThumbPaths();

      this.report("Counting files with legacy thumbnail paths.");
      this.totalCount = await this.getTotalFilesWithThumbPaths();
      this.progressLog(`Found ${this.totalCount} files with legacy thumbnail paths.`);
      if (this.totalCount) this.report("Migrating legacy file thumbnail paths.");
      while (this.hasMorePages) await this.iterateFiles();
    }

    this.checkCancelled();
    if (repairMissingThumbnails) {
      this.report("Searching for files without thumbnail data.");
      await this.validateFileThumbnails();
    }

    if (!this.hasFilesWithOldThumbPaths && !this.hasInvalidThumbnails) {
      this.perfLogTotal("No files to process found");
      this.report(
        "Thumbnail repair completed successfully: no remaining files required repair.",
        "success",
      );
      return { fileCount: this.thumbMap.size, tagCount: this.tagCount };
    }

    this.report("Repairing tag thumbnails affected by file thumbnail changes.");
    await this.processTags();

    if (this.errorCount)
      throw new Error(
        `${this.errorCount} thumbnail repair operations failed. Review the errors above for the affected files.`,
      );

    this.perfLogTotal("Repaired all thumbs");
    this.report(
      `Thumbnail repair completed successfully: processed ${this.thumbMap.size} files and ${this.tagCount} tags.`,
      "success",
    );
    return {
      fileCount: this.thumbMap.size,
      tagCount: this.tagCount,
    };
  };
}

export const repairThumbs = makeAction(
  async ({
    repairId,
    repairMissingThumbnails = true,
    repairPaths = true,
  }: {
    repairId: string;
    repairMissingThumbnails?: boolean;
    repairPaths?: boolean;
  }) => {
    const { run } = makeRepairReporter(repairId, "repairThumbs");
    const repairer = new ThumbRepairer(repairId);
    return run(
      async () => await repairer.processAllFiles({ repairMissingThumbnails, repairPaths }),
    );
  },
);
