import fs from "fs/promises";
import path from "path";
import checkDiskSpace from "check-disk-space";
import md5File from "md5-file";
import * as models from "medior/_generated/server/models";
import { AnyBulkWriteOperation } from "mongodb";
import mongoose from "mongoose";
import {
  checkFileExists,
  dirToFilePaths,
  fileLog,
  makePerfLog,
  removeEmptyFolders,
} from "trabecula/utils/server";
import { SortValue } from "medior/store/_generated";
import * as actions from "medior/server/database/actions";
import {
  canRunBackgroundQueues,
  makeBackgroundOperationRunner,
} from "medior/server/database/actions/background-operations";
import { runBackgroundExecution } from "medior/server/database/background-execution";
import {
  areMediaPathIndexesReady,
  assertMediaPathIndexesReady,
  assertMediaPathsAvailable,
  describeFileCleanup,
  FileCleanup,
  FileOperationModel,
  finishFileOperation,
} from "medior/server/database/file-operations";
import { assertImportEntriesReady } from "medior/server/database/import-entry-state";
import { normalizeMediaPathWrites } from "medior/server/database/media-paths";
import {
  getBackgroundSession,
  getMetadataCreateId,
  metadataWriteOptions,
  readMetadataSnapshot,
  readSavedMetadataSnapshot,
  registerMetadataWork,
  repairMetadata,
} from "medior/server/database/metadata-work";
import { makeRepairReporter } from "medior/server/database/repair-progress";
import { repairThumbnail } from "medior/server/database/thumbnail-repair";
import { ThumbnailNtfsMetadata } from "medior/server/database/types";
import { isServerStopping } from "medior/server/process-lifecycle";
import { chunkArray, CONSTANTS, dayjs, Fmt, hasTranscription } from "medior/utils/common";
import {
  analyzeAudio,
  getConfig,
  getNtfsFileIdentity,
  leanModelToJson,
  makeAction,
  objectId,
  objectIds,
  releaseTranscriptionModel,
  retainTranscriptionModel,
  socket,
} from "medior/utils/server";
import { getMediaInfo, getVideoInfo } from "medior/utils/server/videos";

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

const processFileTagAncestorRegenQueue = async () => {
  while (canRunBackgroundQueues()) {
    let operation: models.BackgroundOperationSchema;

    try {
      operation = leanModelToJson<models.BackgroundOperationSchema>(
        await models.BackgroundOperationModel.findOne({
          status: { $in: ["PENDING", "RUNNING"] },
          type: "fileTagAncestors",
        })
          .sort({ dateCreated: 1 })
          .lean(),
      );

      if (!operation) return;

      await actions.setBackgroundOperationStatus(operation.id, "COMPLETE", {
        message:
          "Inherited tags now use the current hierarchy; stored ancestor rewrites are no longer required.",
        processedCount: operation.totalCount,
        targetIds: [],
      });
    } catch (error) {
      if (!canRunBackgroundQueues()) return;

      if (!operation) throw error;

      await actions.setBackgroundOperationStatus(operation.id, "ERROR", {
        error: error?.message ?? String(error),
      });
    }
  }
};

