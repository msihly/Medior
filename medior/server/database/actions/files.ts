import fs from "fs/promises";
import path from "path";
import checkDiskSpace from "check-disk-space";
import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import mongoose, { AnyBulkWriteOperation } from "mongoose";
import os from "os";
import { isServerStopping } from "trabecula/utils/process";
import {
  checkFileExists,
  dirToFilePaths,
  fileLog,
  makePerfLog,
  md5File,
  removeEmptyFolders,
} from "trabecula/utils/server";
import { promisify } from "util";
import { gzip } from "zlib";
import { SortValue } from "medior/store/_generated";
import * as actions from "medior/server/database/actions";
import {
  canRunBackgroundQueues,
  makeBackgroundOperationRunner,
  runFileCleanupQueue,
} from "medior/server/database/actions/background-operations";
import { runBackgroundExecution } from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";
import { getForeignFileLock } from "medior/server/database/file-locks";
import {
  areMediaPathIndexesReady,
  assertMediaPathIndexesReady,
  assertMediaPathsAvailable,
  describeFileCleanupBySize,
  FileCleanup,
  FileOperationModel,
  finishFileOperation,
  makeFileCleanup,
} from "medior/server/database/file-operations";
import { assertImportEntriesReady } from "medior/server/database/import-entry-state";
import {
  addToJob,
  findJob,
  isJobStopping,
  startJob,
  waitForJob,
} from "medior/server/database/jobs";
import { mediaPathKey, normalizeMediaPathWrites } from "medior/server/database/media-paths";
import {
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
import {
  chunkArray,
  CONSTANTS,
  dayjs,
  FILE_SIDECAR_FIELDS,
  FileSidecarCollection,
  FileSidecarField,
  Fmt,
  getSubtitleFilePaths,
  hasTranscription,
} from "medior/utils/common";
import {
  analyzeDecodedAudio,
  assertAudioSimilarityModel,
  AUDIO_DECODE_ERROR,
  AudioAnalysis,
  AudioAnalysisOptions,
  AudioVectorWindow,
  DecodedAudio,
  getConfig,
  getMaxAudioWindowCount,
  getNtfsFileIdentity,
  getThumbNtfsIdentity,
  leanModelToJson,
  makeAction,
  makeOrderedAudioDecoder,
  objectId,
  objectIds,
  releaseTranscriptionModel,
  retainTranscriptionModel,
  socket,
  sortByStoredNtfsIdentity,
  vectorRpc,
} from "medior/utils/server";
import { getMediaInfo, getVideoInfo } from "medior/utils/server/videos";
import { workSignal } from "medior/utils/server/work-signal";

/** Videos decoded ahead of the one being analyzed, so drive reads continue during its analysis. */
const AUDIO_DECODE_LOOKAHEAD = 8;
/** Seconds of audio past the similarity limit decoded to tell when a stored duration is wrong. */
const AUDIO_DURATION_MARGIN = 1;
/** Videos sent to the vector server per write, which bounds batches of silent videos too. */
const AUDIO_VECTOR_FLUSH_FILE_COUNT = 500;
/** Audio windows sent to the vector server per write, about 20 MB of CED-Mini float64 vectors. */
const AUDIO_VECTOR_FLUSH_WINDOW_COUNT = 10_000;

const gzipAsync = promisify(gzip);

// const FACE_MIN_CONFIDENCE = 0.4;
// const FACE_MODELS_PATH = process.env.IS_PACKAGED
//   ? path.resolve(process.env.RESOURCES_PATH, "extraResources/face-models")
//   : "medior/face-models";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
/** Writes a repair's updates only while the file keeps the content and path the repair read. */
const updateFileIfUnchanged = async (
  file: Pick<models.FileSchema, "hash" | "path"> & { _id: mongoose.Types.ObjectId },
  updates: Partial<models.FileSchema>,
) => {
  const current = await models.FileModel.findById(file._id).select({ hash: 1, path: 1 }).lean();

  if (current && current.hash === file.hash && current.path === file.path) {
    const result = await actions.updateFile({ args: { id: String(file._id), updates } });
    if (!result.success) throw new Error(result.error);
  }
};

export const listAllArchivedFileIds = makeAction(async () =>
  (await models.FileModel.find({ isArchived: true }).select({ _id: 1 }).lean()).map((file) =>
    file._id.toString(),
  ),
);

export const listFileIdsByTagIds = makeAction(async (args: { tagIds: string[] }) => {
  return (
    await models.FileModel.find({ tagIds: { $in: args.tagIds } })
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
/** Writes import-compatible sidecars into a fresh temp folder, replacing earlier exports. */
export const createFileExportSidecars = makeAction(
  async ({ fields, fileIds }: { fields: FileSidecarField[]; fileIds: string[] }) => {
    const exportsPath = path.join(os.tmpdir(), "medior-exports");
    const exportPath = path.join(exportsPath, randomUUID());

    try {
      await fs.rm(exportsPath, { force: true, recursive: true });
    } catch (error) {
      console.error("Failed to remove previous file exports:", error);
    }

    await fs.mkdir(exportPath, { recursive: true });

    const ids = objectIds(fileIds);
    const selectedFields = FILE_SIDECAR_FIELDS.filter((field) => fields.includes(field));
    const fileFields = selectedFields.filter((field) => field !== "collections");

    const files = new Map(
      (
        await models.FileModel.find({ _id: { $in: ids } })
          .select({
            ...Object.fromEntries(fileFields.map((field) => [field, 1])),
            path: 1,
            subtitles: 1,
            thumb: 1,
          })
          .lean()
      ).map((file) => [file._id.toString(), leanModelToJson<models.FileSchema>(file)]),
    );

    const collections = new Map<string, FileSidecarCollection[]>();

    if (selectedFields.includes("collections")) {
      for (const entry of await models.FileCollectionModel.aggregate<{
        _id: mongoose.Types.ObjectId;
        fileId: mongoose.Types.ObjectId;
        index: number;
      }>([
        { $match: { "fileIdIndexes.fileId": { $in: ids } } },
        { $unwind: "$fileIdIndexes" },
        { $match: { "fileIdIndexes.fileId": { $in: ids } } },
        { $project: { fileId: "$fileIdIndexes.fileId", index: "$fileIdIndexes.index" } },
      ])) {
        const collection = { id: String(entry._id), index: entry.index };
        const fileCollections = collections.get(String(entry.fileId));

        if (fileCollections) fileCollections.push(collection);
        else collections.set(String(entry.fileId), [collection]);
      }
    }

    const filePaths: string[] = [];
    const sidecarPaths: string[] = [];
    const subtitlePaths: string[] = [];
    let thumbPath: string = null;

    for (const fileId of fileIds) {
      const file = files.get(fileId);
      if (!file) continue;

      const sidecar = Object.fromEntries(
        selectedFields.map((field) => [
          field,
          field === "collections" ? (collections.get(fileId) ?? []) : file[field],
        ]),
      );
      const sidecarPath = path.join(exportPath, `${path.parse(file.path).name}.json`);

      await fs.writeFile(
        sidecarPath,
        JSON.stringify(sidecar, (key, value) => (key === "_id" ? undefined : value), 2),
      );

      filePaths.push(file.path);
      sidecarPaths.push(sidecarPath);
      thumbPath ??= file.thumb.path;

      // Subtitles removed from disk are left out rather than failing the drag.
      for (const subtitlePath of getSubtitleFilePaths(file.subtitles))
        if (await checkFileExists(subtitlePath)) subtitlePaths.push(subtitlePath);
    }

    // Subtitles are named after their media, so re-importing the export matches them again.
    return { filePaths, sidecarPaths, subtitlePaths, thumbPath };
  },
);

export const deleteFiles = makeAction(
  registerMetadataWork(
    "deleteFiles",
    async (args: {
      fileIds: string[];
      withCleanupQueue?: boolean;
      withDeletedHashes?: boolean;
      withTagRegen?: boolean;
    }) => {
      const cleanupIds: string[] = [];
      const cleanupKey = `deleteFilesCleanup:${args.fileIds.join()}`;
      const snapshotKey = `deleteFiles:${args.fileIds.join()}`;
      const tagIds = new Set<string>();
      const keepMetadata = args.withDeletedHashes !== false && getConfig().file.keepDeletedMetadata;

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
                .select(
                  keepMetadata
                    ? {}
                    : {
                        hash: 1,
                        originalHash: 1,
                        path: 1,
                        previousHashes: 1,
                        size: 1,
                        sourceHash: 1,
                        subtitles: 1,
                        tagIdsWithAncestors: 1,
                        thumb: 1,
                      },
                )
                .lean(),
        );

        const cleanup = await readMetadataSnapshot(
          `deleteFilesCleanup:${fileIds.join()}`,
          async () => {
            const paths = new Set(
              files.flatMap((file) => [
                file.path,
                file.thumb?.path,
                ...getSubtitleFilePaths(file.subtitles),
              ]),
            );
            const cleanup = previousCleanup?.filter((entry) => paths.has(entry.path)) ?? [];

            // Cleanup confirms files by size rather than reading them: media by the size it
            // records, and thumbnails and subtitles by the size on disk now. Their metadata is read
            // in disk order, which the thumbnail beside each file's media records.
            if (!previousCleanup) {
              for (const file of sortByStoredNtfsIdentity(files, getThumbNtfsIdentity)) {
                cleanup.push(makeFileCleanup(file.hash, file.path, file.size));

                for (const companionPath of [
                  file.thumb?.path,
                  ...getSubtitleFilePaths(file.subtitles),
                ]) {
                  const companion = await describeFileCleanupBySize(companionPath);
                  if (companion) cleanup.push(companion);
                }
              }
            }

            return cleanup;
          },
        );

        const currentFiles = await models.FileModel.find({
          _id: { $in: files.map((file) => file._id) },
        })
          .select({ hash: 1, path: 1, subtitles: 1, thumb: 1 })
          .lean();

        const currentById = new Map(currentFiles.map((file) => [String(file._id), file]));

        for (const file of files) {
          const current = currentById.get(String(file._id));

          if (
            current &&
            (current.hash !== file.hash ||
              current.path !== file.path ||
              getSubtitleFilePaths(current.subtitles).join() !==
                getSubtitleFilePaths(file.subtitles).join() ||
              current.thumb?.path !== file.thumb?.path)
          )
            throw new Error("File changed while preparing deletion; retry deletion");

          for (const id of file.tagIdsWithAncestors) tagIds.add(String(id));
        }

        const transforms = await actions.deleteFileTransformsByFileIds({ fileIds });

        if (!transforms.success) throw new Error(transforms.error);

        const collections = await models.FileCollectionModel.find({
          "fileIdIndexes.fileId": { $in: fileIds },
        })
          .select({ fileIdIndexes: 1 })
          .lean();

        const fileIdSet = new Set(fileIds);

        for (const collection of collections) {
          const id = String(collection._id);
          const fileIdIndexes = collection.fileIdIndexes.filter(
            ({ fileId }) => !fileIdSet.has(String(fileId)),
          );

          const updated = fileIdIndexes.length
            ? await actions.updateCollection({ fileIdIndexes, id })
            : await actions.deleteCollections({ ids: [id] });

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

        if (files.length && args.withDeletedHashes !== false) {
          const deletedWrites: AnyBulkWriteOperation<models.DeletedFileSchema>[] = [];

          // Sources changed on import and every earlier version of re-encoded, spliced, or edited files count too.
          const getLineageHashes = (
            file: Pick<
              models.FileSchema,
              "hash" | "originalHash" | "previousHashes" | "sourceHash"
            >,
          ) =>
            [file.hash, file.originalHash, file.sourceHash, ...(file.previousHashes ?? [])].filter(
              Boolean,
            );

          const lineageHashes = [...new Set(files.flatMap(getLineageHashes))];

          // Checksums a remaining file still holds, such as an edited copy's original, stay importable.
          // The string type lets each branch use its partial checksum index instead of a full scan.
          const liveHashes = new Set(
            (
              await models.FileModel.find({
                $or: ["hash", "originalHash", "previousHashes", "sourceHash"].map((field) => ({
                  [field]: { $in: lineageHashes, $type: "string" },
                })),
              })
                .select({ hash: 1, originalHash: 1, previousHashes: 1, sourceHash: 1 })
                .lean()
            ).flatMap(getLineageHashes),
          );

          for (const file of files) {
            const metadata = keepMetadata
              ? await gzipAsync(
                  JSON.stringify(file, (key, value) =>
                    key === "tagIdsWithAncestors" ? undefined : value,
                  ),
                )
              : null;

            for (const hash of new Set(getLineageHashes(file))) {
              if (liveHashes.has(hash)) continue;

              deletedWrites.push({
                updateOne: {
                  filter: { hash },
                  update: { $setOnInsert: { hash }, ...(metadata ? { $set: { metadata } } : {}) },
                  upsert: true,
                },
              });
            }
          }

          if (deletedWrites.length)
            await models.DeletedFileModel.bulkWrite(deletedWrites, {
              session: getBackgroundSession(),
            });
        }

        // Callers deleting in several batches regenerate the tags they return once at the end.
        if (args.withTagRegen !== false) await actions.queueTagMetadataRegen([...tagIds]);

        // The cleanup queue outlives this request, whose signal aborts work started inside it.
        // Callers that clean up their own operations as they go start the queue once at the end.
        if (cleanup.length) {
          const cleanupId = String(getMetadataCreateId(`deleteFilesCleanup:${fileIds.join()}`));

          await FileOperationModel.updateOne(
            { _id: cleanupId },
            { $setOnInsert: { cleanup, state: "COMMITTED" } },
            { ...metadataWriteOptions(), upsert: true },
          );

          cleanupIds.push(cleanupId);

          if (args.withCleanupQueue !== false) runFileCleanupQueue();
        }

        socket.emitVolatile("onFilesDeleted", { fileHashes, fileIds });
      }

      return { cleanupIds, tagIds: [...tagIds] };
    },
    { getFileIds: ({ fileIds }) => fileIds, persistInBackground: true },
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
      const previousCount = args.progress?.processedCount ?? 0;
      const totalCount = args.progress?.totalCount ?? filePaths.length;
      let deletedCount = 0;

      for (const chunk of chunks) {
        const fileHashes: string[] = [];
        const fileSizes: number[] = [];

        // The recorded size lets cleanup confirm each file without reading it a second time.
        for (const filePath of chunk) {
          fileHashes.push(await md5File(filePath));
          fileSizes.push((await fs.stat(filePath)).size);
        }

        fileLog(`[DFE] Hashed ${fileHashes.length} file hashes.`);

        await models.DeletedFileModel.bulkWrite(
          fileHashes.map((hash) => ({
            updateOne: { filter: { hash }, update: { $setOnInsert: { hash } }, upsert: true },
          })),
          { session: getBackgroundSession() },
        );

        const operation = await FileOperationModel.create({
          cleanup: chunk.map((filePath, index) =>
            makeFileCleanup(fileHashes[index], filePath, fileSizes[index]),
          ),
          state: "COMMITTED",
        });

        fileLog(`[DFE] Stored ${fileHashes.length} file hashes.`);

        await finishFileOperation(operation._id);
        deletedCount += chunk.length;

        fileLog(`[DFE] Deleted ${previousCount + deletedCount} / ${totalCount} files.`);
      }

      const processedCount = previousCount + filePaths.length;
      const progress = {
        message: `Deleted ${processedCount} / ${totalCount} files.`,
        processedCount,
        totalCount,
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
    { getFileIds: ({ fileIds }) => fileIds },
  ),
  ({ addedTagIds = [], batchId, fileIds, removedTagIds = [], withSub = true }) => {
    if (withSub)
      socket.emitVolatile("onFileTagsUpdated", { addedTagIds, batchId, fileIds, removedTagIds });
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
        isArchived: args.isArchived ?? false,
        originalBitrate: args.originalBitrate ?? args.bitrate,
        originalHash: args.originalHash ?? args.hash,
        originalSize: args.originalSize ?? args.size,
        rating: args.rating ?? 0,
        tagIdsWithAncestors,
      };

      const res = await models.FileModel.findOneAndUpdate(
        { hash: file.hash },
        { $setOnInsert: file },
        { ...metadataWriteOptions(), returnDocument: "after", upsert: true },
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
  $or: [
    { audioBitrate: { $exists: false } },
    { audioBitrate: null },
    { audioCodec: { $exists: false } },
    { audioCodec: "" },
    { bitrate: { $exists: false } },
    { bitrate: null },
    { videoCodec: { $exists: false } },
    { videoCodec: "" },
  ],
  ext: { $in: CONSTANTS.VIDEO.EXTS },
};

export const listVideosWithMissingInfo = makeAction(async () => {
  const files = await models.FileModel.find(missingVideoInfoFilter)
    .allowDiskUse(true)
    .select({ _id: 1, isCorrupted: 1, path: 1 })
    .lean();

  return files.map((f) => ({ id: f._id.toString(), isCorrupted: f.isCorrupted, path: f.path }));
});

export const repairVideoCodecs = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, lock, progress, report, run, signal, unlock } = makeRepairReporter(
    repairId,
    "repairVideoCodecs",
  );

  return run(async () => {
    const filter = {
      ...missingVideoInfoFilter,
      isArchived: { $ne: true },
      isCorrupted: { $ne: true },
    };
    const candidates = await models.FileModel.find(filter)
      .allowDiskUse(true)
      .select({ _id: 1, "thumb.ntfsFileId": 1, "thumb.ntfsVolumeId": 1 })
      .sort({ _id: 1 })
      .lean();
    let corruptedCount = 0;
    let processedCount = 0;

    lock(candidates.map((file) => String(file._id)));

    // Videos are read one at a time in disk order, since reading several at once or out of order
    // makes a hard drive seek. A video's thumbnail is written beside it right after it, so the
    // thumbnail's stored NTFS identity orders the videos without reading the disk.
    const orderedIds = sortByStoredNtfsIdentity(candidates, getThumbNtfsIdentity).map(
      (file) => file._id,
    );

    for (const ids of chunkArray(orderedIds, 100)) {
      checkCancelled();

      // Missing metadata is the durable pending-work predicate; committed repairs leave this set.
      const filesById = new Map(
        (
          await models.FileModel.find({ ...filter, _id: { $in: ids } })
            .select({ hash: 1, path: 1 })
            .lean()
        ).map((file) => [String(file._id), file]),
      );

      for (const id of ids) {
        checkCancelled();

        const file = filesById.get(String(id));

        if (!file) {
          unlock([String(id)]);
          continue;
        }

        let updates: Partial<models.FileSchema>;

        try {
          updates = await getVideoInfo(file.path, signal);
        } catch (error) {
          signal.throwIfAborted();
          checkCancelled();
          updates = { isCorrupted: true };

          report(`Failed to read codec information for ${file.path}: ${error.message}.`, "error");
        }

        checkCancelled();
        await updateFileIfUnchanged(file, updates);

        if (updates.isCorrupted) corruptedCount++;

        processedCount++;
        unlock([String(file._id)]);
        progress(
          `Codec inspection: ${Fmt.commas(processedCount)} / ${Fmt.commas(candidates.length)} videos; ${Fmt.commas(corruptedCount)} marked corrupted.`,
        );
      }
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

      const movedSubtitlePaths: string[] = [];
      const newFilesMap = new Map<
        string,
        Partial<Pick<models.FileSchema, "subtitles">> & Pick<models.FileSchema, "path" | "thumb">
      >();

      for (const f of oldFiles) {
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

        // Subtitle copies are named after their media, so they move with it when found beside it.
        const subtitles: models.FileSchema["subtitles"] = [];

        for (const subtitle of f.subtitles ?? []) {
          const movedPath = path.join(path.dirname(newPath), path.basename(subtitle.path));
          const movedFilePaths = getSubtitleFilePaths([{ path: movedPath }]);

          // A subtitle another file records, or this relink already moved, stays with that file.
          const isMoved =
            movedPath !== subtitle.path &&
            !movedSubtitlePaths.some(
              (filePath) => mediaPathKey(filePath) === mediaPathKey(movedPath),
            ) &&
            !(await checkFileExists(subtitle.path)) &&
            (await Promise.all(movedFilePaths.map((filePath) => checkFileExists(filePath)))).every(
              Boolean,
            ) &&
            !(await models.FileModel.exists({
              _id: { $ne: objectId(f.id) },
              "subtitles.pathKey": { $eq: mediaPathKey(movedPath), $type: "string" },
            }));

          if (isMoved) movedSubtitlePaths.push(...movedFilePaths);

          subtitles.push(
            isMoved ? { ...subtitle, path: movedPath, pathKey: mediaPathKey(movedPath) } : subtitle,
          );
        }

        newFilesMap.set(f.id, {
          path: newPath,
          ...(subtitles.length ? { subtitles } : {}),
          thumb: newThumb,
        });
      }

      await assertMediaPathsAvailable([
        ...[...newFilesMap.values()].flatMap(({ path, thumb }) => [path, thumb?.path]),
        ...movedSubtitlePaths,
      ]);

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

      for (const [id, updates] of newFilesMap)
        socket.emitVolatile("onFileUpdated", { id, updates });
    },
    {
      getFileIds: ({ filesToRelink }) => filesToRelink.map(({ id }) => id),
      persistInBackground: true,
    },
  ),
);

export const repairFilesWithBrokenExt = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, lock, report, run, unlock } = makeRepairReporter(repairId, "repairFiles");

  return run(async () => {
    let filesWithDotPrefixCount = 0;
    let filesWithIncorrectExtCount = 0;

    report("Detecting file formats from their contents in bounded batches.");

    lock((await models.FileModel.find().select({ _id: 1 }).lean()).map((file) => String(file._id)));

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
      async ({ candidate, result }) => {
        checkCancelled();
        unlock([String(candidate._id)]);

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

/** Records the checksums replaced transforms superseded, so imports recognize those versions. */
export const repairPreviousHashes = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, lock, progress, report, run, unlock } = makeRepairReporter(
    repairId,
    "repairPreviousHashes",
  );

  return run(async () => {
    const filter: mongoose.QueryFilter<models.FileTransformSchema> = {
      beforeHash: { $type: "string" },
      status: "REPLACED",
    };
    const writes: AnyBulkWriteOperation<models.FileSchema>[] = [];
    const writtenIds: string[] = [];
    let checkedCount = 0;
    let updatedCount = 0;

    const flush = async () => {
      if (writes.length) {
        const result = await models.FileModel.bulkWrite(writes.splice(0), {
          session: getBackgroundSession(),
        });

        unlock(writtenIds.splice(0));
        updatedCount += result.modifiedCount;
        progress(
          `Previous checksums: checked ${Fmt.commas(checkedCount)} replaced transforms; updated ${Fmt.commas(updatedCount)} files.`,
        );
      }
    };

    report(
      "Recording the checksums of transformed files' earlier versions from transform history.",
    );

    lock((await models.FileTransformModel.distinct("fileId", filter)).map(String));

    for await (const transform of models.FileTransformModel.find(filter)
      .select({ beforeHash: 1, fileId: 1 })
      .lean()
      .cursor({ batchSize: 1000 })) {
      checkCancelled();

      writtenIds.push(String(transform.fileId));
      writes.push({
        updateOne: {
          filter: { _id: objectId(transform.fileId), hash: { $ne: transform.beforeHash } },
          update: { $addToSet: { previousHashes: transform.beforeHash } },
        },
      });

      checkedCount++;

      if (writes.length >= 1000) await flush();
    }

    await flush();

    report(
      `Previous checksum repair completed successfully: checked ${Fmt.commas(checkedCount)} replaced transforms and updated ${Fmt.commas(updatedCount)} files.`,
      "success",
    );

    return { checkedCount, updatedCount };
  });
});

export const repairFilesWithMissingInfo = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, lock, report, run, unlock } = makeRepairReporter(repairId, "repairFiles");

  return run(async () => {
    const filter: mongoose.QueryFilter<models.FileSchema> = {
      ext: { $in: CONSTANTS.VIDEO.EXTS },
      isArchived: { $ne: true },
      $or: ["bitrate", "size", "videoCodec"].map((name) => ({
        [name]: { $exists: true, $ne: null },
        $or: [
          { [`original${Fmt.capitalize(name)}`]: null },
          { [`original${Fmt.capitalize(name)}`]: "" },
        ],
      })),
    };

    report("Checking original video information in bounded metadata batches.");

    lock(
      (await models.FileModel.find(filter).select({ _id: 1 }).lean()).map((file) =>
        String(file._id),
      ),
    );

    await repairMetadata(
      models.FileModel.find(filter).select({ _id: 1 }).sort({ _id: 1 }).lean().cursor(),
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
        socket.emitVolatile("onFileUpdated", { id: String(file._id), updates });
        checkCancelled();
      },
      async ({ candidate }) => unlock([String(candidate._id)]),
    );

    report("Missing original video information repair completed successfully.", "success");

    return { repairedFields: ["originalBitrate", "originalSize", "originalVideoCodec"] };
  });
});