makeBackgroundOperationRunner(
  "file tag ancestor regeneration",
  processFileTagAncestorRegenQueue,
  false,
);

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const deleteFiles = makeAction(
  registerMetadataWork(
    "deleteFiles",
    async (args: { fileIds: string[]; withTagRegen?: boolean }) => {
      const cleanupKey = `deleteFilesCleanup:${args.fileIds.join()}`;
      const snapshotKey = `deleteFiles:${args.fileIds.join()}`;
      const tagIds = new Set<string>();

      // Older requests saved one snapshot for the entire selection before deleting any records.
      const previousFiles =
        args.fileIds.length > 200
          ? (
              await readSavedMetadataSnapshot<
                Array<models.FileSchema & { _id: mongoose.Types.ObjectId }>
              >(snapshotKey)
            )?.value
          : null;

      const previousById = new Map(previousFiles?.map((file) => [String(file._id), file]));
      const previousCleanup = previousFiles
        ? (await readSavedMetadataSnapshot<FileCleanup[]>(cleanupKey))?.value
        : null;

      for (const fileIds of chunkArray(args.fileIds, 200)) {
        const files = await readMetadataSnapshot(`deleteFiles:${fileIds.join()}`, async () =>
          previousFiles
            ? fileIds.map((id) => previousById.get(id)).filter(Boolean)
            : models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
                .select({ hash: 1, path: 1, tagIdsWithAncestors: 1, thumb: 1 })
                .lean(),
        );

        const cleanup = await readMetadataSnapshot(
          `deleteFilesCleanup:${fileIds.join()}`,
          async () => {
            const paths = new Set(files.flatMap((file) => [file.path, file.thumb?.path]));
            const cleanup = previousCleanup?.filter((entry) => paths.has(entry.path)) ?? [];

            if (!previousCleanup) {
              for (const path of paths) {
                const entry = await describeFileCleanup(path);

                if (entry) cleanup.push(entry);
              }
            }

            return cleanup;
          },
        );

        const currentFiles = await models.FileModel.find({
          _id: { $in: files.map((file) => file._id) },
        })
          .select({ hash: 1, path: 1, thumb: 1 })
          .lean();

        const currentById = new Map(currentFiles.map((file) => [String(file._id), file]));

        for (const file of files) {
          const current = currentById.get(String(file._id));

          if (
            current &&
            (current.hash !== file.hash ||
              current.path !== file.path ||
              current.thumb?.path !== file.thumb?.path)
          )
            throw new Error("File changed while preparing deletion; retry deletion");

          for (const id of file.tagIdsWithAncestors) tagIds.add(String(id));
        }

        const transforms = await actions.deleteFileTransformsByFileIds({ fileIds });

        if (!transforms.success) throw new Error(transforms.error);

        const collRes = await actions.listCollectionsByFileIds({ fileIds });

        if (!collRes.success) throw new Error(collRes.error);

        const fileIdSet = new Set(fileIds);

        for (const collection of collRes.data) {
          const fileIdIndexes = collection.fileIdIndexes.filter(
            ({ fileId }) => !fileIdSet.has(String(fileId)),
          );

          const updated = fileIdIndexes.length
            ? await actions.updateCollection({ fileIdIndexes, id: collection.id })
            : await actions.deleteCollections({ ids: [collection.id] });

          if (!updated.success) throw new Error(updated.error);
        }

        const fileHashes = files.map((file) => file.hash);

        if (files.length)
          await models.FileModel.deleteMany({
            $or: files.map((file) => ({
              _id: file._id,
              hash: file.hash,
              path: file.path,
              "thumb.path": file.thumb?.path ?? null,
            })),
          });

        if (await models.FileModel.exists({ _id: { $in: fileIds } }))
          throw new Error(
            "A file changed during deletion. Its current media and record were retained.",
          );

        if (fileHashes.length)
          await models.DeletedFileModel.bulkWrite(
            fileHashes.map((hash) => ({
              updateOne: { filter: { hash }, update: { $setOnInsert: { hash } }, upsert: true },
            })),
            { session: getBackgroundSession() },
          );

        await actions.queueTagMetadataRegen([...tagIds]);

        const operation = cleanup.length
          ? await FileOperationModel.findOneAndUpdate(
              { _id: String(getMetadataCreateId(`deleteFilesCleanup:${fileIds.join()}`)) },
              { $setOnInsert: { cleanup, state: "COMMITTED" } },
              { ...metadataWriteOptions(), new: true, upsert: true },
            )
          : null;

        if (operation)
          finishFileOperation(operation._id).catch((error) =>
            console.error("File deletion committed; cleanup retained:", error),
          );

        socket.emit("onFilesDeleted", { fileHashes, fileIds });
      }

      return { tagIds: [...tagIds] };
    },
    true,
  ),
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

      const chunks = chunkArray(filePaths, 200);
      let deletedCount = 0;

      for (const chunk of chunks) {
        const fileHashes: string[] = [];

        for (const filePath of chunk) fileHashes.push(await md5File(filePath));

        fileLog(`[DFE] Hashed ${fileHashes.length} file hashes.`);

        await models.DeletedFileModel.bulkWrite(
          fileHashes.map((hash) => ({
            updateOne: { filter: { hash }, update: { $setOnInsert: { hash } }, upsert: true },
          })),
          { session: getBackgroundSession() },
        );

        const operation = await FileOperationModel.create({
          cleanup: chunk.map((filePath, index) => ({
            hash: fileHashes[index],
            path: filePath,
            pathKey: path.resolve(filePath).toLowerCase(),
          })),
          state: "COMMITTED",
        });

        fileLog(`[DFE] Stored ${fileHashes.length} file hashes.`);

        await finishFileOperation(operation._id);
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
  registerMetadataWork(
    "editFileTags",
    async ({
      addedTagIds = [],
      batchId,
      fileIds,
      removedTagIds = [],
      withRegen = true,
    }: {
      addedTagIds?: string[];
      batchId?: string;
      fileIds: string[];
      removedTagIds?: string[];
      withRegen?: boolean;
      withSub?: boolean;
    }) => {
      if (!fileIds.length) throw new Error("Missing fileIds in editFileTags");

      if (!addedTagIds.length && !removedTagIds.length)
        throw new Error("Missing updated tagIds in editFileTags");

      if (batchId) await assertImportEntriesReady();

      const dateModified = dayjs().toISOString();
      const fileBulkWriteOps: AnyBulkWriteOperation<models.FileSchema>[] = [];
      const fileImportBatchBulkWriteOps: AnyBulkWriteOperation<models.FileImportBatchSchema>[] = [];

      if (addedTagIds.length > 0) {
        fileBulkWriteOps.push({
          updateMany: {
            filter: { _id: objectIds(fileIds) },
            update: { $addToSet: { tagIds: { $each: addedTagIds } }, $set: { dateModified } },
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
            update: { $pullAll: { tagIds: removedTagIds }, $set: { dateModified } },
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

      if (fileBulkWriteOps.length)
        await models.FileModel.bulkWrite(normalizeMediaPathWrites("File", fileBulkWriteOps), {
          session: getBackgroundSession(),
        });

      if (fileImportBatchBulkWriteOps.length)
        await models.FileImportBatchModel.bulkWrite(fileImportBatchBulkWriteOps, {
          session: getBackgroundSession(),
        });

      const changedTagIds = [...new Set([...addedTagIds, ...removedTagIds])];

      if (withRegen) {
        await actions.queueTagMetadataRegen(changedTagIds);

        const collectionRes = await actions.regenCollAttrs({ fileIds });

        if (!collectionRes.success) throw new Error(collectionRes.error);
      }
    },
  ),
  ({ addedTagIds = [], batchId, fileIds, removedTagIds = [], withSub = true }) => {
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

export const importFile = makeAction(
  registerMetadataWork(
    "importFile",
    async ({
      withTagRegen = true,
      ...args
    }: Omit<models.FileSchema, "id"> & { withTagRegen?: boolean }) => {
      const [tagIdsWithAncestors] = await Promise.all([
        actions.deriveAncestorTagIds(args.tagIds),
        assertMediaPathsAvailable([args.path, args.thumb?.path]),
      ]);

      const file: Omit<models.FileSchema, "id"> = {
        ...args,
        dateModified: args.dateModified ?? dayjs().toISOString(),
        isArchived: false,
        originalBitrate: args.originalBitrate ?? args.bitrate,
        originalHash: args.originalHash ?? args.hash,
        originalSize: args.originalSize ?? args.size,
        rating: 0,
        tagIdsWithAncestors,
      };

      const res = await models.FileModel.findOneAndUpdate(
        { hash: file.hash },
        { $setOnInsert: file },
        { ...metadataWriteOptions(), new: true, upsert: true },
      ).select("-tagIdsWithAncestors");

      const id = res._id.toString();

      if (withTagRegen) await actions.queueTagMetadataRegen(file.tagIds, file.tagIdsWithAncestors);

      // The insert already resolved these tags. A concurrent duplicate may have different tags.
      const importedTagIds = new Set(file.tagIds.map(String));
      const storedTagIds = new Set(res.tagIds.map(String));
      const sameTags =
        importedTagIds.size === storedTagIds.size &&
        [...storedTagIds].every((tagId) => importedTagIds.has(tagId));

      return {
        ...res.toObject(),
        id,
        tagIdsWithAncestors: sameTags
          ? tagIdsWithAncestors
          : await actions.deriveAncestorTagIds(res.tagIds.map(String)),
      };
    },
  ),
);

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

export const listFileReingestMetadata = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  if (fileIds.length > 1000)
    throw new Error("File reingest metadata accepts at most 1000 IDs per request.");

  const files = await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ dateCreated: 1, ext: 1, originalName: 1, originalPath: 1, size: 1 })
    .lean();

  return files.map((file) => ({
    dateCreated: file.dateCreated,
    ext: file.ext,
    id: String(file._id),
    originalName: file.originalName,
    originalPath: file.originalPath,
    size: file.size,
  }));
});

export const listFileSelectionState = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  if (fileIds.length > 1000)
    throw new Error("File selection state accepts at most 1000 IDs per request.");

  const files = await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ isArchived: 1 })
    .lean();

  return files.map((file) => ({ id: String(file._id), isArchived: file.isArchived }));
});

export const listFileTagIds = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  if (fileIds.length > CONSTANTS.FILE.TAG_QUERY_BATCH_SIZE)
    throw new Error(`Query at most ${CONSTANTS.FILE.TAG_QUERY_BATCH_SIZE} files at a time`);

  const tagIds = new Set<string>();
  const cursor = models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ _id: 0, tagIds: 1 })
    .lean()
    .cursor({ batchSize: 100 });

  try {
    for await (const file of cursor) {
      for (const tagId of file.tagIds) tagIds.add(String(tagId));
    }
  } finally {
    await cursor.close();
  }

  return [...tagIds];
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

const missingVideoInfoFilter = {
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
};

export const listVideosWithMissingInfo = makeAction(async () => {
  const files = await models.FileModel.find(missingVideoInfoFilter)
    .allowDiskUse(true)
    .select({ _id: 1, isCorrupted: 1, path: 1 })
    .lean();

  return files.map((f) => ({ id: f._id.toString(), isCorrupted: f.isCorrupted, path: f.path }));
});

export const repairVideoCodecs = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, report, run, signal } = makeRepairReporter(repairId, "repairVideoCodecs");

  return run(async () => {
    let corruptedCount = 0;
    let processedCount = 0;

    while (true) {
      checkCancelled();

      // Missing metadata is the durable pending-work predicate; committed repairs leave this set.
      const files = await models.FileModel.find({
        ...missingVideoInfoFilter,
        isCorrupted: { $ne: true },
      })
        .select({ hash: 1, path: 1 })
        .sort({ _id: 1 })
        .limit(100)
        .lean();

      if (!files.length) break;

      await Promise.all(
        Array.from({ length: Math.min(10, files.length) }, (_, worker) =>
          runBackgroundExecution(
            async () => {
              for (let index = worker; index < files.length; index += 10) {
                checkCancelled();

                const file = files[index];
                let updates: Partial<models.FileSchema>;

                try {
                  updates = await getVideoInfo(file.path, signal);
                } catch (error) {
                  signal.throwIfAborted();
                  checkCancelled();
                  updates = { isCorrupted: true };

                  report(
                    `Failed to read codec information for ${file.path}: ${error.message}.`,
                    "error",
                  );
                }

                await (async () => {
                  checkCancelled();

                  const current = await models.FileModel.findById(file._id)
                    .select({ hash: 1, path: 1 })
                    .lean();

                  if (!current || current.hash !== file.hash || current.path !== file.path) return;

                  const result = await actions.updateFile({
                    args: { id: String(file._id), updates },
                  });

                  if (!result.success) throw new Error(result.error);
                })();

                if (updates.isCorrupted) corruptedCount++;

                processedCount++;

                if (processedCount % 25 === 0)
                  report(
                    `Inspected ${processedCount} videos; ${corruptedCount} were marked corrupted.`,
                    "progress",
                  );
              }
            },
            signal,
            false,
          ),
        ),
      );
    }

    report(
      `Codec inspection completed: inspected ${processedCount} videos and marked ${corruptedCount} corrupted.`,
      "success",
    );

    return { corruptedCount, processedCount };
  });
});