export const repairMissingAudioAnalysis = makeAction(
  async ({
    maxAudioVectorDuration,
    maxTranscriptionDuration,
    repairAudioVectors,
    repairId,
    repairTranscriptions,
    repairWaveforms,
  }: {
    maxAudioVectorDuration: number;
    maxTranscriptionDuration: number;
    repairAudioVectors: boolean;
    repairId: string;
    repairTranscriptions: boolean;
    repairWaveforms: boolean;
  }) => {
    const { checkCancelled, lock, progress, report, run, signal, unlock } = makeRepairReporter(
      repairId,
      "repairAudioAnalysis",
    );

    return run(async () => {
      if (
        repairTranscriptions &&
        (!Number.isFinite(maxTranscriptionDuration) || maxTranscriptionDuration <= 0)
      )
        throw new Error("Maximum transcription duration must be greater than zero.");

      if (
        repairAudioVectors &&
        (!Number.isFinite(maxAudioVectorDuration) || maxAudioVectorDuration <= 0)
      )
        throw new Error("Maximum audio similarity duration must be greater than zero.");

      // Every stale video needs the exported model, so a missing one stops the repair up front.
      if (repairAudioVectors) await assertAudioSimilarityModel();

      const missingFilters: mongoose.QueryFilter<models.FileSchema>[] = [];

      if (repairTranscriptions)
        missingFilters.push({
          $or: [{ "transcription.text": null }, { "transcription.text": /^\s*$/ }],
          duration: { $lte: maxTranscriptionDuration },
        });

      if (repairWaveforms) missingFilters.push({ "waveformPeaks.0": { $exists: false } });

      if (!missingFilters.length && !repairAudioVectors)
        return { repairedAudioVectors: 0, repairedTranscriptions: 0, repairedWaveforms: 0 };

      report(
        [
          "Searching for videos with audio and missing analysis data.",
          repairTranscriptions
            ? `Transcriptions are limited to ${Fmt.duration(maxTranscriptionDuration)}.`
            : null,
          repairAudioVectors
            ? `Audio similarity is limited to ${Fmt.duration(maxAudioVectorDuration)}.`
            : null,
          repairWaveforms ? "Missing waveforms are regenerated for videos of any length." : null,
        ]
          .filter(Boolean)
          .join(" "),
      );

      const findCandidates = (filter: mongoose.QueryFilter<models.FileSchema>) =>
        models.FileModel.find({
          ...filter,
          audioCodec: { $exists: true, $nin: ["", "None", null] },
          ext: { $in: CONSTANTS.VIDEO.EXTS },
          // Archived files are never analyzed, so they also stay free to delete during the repair.
          isArchived: { $ne: true },
          isAudioCorrupted: { $ne: true },
          isCorrupted: { $ne: true },
        })
          .allowDiskUse(true)
          .select({
            _id: 1,
            duration: 1,
            hash: 1,
            "thumb.ntfsFileId": 1,
            "thumb.ntfsVolumeId": 1,
          })
          .sort({ _id: 1 })
          .lean();

      const candidates = missingFilters.length ? await findCandidates({ $or: missingFilters }) : [];
      const staleAudioVectorIds = new Set<string>();

      // Audio vectors are stored with the other vectors, which say which files are already current.
      if (repairAudioVectors) {
        const vectorCandidates = await findCandidates({
          duration: { $lte: maxAudioVectorDuration },
        });

        const candidateIds = new Set(candidates.map((file) => String(file._id)));

        checkCancelled();

        // One request, since the vector server scans its whole state table for each. Outdated
        // vectors are deleted with it, so the repair's writes only append. Vectors with more
        // windows than the stored duration allows are redone, as those decoded past the audio's
        // timestamps before the decode followed them have.
        const { currentFileIds, overLimitCount } = await vectorRpc.pruneAudioVectors({
          files: vectorCandidates.map((file) => ({
            fileId: String(file._id),
            hash: file.hash,
            maxWindowCount: getMaxAudioWindowCount(file.duration + AUDIO_DURATION_MARGIN),
          })),
        });

        const currentIds = new Set(currentFileIds);

        if (overLimitCount)
          report(
            `Cleared the audio vectors of ${Fmt.commas(overLimitCount)} videos stored with more windows than their duration allows, to vectorize them again.`,
          );

        for (const file of vectorCandidates) {
          if (currentIds.has(String(file._id))) continue;

          staleAudioVectorIds.add(String(file._id));

          if (!candidateIds.has(String(file._id))) candidates.push(file);
        }
      }

      const fileCount = candidates.length;
      const unorderedCount = candidates.filter(
        (file) => !file.thumb?.ntfsFileId || !file.thumb?.ntfsVolumeId,
      ).length;

      report(`Found ${fileCount} videos requiring audio analysis.`, "progress");

      if (unorderedCount)
        report(
          `${Fmt.commas(unorderedCount)} videos have no stored disk position and are analyzed last, in import order. The Store NTFS Ordering Metadata repair records it.`,
        );

      lock(candidates.map((file) => String(file._id)));

      // Videos are read one at a time in disk order, since reading several at once or out of order
      // makes a hard drive seek. A video's thumbnail is written beside it right after it, so the
      // thumbnail's stored NTFS identity orders the videos without reading the disk.
      const orderedIds = sortByStoredNtfsIdentity(candidates, getThumbNtfsIdentity).map(
        (file) => file._id,
      );

      const modelOwnerId = `repair:${repairId}`;
      const pendingAudioVectors: {
        fileId: string;
        sourceHash: string;
        windows: AudioVectorWindow[];
      }[] = [];
      const startedAt = Date.now();
      /**
       * Totals shown per video beside the overall average. A video's drive read and extraction
       * overlap earlier videos' inference and writes, so the steps can add up to more.
       */
      const totals = {
        audioSeconds: 0,
        extractMs: 0,
        inferenceMs: 0,
        readBytes: 0,
        readFirstByteMs: 0,
        readMs: 0,
        readOpenMs: 0,
        writeMs: 0,
        writeWaitMs: 0,
      };
      let cachedCount = 0;
      let completedCount = 0;
      let corruptedCount = 0;
      let longestAudioSeconds = 0;
      let pendingAudioWindowCount = 0;
      let processedCount = 0;
      let repairedAudioVectors = 0;
      let repairedTranscriptions = 0;
      let repairedWaveforms = 0;
      let skippedCount = 0;
      /** The vector write in progress; writes run behind the analysis, one at a time. */
      let vectorWrite: Promise<void> = Promise.resolve();
      /** A failed write, thrown at the next video so the repair stops rather than analyzing on. */
      let vectorWriteError: Error = null;

      /** Never rejects, since it runs detached; a failure is kept for the repair to throw. */
      const writeAudioVectors = async (files: typeof pendingAudioVectors) => {
        const writeStart = Date.now();
        const windows = files.flatMap((file) => file.windows);
        const vectors = new Float64Array(
          windows.reduce((count, { vector }) => count + vector.length, 0),
        );
        let offset = 0;

        for (const { vector } of windows) {
          vectors.set(vector, offset);
          offset += vector.length;
        }

        try {
          await vectorRpc.storeAudioVectors({
            files: files.map((file) => ({
              fileId: file.fileId,
              sourceHash: file.sourceHash,
              windows: file.windows.map(({ end, start }) => ({ end, start })),
            })),
            vectors: Buffer.from(vectors.buffer).toString("base64"),
          });
        } catch (error) {
          vectorWriteError ??= error;
        }

        totals.writeMs += Date.now() - writeStart;
      };

      /**
       * Each video's steps update one progress line, sent once a second; separate lines for every
       * step of every video arrive faster than the log can show them.
       */
      const showProgress = (step: string) => {
        const formatAverage = (ms: number, count = completedCount) =>
          `${(ms / count / 1000).toFixed(2)}s`;

        const transferMs = totals.readMs - totals.readFirstByteMs;
        const ffmpegReadCount = completedCount - cachedCount;

        const driveReads = cachedCount
          ? `drive reads ${formatAverage(totals.readMs, cachedCount)} (opening ${formatAverage(totals.readOpenMs, cachedCount)}, seeking ${formatAverage(totals.readFirstByteMs - totals.readOpenMs, cachedCount)}, ${Math.round(totals.readBytes / 1000 / Math.max(1, transferMs))} MB/s), `
          : "";

        const ffmpegReads = ffmpegReadCount
          ? `; ${Fmt.commas(ffmpegReadCount)} large or high-bitrate videos read by ffmpeg itself`
          : "";

        const corrupted = corruptedCount
          ? `; ${Fmt.commas(corruptedCount)} videos with undecodable audio marked`
          : "";

        const skipped = skippedCount
          ? `; ${Fmt.commas(skippedCount)} unreadable videos skipped`
          : "";

        const average = completedCount
          ? `, averaging ${formatAverage(Date.now() - startedAt)} each: ${driveReads}extraction ${formatAverage(totals.extractMs)}, inference ${formatAverage(totals.inferenceMs)}, vector writes ${formatAverage(totals.writeMs)} (waited on ${formatAverage(totals.writeWaitMs)}); ${(totals.audioSeconds / completedCount).toFixed(1)}s of audio per video, the longest ${longestAudioSeconds.toFixed(1)}s${ffmpegReads}${corrupted}${skipped}`
          : "";

        progress(
          `Audio analysis: video ${Fmt.commas(processedCount)} / ${Fmt.commas(fileCount)}; ${Fmt.commas(completedCount)} completed${average}. ${step}`,
        );
      };

      /** Starts writing the pending vectors once the previous write is done, so analysis carries on. */
      const flushAudioVectors = async () => {
        const files = pendingAudioVectors.splice(0);
        pendingAudioWindowCount = 0;

        const waitStart = Date.now();

        showProgress("Waiting for the previous vector write.");
        await vectorWrite;
        totals.writeWaitMs += Date.now() - waitStart;

        if (vectorWriteError) throw vectorWriteError;

        vectorWrite = writeAudioVectors(files);
      };

      const reportAnalysisProgress = (message: string, percent?: number) => {
        if (message.startsWith("Downloading transcription model:"))
          showProgress(`${message.replace(/\.$/, "")} (${Math.floor(percent)}%).`);
        else if (
          message === "Loading transcription model." ||
          message === "Preparing transcription model." ||
          message.startsWith("GPU transcription unavailable.") ||
          message.startsWith("Transcription model loaded on")
        )
          report(message, "progress");
        else showProgress(message);
      };

      const loadFiles = (ids: mongoose.Types.ObjectId[]) =>
        models.FileModel.find({ _id: { $in: ids } })
          .select({
            _id: 1,
            dateModified: 1,
            duration: 1,
            hash: 1,
            path: 1,
            // Loaded only for the repairs that check them; a waveform holds a thousand values.
            ...(repairTranscriptions ? { transcription: 1 } : {}),
            ...(repairWaveforms ? { waveformPeaks: 1 } : {}),
          })
          .lean();

      // Decodes running ahead stop whenever the repair ends early, whether cancelled or failed.
      const decodeController = new AbortController();
      const abortDecodes = () => decodeController.abort(signal.reason);
      const decodeInDiskOrder = makeOrderedAudioDecoder(decodeController.signal);
      /** Videos whose audio decodes while an earlier one is analyzed, in disk order. */
      const decodingFiles: {
        audio: Promise<DecodedAudio>;
        file: Awaited<ReturnType<typeof loadFiles>>[number];
        maxDuration?: number;
        options: AudioAnalysisOptions;
      }[] = [];

      const analyzeNextFile = async () => {
        const { audio, file, maxDuration, options } = decodingFiles.shift();

        if (vectorWriteError) throw vectorWriteError;

        processedCount++;
        showProgress("Extracting audio.");

        let decoded: DecodedAudio;

        try {
          decoded = await audio;
        } catch (error) {
          // ffmpeg failing to start, or the repair ending, stops everything.
          if (decodeController.signal.aborted || error.syscall?.startsWith("spawn")) throw error;

          // Audio too corrupted to decode is marked so later analysis repairs leave it out.
          // A video that couldn't be read for another reason stays stale for a later repair.
          if (error.name === AUDIO_DECODE_ERROR) {
            await updateFileIfUnchanged(file, { isAudioCorrupted: true });

            corruptedCount++;
            report(`Marked ${file.path} as having undecodable audio: ${error.message}`, "error");
          } else {
            skippedCount++;
            report(`Skipped ${file.path}: ${error.message}`, "error");
          }

          unlock([String(file._id)]);
          return;
        }

        let analysis: AudioAnalysis;

        try {
          analysis = await analyzeDecodedAudio(decoded, reportAnalysisProgress, signal, options);
        } finally {
          await decoded.close();
        }

        checkCancelled();

        totals.audioSeconds += decoded.duration;
        totals.extractMs += decoded.extractMs;
        totals.inferenceMs += analysis.inferenceMs;
        totals.readBytes += decoded.readBytes;
        totals.readFirstByteMs += decoded.readFirstByteMs;
        totals.readMs += decoded.readMs;
        totals.readOpenMs += decoded.readOpenMs;
        longestAudioSeconds = Math.max(longestAudioSeconds, decoded.duration);

        if (decoded.readBytes) cachedCount++;

        if (maxDuration && decoded.duration > maxDuration - AUDIO_DURATION_MARGIN / 2)
          report(
            `Only the first ${Fmt.duration(maxDuration)} of ${file.path} was vectorized, since its audio's timestamps run past its stored ${Fmt.duration(file.duration)} duration.`,
          );

        if (options.withAudioVectors) {
          if (analysis.invalidAudioWindowCount)
            report(
              `Left out ${Fmt.commas(analysis.invalidAudioWindowCount)} audio windows of ${file.path} whose samples or embeddings held NaN or infinity.`,
            );

          pendingAudioVectors.push({
            fileId: String(file._id),
            sourceHash: file.hash,
            windows: analysis.audioWindows,
          });

          pendingAudioWindowCount += analysis.audioWindows.length;
          repairedAudioVectors++;

          if (
            pendingAudioVectors.length >= AUDIO_VECTOR_FLUSH_FILE_COUNT ||
            pendingAudioWindowCount >= AUDIO_VECTOR_FLUSH_WINDOW_COUNT
          )
            await flushAudioVectors();
        }

        if (options.withTranscription || options.withWaveform) {
          const updates: Partial<models.FileSchema> = {};

          if (options.withTranscription) {
            updates.hasTranscript = hasTranscription(analysis.transcription);
            updates.transcription = analysis.transcription;
            repairedTranscriptions++;
          }

          if (options.withWaveform) {
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

          socket.emitVolatile("onFileUpdated", { id: file._id.toString(), updates });
        }

        unlock([file._id.toString()]);

        completedCount++;
      };

      if (repairTranscriptions) retainTranscriptionModel(modelOwnerId, signal);

      signal.addEventListener("abort", abortDecodes, { once: true });

      try {
        for (const ids of chunkArray(orderedIds, 100)) {
          const filesById = new Map((await loadFiles(ids)).map((file) => [String(file._id), file]));

          // Records load in any order, so each batch follows the disk order of its IDs.
          for (const id of ids) {
            const file = filesById.get(String(id));
            if (!file) continue;

            checkCancelled();

            // The repair stores no peak volume, so it isn't measured.
            const options: AudioAnalysisOptions = {
              withAudioVectors: staleAudioVectorIds.has(String(file._id)),
              withPeakVolume: false,
              withTranscription:
                repairTranscriptions &&
                file.duration <= maxTranscriptionDuration &&
                !hasTranscription(file.transcription),
              withWaveform: repairWaveforms && !file.waveformPeaks?.length,
            };

            if (!options.withAudioVectors && !options.withTranscription && !options.withWaveform) {
              processedCount++;
              unlock([String(file._id)]);
            } else {
              // Videos needing only vectors decode at most a second past the limit, even with a wrong
              // stored duration; waveforms and transcriptions need all of the audio.
              const maxDuration =
                options.withTranscription || options.withWaveform
                  ? undefined
                  : maxAudioVectorDuration + AUDIO_DURATION_MARGIN;

              const audio = decodeInDiskOrder(file.path, { duration: file.duration, maxDuration });

              // A failed decode is thrown when its video is analyzed; until then it stays handled.
              audio.catch(() => null);
              decodingFiles.push({ audio, file, maxDuration, options });

              if (decodingFiles.length > AUDIO_DECODE_LOOKAHEAD) await analyzeNextFile();
            }
          }
        }

        while (decodingFiles.length) await analyzeNextFile();

        if (pendingAudioVectors.length) await flushAudioVectors();

        await vectorWrite;

        if (vectorWriteError) throw vectorWriteError;
      } finally {
        signal.removeEventListener("abort", abortDecodes);
        decodeController.abort();

        // A write still running finishes before the repair ends, so no other one overlaps it, and
        // videos analyzed before a cancel or failure still keep their vectors.
        await vectorWrite;

        if (pendingAudioVectors.length && !vectorWriteError)
          await writeAudioVectors(pendingAudioVectors.splice(0));

        if (repairTranscriptions) await releaseTranscriptionModel(modelOwnerId);

        // An ended repair still deletes the audio decoded ahead of it, without letting a cleanup
        // failure hide the repair's own error.
        for (const { audio } of decodingFiles.splice(0)) {
          const decoded = await audio.catch(() => null);
          await decoded?.close().catch(() => null);
        }
      }

      report(
        `Audio analysis repair completed successfully: regenerated ${repairedWaveforms} waveforms, ${repairedTranscriptions} transcriptions, and audio similarity vectors for ${repairedAudioVectors} videos.${corruptedCount ? ` Marked ${Fmt.commas(corruptedCount)} videos with undecodable audio, listed above.` : ""}${skippedCount ? ` Skipped ${Fmt.commas(skippedCount)} unreadable videos, listed above.` : ""}`,
        "success",
      );

      return { repairedAudioVectors, repairedTranscriptions, repairedWaveforms };
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
    socket.emitVolatile("onFilesUpdated", { fileIds: [args.id], updates });
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
    { getFileIds: ({ fileIds }) => fileIds },
  ),
  ({ fileIds, isArchived }) => {
    if (isArchived) socket.emitVolatile("onFilesArchived", { fileIds });

    socket.emitVolatile("onFilesUpdated", { fileIds, updates: { isArchived } });
  },
);

export const setFileRating = makeAction(
  registerMetadataWork(
    "setFileRating",
    async (args: { fileIds: string[]; rating: number }) => {
      const tagIds = [
        ...new Set(
          (
            await models.FileModel.find({ _id: { $in: args.fileIds } })
              .select({ tagIdsWithAncestors: 1 })
              .lean()
          ).flatMap((file) => file.tagIdsWithAncestors.map(String)),
        ),
      ];

      const updates = { dateModified: dayjs().toISOString(), rating: args.rating };

      await models.FileModel.updateMany({ _id: { $in: args.fileIds } }, updates);
      socket.emitVolatile("onFilesUpdated", { fileIds: args.fileIds, updates });

      const collections = await actions.regenCollAttrs({ fileIds: args.fileIds });

      if (!collections.success) throw new Error(collections.error);

      if (tagIds.length) await actions.queueTagMetadataRegen(tagIds);
    },
    { getFileIds: ({ fileIds }) => fileIds },
  ),
);

/* ----------------------------------------------------------------------- */
const fileThumbnailRepairPromises = new Map<
  string,
  Promise<{ status: "repaired" | "skipped"; thumb?: models.FileSchema["thumb"] }>
>();

/** Each running refresh's files, which later refreshes add to. */
const fileRefreshQueues = new Map<string, string[]>();

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
  { persistInBackground: true },
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

    // A file another operation is changing is repaired once it is released.
    if (getForeignFileLock(args.fileId)) return { status: "waiting" };

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
    const { checkCancelled, lock, report, run, unlock } = makeRepairReporter(
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
        isArchived: { $ne: true },
        "thumb.path": { $exists: true, $nin: [null, ""] },
      };

      const totalCount = await models.FileModel.countDocuments(filter);
      let cursor: mongoose.Types.ObjectId;
      let failedCount = 0;
      let inspectedCount = 0;
      let storedCount = 0;

      report(`Found ${totalCount} thumbnails missing NTFS ordering metadata.`, "progress");

      lock(
        (await models.FileModel.find(filter).select({ _id: 1 }).lean()).map((file) =>
          String(file._id),
        ),
      );

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
                `Could not inspect thumbnail identity for file ${file._id} (${file.thumb.path}): ${error.message}`,
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
        unlock(files.map((file) => String(file._id)));

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

/** Small batches keep progress moving and Stop responsive while each one reads its files. */
const DELETION_BATCH_SIZE = 50;

/**
 * Archives the given files still in the library and deletes those already archived, in batches on
 * the server.
 */
export const startFileDeletion = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  const uniqueIds = [...new Set(fileIds)];

  return startJob({
    fileIds: uniqueIds,
    label: "File Deletion",
    run: async (job) => {
      const activeIds: string[] = [];
      const archivedFiles: { _id: mongoose.Types.ObjectId; thumb?: models.FileSchema["thumb"] }[] =
        [];
      let archivedCount = 0;
      let deletedCount = 0;

      for (const chunk of chunkArray(uniqueIds, 1000)) {
        job.signal.throwIfAborted();

        const files = await models.FileModel.find({ _id: { $in: objectIds(chunk) } })
          .select({ isArchived: 1, "thumb.ntfsFileId": 1, "thumb.ntfsVolumeId": 1 })
          .lean();

        for (const file of files) {
          if (file.isArchived) archivedFiles.push(file);
          else activeIds.push(String(file._id));
        }
      }

      // Deleting reads each file to verify it, so files go in disk order to keep a hard drive from
      // seeking. A file's thumbnail is written beside it right after it, so its stored NTFS
      // identity gives that order without reading the disk.
      const archivedIds = sortByStoredNtfsIdentity(archivedFiles, getThumbNtfsIdentity).map(
        (file) => String(file._id),
      );

      // Files already gone from the library need nothing more.
      const foundIds = new Set([...activeIds, ...archivedIds]);

      job.complete(uniqueIds.filter((fileId) => !foundIds.has(fileId)));

      /**
       * Progress already counts every file, so the message names the step with its speed and the
       * time left at that speed, then how long the last batch spent on each part.
       */
      const reportStep = (
        step: string,
        startedAt: number,
        doneCount: number,
        totalCount: number,
        lastBatch = "",
      ) => {
        const rate = doneCount / Math.max(1, (Date.now() - startedAt) / 1000);

        job.report({
          message: [
            step,
            doneCount && `${rate.toFixed(1)} files/s`,
            doneCount && `about ${Fmt.duration((totalCount - doneCount) / rate)} left`,
            lastBatch,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      };

      /**
       * Removes a batch's files only, so older cleanups aren't revisited every batch. Stopping
       * pauses the removal, and anything left or failed is finished by the queue afterwards.
       */
      const removeFiles = async (cleanupIds: string[]) => {
        for (const cleanupId of cleanupIds) {
          try {
            await workSignal.run(job.signal, () => finishFileOperation(cleanupId));
          } catch (error) {
            job.addFailure(`Media kept for a later cleanup: ${error.message}`);
          }
        }
      };

      const tagIds = new Set<string>();
      let removing = Promise.resolve();

      try {
        const archiveStartedAt = Date.now();

        if (activeIds.length) reportStep("Archiving files", archiveStartedAt, 0, activeIds.length);

        for (const chunk of chunkArray(activeIds, DELETION_BATCH_SIZE)) {
          job.signal.throwIfAborted();

          const res = await setFileIsArchived({ fileIds: chunk, isArchived: true });
          if (!res.success) throw new Error(`Error archiving files: ${res.error}`);

          archivedCount += chunk.length;
          job.complete(chunk);
          reportStep("Archiving files", archiveStartedAt, archivedCount, activeIds.length);
        }

        const deleteStartedAt = Date.now();

        if (archivedIds.length)
          reportStep("Deleting archived files", deleteStartedAt, 0, archivedIds.length);

        for (const chunk of chunkArray(archivedIds, DELETION_BATCH_SIZE)) {
          job.signal.throwIfAborted();

          // A batch's records are deleted while the previous batch's files are removed, which is
          // mostly database work; only one batch removes files at a time.
          const recordsStartedAt = Date.now();
          const res = await deleteFiles({
            fileIds: chunk,
            withCleanupQueue: false,
            withTagRegen: false,
          });
          if (!res.success) throw new Error(res.error);

          const recordsTime = Date.now() - recordsStartedAt;

          for (const tagId of res.data.tagIds) tagIds.add(tagId);

          deletedCount += chunk.length;
          job.complete(chunk);

          await removing;

          removing = (async () => {
            const removalStartedAt = Date.now();

            await removeFiles(res.data.cleanupIds);

            reportStep(
              "Deleting archived files",
              deleteStartedAt,
              deletedCount,
              archivedIds.length,
              `last ${chunk.length}: records ${(recordsTime / 1000).toFixed(1)}s, files ${((Date.now() - removalStartedAt) / 1000).toFixed(1)}s`,
            );
          })();
        }
      } finally {
        await removing;

        job.report({ message: `${Fmt.commas(deletedCount)} files deleted` });

        // Tag counts are rescanned once for the whole deletion rather than after every batch, and
        // the queue picks up any cleanup left by a stop or failure.
        if (tagIds.size) await actions.queueTagMetadataRegen([...tagIds]);

        runFileCleanupQueue();
      }
    },
    type: "deleteFiles",
  });
});

/**
 * Regenerates files' media info and thumbnails on the server, one file at a time. Files sent while
 * a refresh runs join it.
 */
export const startFileRefresh = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  const uniqueIds = [...new Set(fileIds)];
  let runningId = findJob("refreshFiles");

  // A stopping refresh still holds its files, so a new one starts once it has ended.
  if (runningId && isJobStopping(runningId)) {
    await waitForJob(runningId);
    runningId = findJob("refreshFiles");
  }

  const runningQueue = fileRefreshQueues.get(runningId);

  if (runningQueue) {
    // Only files still waiting are skipped; ones refreshed already, or refreshing now, run again.
    const queuedIds = new Set(runningQueue);
    const addedIds = uniqueIds.filter((fileId) => !queuedIds.has(fileId));

    addToJob(runningId, addedIds);
    runningQueue.push(...addedIds);

    return runningId;
  } else
    return startJob({
      fileIds: uniqueIds,
      label: "File Refresh",
      run: async (job) => {
        const modelOwnerId = `file-refresh:${job.id}`;
        const queue = [...uniqueIds];

        fileRefreshQueues.set(job.id, queue);

        if (getConfig().file.transcription.enabled)
          retainTranscriptionModel(modelOwnerId, job.signal);

        try {
          // The queue holds only waiting files, which later refreshes add to.
          while (queue.length) {
            const fileId = queue.shift();

            job.signal.throwIfAborted();

            try {
              const fileModel = await models.FileModel.findById(fileId).lean();

              if (!fileModel) throw new Error("The file was not found.");

              const file = leanModelToJson<models.FileSchema>(fileModel);

              job.report({
                item: file.originalName,
                message: "Starting refresh.",
                stepProgress: null,
              });

              await runBackgroundExecution(
                () =>
                  repairThumbnail(file, false, [], {
                    onProgress: (message, progress) =>
                      job.report({ message, stepProgress: progress ?? null }),
                    signal: job.signal,
                    // Refreshes follow the settings; thumbnail repairs otherwise skip both.
                    withTranscription: getConfig().file.transcription.enabled,
                    withWaveform: getConfig().file.waveform.enabled,
                  }),
                job.signal,
                false,
              );
            } catch (error) {
              job.signal.throwIfAborted();
              job.addFailure(error.message);
            }

            // A file queued again during its refresh stays locked for the next one.
            job.complete(queue.includes(fileId) ? [] : [fileId], 1);
          }
        } finally {
          fileRefreshQueues.delete(job.id);
          await releaseTranscriptionModel(modelOwnerId);
        }
      },
      type: "refreshFiles",
    });
});

export const startFileUnarchive = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  const uniqueIds = [...new Set(fileIds)];

  return startJob({
    fileIds: uniqueIds,
    label: "File Unarchiving",
    run: async (job) => {
      for (const chunk of chunkArray(uniqueIds, 200)) {
        job.signal.throwIfAborted();

        const res = await setFileIsArchived({ fileIds: chunk, isArchived: false });
        if (!res.success) throw new Error(res.error);

        job.complete(chunk);
      }
    },
    type: "unarchiveFiles",
  });
});