export const loadFaceApiNets = makeAction(async () => {
  // const faceapi = await import("@vladmandic/face-api/dist/face-api.node-gpu.js");
  // await faceapi.nets.ssdMobilenetv1.loadFromDisk(FACE_MODELS_PATH);
  // await faceapi.nets.faceLandmark68Net.loadFromDisk(FACE_MODELS_PATH);
  // await faceapi.nets.faceExpressionNet.loadFromDisk(FACE_MODELS_PATH);
  // await faceapi.nets.faceRecognitionNet.loadFromDisk(FACE_MODELS_PATH);
});

export const relinkFiles = makeAction(
  registerMetadataWork(
    "relinkFiles",
    async (args: {
      filesToRelink: {
        expectedHash?: string;
        expectedPath?: string;
        expectedThumbPath?: string | null;
        id: string;
        path: string;
        thumbPath?: string | null;
      }[];
    }) => {
      if (!args.filesToRelink.length) return;

      await assertImportEntriesReady();

      const oldFiles = await readMetadataSnapshot("relink-files", async () =>
        (
          await models.FileModel.find({
            _id: { $in: objectIds(args.filesToRelink.map((f) => f.id)) },
          }).lean()
        ).map(leanModelToJson<models.FileSchema>),
      );

      const filesToRelinkMap = new Map(args.filesToRelink.map((f) => [f.id, f]));

      if (filesToRelinkMap.size !== args.filesToRelink.length)
        throw new Error("Each file can only be relinked once per request");

      if (oldFiles.length !== filesToRelinkMap.size)
        throw new Error("Some files to relink were not found");

      const newFilesMap = new Map<string, { path: string; thumb: models.FileSchema["thumb"] }>();

      oldFiles.forEach((f) => {
        const request = filesToRelinkMap.get(f.id);
        const newPath = request.path;

        if (
          (request.expectedHash !== undefined && request.expectedHash !== f.hash) ||
          (request.expectedPath !== undefined && request.expectedPath !== f.path) ||
          (request.expectedThumbPath !== undefined &&
            request.expectedThumbPath !== (f.thumb?.path ?? null))
        )
          throw new Error("A file changed during storage reconciliation. Run Scan again.");

        const thumbPath =
          request.thumbPath !== undefined
            ? request.thumbPath
            : path.resolve(
                path.dirname(newPath),
                f.thumb?.path ? path.basename(f.thumb.path) : `${f.hash}-thumb.jpg`,
              );

        const newThumb =
          thumbPath === (f.thumb?.path ?? null)
            ? f.thumb
            : { ...f.thumb, ntfsFileId: undefined, ntfsVolumeId: undefined, path: thumbPath };

        newFilesMap.set(f.id, { path: newPath, thumb: newThumb });
      });

      await assertMediaPathsAvailable(
        [...newFilesMap.values()].flatMap(({ path, thumb }) => [path, thumb?.path]),
      );

      const fileRes = await models.FileModel.bulkWrite(
        normalizeMediaPathWrites(
          "File",
          oldFiles.map((file) => ({
            updateOne: {
              filter: {
                $or: [
                  { path: file.path, "thumb.path": file.thumb?.path ?? null },
                  {
                    path: newFilesMap.get(file.id).path,
                    "thumb.path": newFilesMap.get(file.id).thumb?.path ?? null,
                  },
                ],
                _id: objectId(file.id),
                hash: file.hash,
              },
              update: { $set: newFilesMap.get(file.id) },
            },
          })),
        ),
        { session: getBackgroundSession() },
      );

      if (fileRes.matchedCount !== newFilesMap.size)
        throw new Error(`Failed to bulk write relinked file: ${JSON.stringify(fileRes, null, 2)}`);

      const fileIds = [...newFilesMap.keys()];

      await actions.queueTagMetadataRegen(oldFiles.flatMap((file) => file.tagIds.map(String)));

      const collRes = await actions.regenCollAttrs({ fileIds });

      if (!collRes.success) throw new Error(`Failed to update collections: ${collRes.error}`);

      await models.FileImportModel.bulkWrite(
        [...newFilesMap].map(([fileId, updates]) => ({
          updateMany: {
            filter: { fileId },
            update: { $set: { thumb: updates.thumb } },
          },
        })),
        { session: getBackgroundSession() },
      );

      for (const [id, updates] of newFilesMap) socket.emit("onFileUpdated", { id, updates });
    },
    true,
  ),
);

export const repairFilesWithBrokenExt = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, report, run } = makeRepairReporter(repairId, "repairFiles");

  return run(async () => {
    let filesWithDotPrefixCount = 0;
    let filesWithIncorrectExtCount = 0;

    report("Detecting file formats from their contents in bounded batches.");

    await repairMetadata(
      models.FileModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean().cursor({ batchSize: 100 }),
      async (candidate) => {
        checkCancelled();

        const file = await models.FileModel.findById(candidate._id).lean();
        let result: { dotPrefix: boolean } = null;

        if (file) {
          const info = await getMediaInfo(file.path);

          if (file.ext !== info.ext || (info.isAnimated && !(file.duration > 0))) {
            await repairThumbnail(leanModelToJson<models.FileSchema>(file), false, [], {
              withTranscription: false,
              withWaveform: false,
            });

            checkCancelled();
            result = { dotPrefix: file.ext?.startsWith(".") ?? false };
          }
        }

        return result;
      },
      async ({ result }) => {
        checkCancelled();

        if (result) {
          if (result.dotPrefix) filesWithDotPrefixCount++;

          filesWithIncorrectExtCount++;
        }
      },
    );

    report(
      `File extension repair completed successfully: updated ${filesWithIncorrectExtCount} files.`,
      "success",
    );

    return { filesWithDotPrefixCount, filesWithIncorrectExtCount };
  });
});

export const repairFilesWithMissingInfo = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, report, run } = makeRepairReporter(repairId, "repairFiles");

  return run(async () => {
    report("Checking original video information in bounded metadata batches.");

    await repairMetadata(
      models.FileModel.find({
        ext: { $in: CONSTANTS.VIDEO.EXTS },
        $or: ["bitrate", "size", "videoCodec"].map((name) => ({
          [name]: { $exists: true, $ne: null },
          $or: [
            { [`original${Fmt.capitalize(name)}`]: null },
            { [`original${Fmt.capitalize(name)}`]: "" },
          ],
        })),
      })
        .select({ _id: 1 })
        .sort({ _id: 1 })
        .lean()
        .cursor(),
      async (candidate) => {
        checkCancelled();

        const file = await models.FileModel.findById(candidate._id)
          .select({
            bitrate: 1,
            ext: 1,
            originalBitrate: 1,
            originalSize: 1,
            originalVideoCodec: 1,
            size: 1,
            videoCodec: 1,
          })
          .lean();

        if (!file || !CONSTANTS.VIDEO.EXTS.some((ext) => ext === file.ext)) return;

        const updates: Partial<models.FileSchema> = {};

        for (const name of ["bitrate", "size", "videoCodec"] as const) {
          const originalName = `original${Fmt.capitalize(name)}`;

          if (file[name] != null && (file[originalName] == null || file[originalName] === ""))
            updates[originalName] = file[name];
        }

        if (!Object.keys(updates).length) return;

        await models.FileModel.updateOne({ _id: file._id }, { $set: updates });
        socket.emit("onFileUpdated", { id: String(file._id), updates });
        checkCancelled();
      },
    );

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
          $or: [{ "transcription.text": null }, { "transcription.text": /^\s*$/ }],
          duration: { $lte: maxTranscriptionDuration },
        });

      if (repairWaveforms) missingFilters.push({ "waveformPeaks.0": { $exists: false } });

      if (!missingFilters.length) return { repairedTranscriptions: 0, repairedWaveforms: 0 };

      report(
        `Searching for videos with audio and missing analysis data.${
          repairTranscriptions
            ? ` Transcriptions are limited to ${Fmt.duration(maxTranscriptionDuration)}.`
            : ""
        }`,
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
        .select({
          _id: 1,
          dateModified: 1,
          duration: 1,
          hash: 1,
          path: 1,
          transcription: 1,
          waveformPeaks: 1,
        })
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

      if (repairTranscriptions) retainTranscriptionModel(modelOwnerId, signal);

      try {
        for await (const file of cursor) {
          checkCancelled();
          processedCount++;

          const withTranscription =
            repairTranscriptions &&
            file.duration <= maxTranscriptionDuration &&
            !hasTranscription(file.transcription);

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
            updates.hasTranscript = hasTranscription(analysis.transcription);
            updates.transcription = analysis.transcription;
            repairedTranscriptions++;
          }

          if (withWaveform) {
            updates.waveformPeaks = analysis.waveformPeaks;
            repairedWaveforms++;
          }

          updates.dateModified = dayjs().toISOString();

          const updateRes = await models.FileModel.updateOne(
            {
              _id: file._id,
              dateModified: file.dateModified,
              hash: file.hash,
              path: file.path,
            },
            { $set: updates },
            metadataWriteOptions(),
          );

          if (!updateRes.matchedCount)
            throw new Error("File changed during audio analysis; retry repair");

          socket.emit("onFileUpdated", { id: file._id.toString(), updates });

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
    const updates = { dateModified: dayjs().toISOString(), faceModels: args.faceModels };

    await models.FileModel.findOneAndUpdate({ _id: args.id }, { $set: updates });
    socket.emit("onFilesUpdated", { fileIds: [args.id], updates });
  },
);