/* ----------------------------------------------------------------------- */
class ThumbRepairer {
  private checkCancelled: ReturnType<typeof makeRepairReporter>["checkCancelled"];
  private chunkSize = 1000;
  private errorCount = 0;
  private fileChunkIteration = 0;
  private hasFilesWithOldThumbPaths = false;
  private hasInvalidThumbnails = false;
  private hasMorePages = true;
  private lock: ReturnType<typeof makeRepairReporter>["lock"];
  private logTag = "[repairThumbs]";
  private perfLog: (str: string) => void;
  private perfLogTotal: (str: string) => void;
  private report: ReturnType<typeof makeRepairReporter>["report"];
  private tagCount = 0;
  private thumbMap = new Map<string, models.FileSchema["thumb"]>();
  private totalCount = 0;
  private unlock: ReturnType<typeof makeRepairReporter>["unlock"];

  constructor(reporter: ReturnType<typeof makeRepairReporter>) {
    const { perfLog, perfLogTotal } = makePerfLog(this.logTag, true);

    this.perfLog = perfLog;
    this.perfLogTotal = perfLogTotal;

    this.checkCancelled = reporter.checkCancelled;
    this.lock = reporter.lock;
    this.report = reporter.report;
    this.unlock = reporter.unlock;
  }

  private progressLog = (message: string) => {
    this.perfLog(message);
    this.report(message, "progress");
  };