export const setFileIsArchived = makeAction(
  registerMetadataWork(
    "setFileIsArchived",
    async (args: { fileIds: string[]; isArchived: boolean }) => {
      const updates = { isArchived: args.isArchived };

      await models.FileModel.updateMany({ _id: { $in: args.fileIds } }, updates);

      if (args.isArchived) {
        const res = await actions.deleteFileTransformsByFileIds({ fileIds: args.fileIds });

        if (!res.success) throw new Error(res.error);
      }
    },
  ),
  ({ fileIds, isArchived }) => {
    if (isArchived) socket.emit("onFilesArchived", { fileIds });

    socket.emit("onFilesUpdated", { fileIds, updates: { isArchived } });
  },
);

export const setFileRating = makeAction(
  registerMetadataWork("setFileRating", async (args: { fileIds: string[]; rating: number }) => {
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

    const collections = await actions.regenCollAttrs({ fileIds: args.fileIds });

    if (!collections.success) throw new Error(collections.error);

    if (tagIds.length) await actions.queueTagMetadataRegen(tagIds);
  }),
);

/* ----------------------------------------------------------------------- */
const fileThumbnailRepairPromises = new Map<
  string,
  Promise<{ status: "repaired" | "skipped"; thumb?: models.FileSchema["thumb"] }>
>();

const fileRefreshAbortControllers = new Map<string, AbortController>();

const repairFileThumbnailMetadata = registerMetadataWork(
  "repairFileThumbnail",
  async ({ fileId, onlyIfMissing = false }: { fileId: string; onlyIfMissing?: boolean }) => {
    const fileModel = await models.FileModel.findById(fileId).lean();

    if (!fileModel) throw new Error(`File ${fileId} was not found.`);

    const file = leanModelToJson<models.FileSchema>(fileModel);
    const hasThumbnail =
      onlyIfMissing && file.thumb?.path && (await checkFileExists(file.thumb.path));

    if (hasThumbnail) {
      return { status: "skipped" as const, thumb: file.thumb };
    } else if (file.isCorrupted) {
      return { status: "skipped" as const };
    } else {
      const expectedThumbPath = path.resolve(path.dirname(file.path), `${file.hash}-thumb.jpg`);
      const hasExpectedThumbnail = onlyIfMissing && (await checkFileExists(expectedThumbPath));
      const info = await repairThumbnail(file, hasExpectedThumbnail);

      return { status: "repaired" as const, thumb: info.thumb };
    }
  },
  true,
);

export const repairFileThumbnail = makeAction(
  async (args: {
    fileId: string;
    onlyIfMissing?: boolean;
  }): Promise<{
    status: "repaired" | "skipped" | "waiting";
    thumb?: models.FileSchema["thumb"];
  }> => {
    if (!(await areMediaPathIndexesReady())) return { status: "waiting" };

    const pendingRepair = fileThumbnailRepairPromises.get(args.fileId);

    if (pendingRepair) return pendingRepair;

    const repairPromise = repairFileThumbnailMetadata(args);

    fileThumbnailRepairPromises.set(args.fileId, repairPromise);

    try {
      return await repairPromise;
    } finally {
      fileThumbnailRepairPromises.delete(args.fileId);
    }
  },
);

makeBackgroundOperationRunner("thumbnail recovery", async () => {
  for await (const operation of FileOperationModel.find({
    error: { $exists: false },
    kind: "thumbnail",
    state: "PREPARED",
  })
    .lean()
    .cursor()) {
    if (!canRunBackgroundQueues()) return;

    const result = await repairFileThumbnail({ fileId: operation.fileId });

    if (!result.success) {
      await FileOperationModel.updateOne(
        { _id: operation._id, state: "PREPARED" },
        { $set: { error: result.error } },
      );
    }
  }
});

export const repairThumbnailNtfsMetadata = makeAction(
  async ({ repairId }: { repairId: string }) => {
    const { checkCancelled, report, run } = makeRepairReporter(
      repairId,
      "repairThumbnailNtfsMetadata",
    );

    return run(async () => {
      await assertMediaPathIndexesReady();

      const filter = {
        $or: [
          { "thumb.ntfsFileId": { $exists: false } },
          { "thumb.ntfsFileId": null },
          { "thumb.ntfsVolumeId": { $exists: false } },
          { "thumb.ntfsVolumeId": null },
        ],
        "thumb.path": { $exists: true, $nin: [null, ""] },
      };

      const totalCount = await models.FileModel.countDocuments(filter);
      let cursor: mongoose.Types.ObjectId;
      let failedCount = 0;
      let inspectedCount = 0;
      let storedCount = 0;

      report(`Found ${totalCount} thumbnails missing NTFS ordering metadata.`, "progress");

      while (!isServerStopping()) {
        checkCancelled();

        const files = await models.FileModel.find({
          ...filter,
          ...(cursor ? { _id: { $gt: cursor } } : {}),
        })
          .sort({ _id: 1 })
          .limit(CONSTANTS.FILE.THUMB.NTFS_BATCH_SIZE)
          .select({ _id: 1, thumb: 1 })
          .lean();

        if (!files.length) break;

        for (const file of files) {
          checkCancelled();

          let identity: Awaited<ReturnType<typeof getNtfsFileIdentity>>;

          try {
            try {
              identity = await getNtfsFileIdentity(file.thumb.path);
            } catch (error) {
              if (error.code !== "ENOENT") throw error;

              checkCancelled();

              const repaired = await repairFileThumbnail({
                fileId: String(file._id),
                onlyIfMissing: true,
              });

              checkCancelled();

              if (!repaired.success) throw new Error(repaired.error);

              if (!repaired.data.thumb?.path)
                throw new Error("Missing thumbnail could not be repaired for a corrupted file.");

              file.thumb = repaired.data.thumb;
              identity = await getNtfsFileIdentity(file.thumb.path);
            }
          } catch (error) {
            checkCancelled();
            failedCount++;

            if (failedCount <= 5)
              report(
                `Could not inspect thumbnail identity for file ${file._id} (${file.thumb.path}): ${error?.message ?? String(error)}`,
                "error",
              );

            continue;
          }

          storedCount += await storeThumbnailNtfsMetadata([
            {
              fileId: String(file._id),
              ntfsFileId: identity.fileId,
              ntfsVolumeId: identity.volumeId,
              sourcePath: file.thumb.path,
            },
          ]);
        }

        cursor = files[files.length - 1]._id;
        inspectedCount += files.length;

        report(
          `Inspected ${inspectedCount} / ${totalCount} thumbnails; stored ${storedCount} NTFS identities and could not inspect ${failedCount}.`,
          "progress",
        );
      }

      checkCancelled();

      if (failedCount)
        throw new Error(
          `${failedCount} thumbnail identities could not be inspected; successful repairs were retained.`,
        );

      report(
        `Thumbnail NTFS metadata repair completed successfully: inspected ${inspectedCount} thumbnails, stored ${storedCount} identities, and could not inspect ${failedCount}.`,
        "success",
      );

      return { failedCount, inspectedCount, storedCount };
    });
  },
);

// @generator-ignore-export
export const storeThumbnailNtfsMetadata = async (metadataItems: ThumbnailNtfsMetadata[]) => {
  if (!metadataItems.length) return 0;

  const result = await models.FileModel.bulkWrite(
    normalizeMediaPathWrites(
      "File",
      metadataItems.map((metadata) => ({
        updateOne: {
          filter: { _id: objectId(metadata.fileId), "thumb.path": metadata.sourcePath },
          update: {
            $set: {
              "thumb.ntfsFileId": metadata.ntfsFileId,
              "thumb.ntfsVolumeId": metadata.ntfsVolumeId,
            },
          },
        },
      })),
    ),
    { session: getBackgroundSession(), ...metadataWriteOptions() },
  );

  return result.matchedCount;
};

export const cancelFileRefresh = makeAction(async ({ refreshId }: { refreshId: string }) => {
  const abortController = fileRefreshAbortControllers.get(refreshId);
  abortController?.abort();
  await releaseTranscriptionModel(`file-refresh:${refreshId}`);

  return Boolean(abortController);
});