  private errorLog = (message: string) => {
    this.errorCount++;
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
        if (error.code !== "ENOENT") throw error;

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
          this.errorLog(
            `Failed to repair thumbnail for file ${file.id} (${file.path}): ${error.message}`,
          );
        }

        if (invalidThumbnailCount % 25 === 0)
          this.progressLog(
            `Processed ${invalidThumbnailCount} files with missing thumbnails so far; regenerated ${regeneratedThumbnailCount}, restored ${restoredThumbnailRecordCount}, and failed ${this.errorCount}.`,
          );
      }

      scannedCount += files.length;
      this.unlock(files.map((file) => file.id));
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
      await models.FileModel.find({ thumbPaths: { $exists: true } })
        .setOptions({ strictQuery: false })
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
    const [res] = await models.FileModel.aggregate<{ total: number }>([
      { $match: { thumbPaths: { $exists: true } } },
      { $count: "total" },
    ]).allowDiskUse(true);

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

      const tags = await models.TagModel.find(filter, null, { strictQuery: false })
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

    const lockFilters: mongoose.QueryFilter<models.FileSchema>[] = [
      ...(repairPaths
        ? [{ "thumb.path": { $regex: "\\\\.jpg$" } }, { thumbPaths: { $exists: true } }]
        : []),
      ...(repairMissingThumbnails ? [{ isCorrupted: { $ne: true } }] : []),
    ];

    if (lockFilters.length)
      this.lock(
        (
          await models.FileModel.find({ $or: lockFilters }, null, { strictQuery: false })
            .allowDiskUse(true)
            .select({ _id: 1 })
            .lean()
        ).map((file) => String(file._id)),
      );

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
    const reporter = makeRepairReporter(repairId, "repairThumbs");
    const repairer = new ThumbRepairer(reporter);

    return reporter.run(
      async () => await repairer.processAllFiles({ repairMissingThumbnails, repairPaths }),
    );
  },
);