export const finishFileRefresh = makeAction(async ({ refreshId }: { refreshId: string }) => {
  fileRefreshAbortControllers.get(refreshId)?.abort();
  fileRefreshAbortControllers.delete(refreshId);
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
    const abortController = fileRefreshAbortControllers.get(refreshId) ?? new AbortController();

    if (refreshId) {
      fileRefreshAbortControllers.set(refreshId, abortController);

      if (withTranscription ?? getConfig().file.transcription.enabled)
        retainTranscriptionModel(`file-refresh:${refreshId}`, abortController.signal);
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

      return await runBackgroundExecution(
        () =>
          repairThumbnail(file, false, [], {
            onProgress: report,
            signal: abortController.signal,
            withTranscription,
            withWaveform,
          }),
        abortController.signal,
        false,
      );
    } finally {
      if (!refreshId) abortController.abort();
    }
  },
);

/* ----------------------------------------------------------------------- */
class ThumbRepairer {
  private checkCancelled: ReturnType<typeof makeRepairReporter>["checkCancelled"];
  private chunkSize = 1000;
  private errorCount = 0;
  private fileChunkIteration = 0;
  private hasFilesWithOldThumbPaths = false;
  private hasInvalidThumbnails = false;
  private hasMorePages = true;
  private logTag = "[repairThumbs]";
  private perfLog: (str: string) => void;
  private perfLogTotal: (str: string) => void;
  private report: ReturnType<typeof makeRepairReporter>["report"];
  private tagCount = 0;
  private thumbMap = new Map<string, models.FileSchema["thumb"]>();
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
            `Failed to repair thumbnail for file ${file.id} (${file.path}): ${error?.message ?? String(error)}`,
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
    const files = await this.getFilesWithThumbPaths();

    this.hasMorePages = files.length === this.chunkSize;
    this.hasFilesWithOldThumbPaths ||= files.length > 0;
    this.fileChunkIteration++;

    for (const file of files) {
      this.checkCancelled();

      const info = await repairThumbnail(file, false, file.thumbPaths);

      this.thumbMap.set(file.id, info.thumb);
    }

    this.progressLog(
      `Repaired ${files.length} legacy thumbnail records in iteration ${this.fileChunkIteration}.`,
    );
  };

  private processTags = async () => {
    this.checkCancelled();

    const filter = { thumbPaths: { $exists: true } };

    this.tagCount = 0;

    while (true) {
      this.checkCancelled();

      const tags = await models.TagModel.find(filter, null, { strict: false })
        .select({ _id: 1 })
        .sort({ _id: 1 })
        .limit(100)
        .lean();

      if (!tags.length) break;

      const result = await actions.regenTagMeta({ tagIds: tags.map(({ _id }) => String(_id)) });

      if (!result.success) throw new Error(result.error);

      this.tagCount += tags.length;
    }

    this.progressLog(
      `Regenerated thumbnail metadata and removed legacy thumbnail paths on ${this.tagCount} tags.`,
    );
  };

  private regenThumbs = async (file: models.FileSchema, skipThumbs = false) => {
    this.checkCancelled();

    const info = await repairThumbnail(file, skipThumbs);

    this.checkCancelled();
    this.thumbMap.set(file.id, info.thumb);
  };

  private fixMalformedThumbPaths = async () => {
    const filter = { "thumb.path": { $regex: "\\\\.jpg$" } };

    await repairMetadata(models.FileModel.find(filter).lean().cursor(), async (file) => {
      const current = await models.FileModel.findById(file._id).lean();

      if (!current?.thumb?.path?.endsWith("\\.jpg")) return;

      const updated = await actions.updateFile({
        args: {
          id: String(current._id),
          updates: {
            thumb: { ...current.thumb, path: current.thumb.path.replace(/\\\.jpg$/, ".jpg") },
          },
        },
      });

      if (!updated.success) throw new Error(updated.error);

      await actions.queueTagMetadataRegen(current.tagIds.map(String));

      const collections = await actions.regenCollAttrs({ fileIds: [String(current._id)] });

      if (!collections.success) throw new Error(collections.error);
    });

    let lastId: mongoose.Types.ObjectId;

    while (true) {
      this.checkCancelled();

      const tags = await models.TagModel.find({
        ...filter,
        ...(lastId ? { _id: { $gt: lastId } } : {}),
      })
        .select({ _id: 1 })
        .sort({ _id: 1 })
        .limit(100)
        .lean();

      if (!tags.length) break;

      const result = await actions.regenTagMeta({ tagIds: tags.map(({ _id }) => String(_id)) });

      if (!result.success) throw new Error(result.error);

      lastId = tags[tags.length - 1]._id;
    }

    this.progressLog("Repaired malformed thumbnail references and dependent metadata.");
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

    await this.processTags();

    if (!this.hasFilesWithOldThumbPaths && !this.hasInvalidThumbnails) {
      this.perfLogTotal("No files to process found");

      this.report(
        "Thumbnail repair completed successfully: no remaining files required repair.",
        "success",
      );

      return { fileCount: this.thumbMap.size, tagCount: this.tagCount };
    }

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
