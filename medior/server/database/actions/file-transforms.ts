import fs from "fs/promises";
import { createHash, randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { LeanDocument, Types as MongoTypes } from "mongoose";
import { deleteFile, fileLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import {
  canRunBackgroundQueues,
  makeBackgroundOperationRunner,
  runFileCleanupQueue,
} from "medior/server/database/actions/background-operations";
import {
  backgroundExecution,
  checkBackgroundExecution,
  runBackgroundExecution,
} from "medior/server/database/background-execution";
import {
  assertMediaPathIndexesReady,
  assertMediaPathsAvailable,
  describeFileCleanup,
  FileOperationModel,
  isMediaPathReferenced,
  mediaPathPattern,
  pauseFileCleanups,
} from "medior/server/database/file-operations";
import { recoverDirectImports } from "medior/server/database/media-import";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import {
  getBackgroundSession,
  getMetadataCreateId,
  metadataWriteOptions,
  registerMetadataWork,
} from "medior/server/database/metadata-work";
import {
  commitTransformMetadata,
  prepareTransformMetadata,
  retireTransformPreparations,
} from "medior/server/database/transform-metadata";
import * as Types from "medior/server/database/types";
import { isServerStopping } from "medior/server/process-lifecycle";
import { isGeneratedMediaUnreadable } from "medior/utils/client/files";
import {
  chunkArray,
  CONSTANTS,
  dayjs,
  getOrientedSizeLimits,
  validateTimestampPairs,
} from "medior/utils/common";
import {
  mergeDuplicateMetadata,
  replaceDuplicateCollectionReferences,
} from "medior/utils/common/duplicate-metadata";
import { leanModelToJson, makeAction, objectIds, socket } from "medior/utils/server";
import { getAvailableFileStorage, getConfig, getIsImage } from "medior/utils/server/config";
import { hashMediaFile, recoverMediaOutput, syncMediaFile } from "medior/utils/server/media-output";
import { getMediaInfo, MediaInfo, reencode, remux, spliceVideo } from "medior/utils/server/videos";

class FileTransformerStatus {
  private abortController: AbortController = null;
  private activeTransforms = new Map<string, string>();
  private isAuto = false;
  private isPaused = true;
  private isTransforming = false;
  private lastPreviewAt = 0;

  abortByFileIds(fileIds: string[]) {
    if ([...this.activeTransforms.values()].some((id) => fileIds.includes(id)))
      this.abortController?.abort();
  }

  abortByTransformIds(ids: string[]) {
    if (this.hasActiveTransforms(ids)) this.abortController?.abort();
  }

  getActiveTransformId() {
    return this.activeTransforms.keys().next().value ?? null;
  }

  getIsAuto() {
    return this.isAuto;
  }

  getIsPaused() {
    return this.isPaused;
  }

  getIsTransforming() {
    return this.isTransforming;
  }

  hasActiveTransforms(ids: string[]) {
    return ids.some((id) => this.activeTransforms.has(id));
  }

  publishPreview(file: models.FileSchema, transform: models.FileTransformSchema) {
    if (
      this.isAuto &&
      getIsImage(transform.beforeExt) &&
      transform.beforeExt !== "gif" &&
      Date.now() - this.lastPreviewAt < CONSTANTS.FILE.TRANSFORM.PREVIEW_INTERVAL_MS
    )
      return;

    this.lastPreviewAt = Date.now();
    socket.emitReliable("onFileTransformLoaded", { file, transform });
  }

  setActiveFileId(fileId: string, transformId: string) {
    if (fileId) this.activeTransforms.set(transformId, fileId);
    else this.activeTransforms.delete(transformId);
  }

  setIsAuto(isAuto: boolean) {
    this.isAuto = isAuto;
    socket.emitReliable("onFileTransformerStatusUpdated");
  }

  setIsPaused(isPaused: boolean) {
    if (this.isPaused === isPaused) return;

    this.isPaused = isPaused;

    if (isPaused) this.abortController?.abort();

    socket.emitReliable("onFileTransformerStatusUpdated");
  }

  setIsTransforming(isTransforming: boolean) {
    this.isTransforming = isTransforming;

    if (!isTransforming) {
      this.abortController = null;
      this.activeTransforms.clear();
    }

    socket.emitReliable("onFileTransformerStatusUpdated");
  }

  tryRun() {
    if (this.isTransforming) return null;

    this.abortController = new AbortController();
    this.isPaused = false;
    this.isTransforming = true;
    this.lastPreviewAt = 0;
    socket.emitReliable("onFileTransformerStatusUpdated");

    return this.abortController.signal;
  }
}

const fileTransformerStatus = new FileTransformerStatus();
let activeTransformExecution: Promise<void> = null;

const makeBeforeAttrs = (file: models.FileSchema) => ({
  beforeAudioBitrate: file.audioBitrate,
  beforeAudioCodec: file.audioCodec,
  beforeBitrate: file.bitrate,
  beforeDuration: file.duration,
  beforeFrameRate: file.frameRate,
  beforeHash: file.hash,
  beforeHeight: file.height,
  beforeExt: file.ext,
  beforePath: file.path,
  beforeSize: file.size,
  beforeVideoCodec: file.videoCodec,
  beforeWidth: file.width,
});

const makeAfterAttrs = (info: MediaInfo, path: string, hash: string) => ({
  afterAudioBitrate: info.audioBitrate,
  afterAudioCodec: info.audioCodec,
  afterBitrate: info.bitrate,
  afterDuration: info.duration,
  afterFrameRate: info.frameRate,
  afterHash: hash,
  afterHeight: info.height,
  afterExt: info.ext,
  afterPath: path,
  afterSize: info.size,
  afterVideoCodec: info.videoCodec,
  afterWidth: info.width,
});

const updateFileTransform = async (id: string, updates: Partial<models.FileTransformSchema>) => {
  const tagEvent = {
    COMPLETE: "onComplete",
    COMPRESSED: "onComplete",
    DUPLICATE: "onDuplicate",
    ERROR: "onError",
    SKIPPED: "onSkip",
  }[updates.status];

  const tags = tagEvent
    ? (getConfig().file.reencode[tagEvent] as { addTagIds: string[]; removeTagIds: string[] })
    : null;

  if (updates.afterPath || updates.outputTempPath)
    await assertMediaPathsAvailable([updates.afterPath, updates.outputTempPath], id);

  const isProgress = Object.keys(updates).every((key) =>
    ["progressPercent", "progressSize", "progressTime"].includes(key),
  );

  const result = await models.FileTransformModel.updateOne(
    { _id: id, ...(isProgress ? { status: "RUNNING" } : {}) },
    updates,
    isProgress ? {} : metadataWriteOptions(),
  );

  if (isProgress && !result.matchedCount) return;

  if (!result.matchedCount) throw new Error("Transform was deleted before its update could commit");

  if (tags) {
    if (tags.addTagIds.length || tags.removeTagIds.length) {
      const transform = await models.FileTransformModel.findById(id).lean();

      if (transform && transform.type !== "splice") {
        const file = await models.FileModel.findById(transform.fileId).select({ tagIds: 1 }).lean();

        if (file) {
          const tagIds = new Set(file.tagIds.map(String));

          const addedTagIds = tags.addTagIds.filter(
            (id) => !tagIds.has(id) && !tags.removeTagIds.includes(id),
          );

          const removedTagIds = tags.removeTagIds.filter((id) => tagIds.has(id));

          if (addedTagIds.length || removedTagIds.length) {
            await models.FileTransformModel.updateOne(
              { _id: id },
              {
                $addToSet: {
                  regenerationTagIds: { $each: [...addedTagIds, ...removedTagIds] },
                },
                $set: { regenerationPending: true },
              },
              metadataWriteOptions(),
            );

            const res = await actions.editFileTags({
              addedTagIds,
              fileIds: [transform.fileId.toString()],
              removedTagIds,
              withRegen: false,
            });

            if (!res.success) throw new Error(res.error);
          }
        }
      }
    }
  }

  if (isProgress) socket.emit("onFileTransformUpdated", { id, updates });
  else socket.emitReliable("onFileTransformUpdated", { id, updates });
};

const recordDuplicateTransform = async (
  id: string,
  info: MediaInfo,
  output: { hash: string; path: string },
  duplicate: { _id: { toString(): string }; path: string },
  persist = true,
) => {
  const updates = {
    ...makeAfterAttrs(info, output.path, output.hash),
    completedAt:
      (await models.FileTransformModel.findById(id).select({ completedAt: 1 }).lean())
        ?.completedAt ?? dayjs().toISOString(),
    duplicateFileId: duplicate._id.toString(),
    duplicatePath: duplicate.path,
    errorMsg: "Output matches an existing file. Original retained.",
    isCompleted: true,
    progressPercent: 100,
    status: "DUPLICATE" as const,
  };

  if (persist) await updateFileTransform(id, updates);

  return updates;
};

const resetStaleRunningTransforms = async () => {
  if (fileTransformerStatus.getIsTransforming()) return;

  const res = await models.FileTransformModel.updateMany(
    { isCompleted: false, status: "RUNNING" },
    {
      errorMsg: null,
      progressPercent: null,
      progressSize: null,
      progressTime: null,
      startedAt: null,
      status: "PENDING",
    },
  );

  if (res.modifiedCount) socket.emit("onReloadFileTransforms", { reason: "reset" });
};

const getQueueTransform = async (status: Types.FileTransformStatus) =>
  leanModelToJson<models.FileTransformSchema>(
    await models.FileTransformModel.findOne({ isCompleted: false, status })
      .sort({ dateCreated: 1, queueIndex: 1, _id: 1 })
      .lean(),
  );

export const getNextFileTransform = makeAction(
  async () => (await getQueueTransform("RUNNING")) ?? (await getQueueTransform("PENDING")),
);

export interface TransformQueueOptions {
  config: ReturnType<typeof getConfig>["file"]["reencode"];
  timestampPairs: Array<{ end: number; start: number }>;
  type: Types.FileTransformType;
}

const getQueueTransformId = (requestId: MongoTypes.ObjectId, fileId: string) =>
  new MongoTypes.ObjectId(
    createHash("sha256").update(`${requestId}:${fileId}`).digest("hex").slice(0, 24),
  );

const runTransformQueueCreation = makeBackgroundOperationRunner(
  "transform queue creation",
  async () => {
    while (canRunBackgroundQueues()) {
      const operation = await models.BackgroundOperationModel.findOne({
        status: { $in: ["PENDING", "RUNNING"] },
        type: "transformQueue",
      })
        .select({ _id: 1 })
        .sort({ dateCreated: 1, _id: 1 })
        .lean();

      if (!operation) return;

      try {
        const completed = await (async () => {
          const request = await models.BackgroundOperationModel.findOne({
            _id: operation._id,
            status: { $in: ["PENDING", "RUNNING"] },
          })
            .select({ targetIds: { $slice: 100 }, transformIds: 0 })
            .lean();

          if (!request) return;

          checkBackgroundExecution();

          const { config, timestampPairs, type } = request.transformOptions;

          const files = await models.FileModel.find({
            _id: { $in: objectIds(request.targetIds) },
            isArchived: false,
          })
            .select({
              audioBitrate: 1,
              audioCodec: 1,
              bitrate: 1,
              duration: 1,
              ext: 1,
              frameRate: 1,
              hash: 1,
              height: 1,
              path: 1,
              size: 1,
              videoCodec: 1,
              width: 1,
            })
            .lean();

          const fileMap = new Map(files.map((file) => [file._id.toString(), file]));
          const missing = request.targetIds.filter((id) => !fileMap.has(id));

          if (missing.length)
            throw new Error(
              `Files were removed or archived before queue insertion: ${missing.join(", ")}`,
            );

          const existing = await models.FileTransformModel.find({
            $or: [
              { fileId: { $in: objectIds(request.targetIds) }, isCompleted: false, type },
              { _id: { $in: request.targetIds.map((id) => getQueueTransformId(request._id, id)) } },
            ],
          })
            .select({ _id: 1, fileId: 1 })
            .lean();

          const ids = new Map(
            existing.map((transform) => [transform.fileId.toString(), transform._id.toString()]),
          );

          const transforms: Array<
            Partial<models.FileTransformSchema> & { _id: MongoTypes.ObjectId }
          > = [];

          for (const [index, id] of request.targetIds.entries()) {
            if (ids.has(id)) continue;

            const file = fileMap.get(id);

            const imageLimits = getOrientedSizeLimits(
              file.width,
              file.height,
              config.imageMaxLongEdge,
              config.imageMaxShortEdge,
            );

            const videoLimits = getOrientedSizeLimits(
              file.width,
              file.height,
              config.maxLongEdge,
              config.maxShortEdge,
            );

            transforms.push({
              ...makeBeforeAttrs(file),
              _id: getQueueTransformId(request._id, id),
              configCodec: config.codec,
              configImageExt: config.imageExt,
              configImageMaxHeight: imageLimits.height,
              configImageMaxWidth: imageLimits.width,
              configMaxBitrate: config.maxBitrate,
              configMaxFps: config.maxFps,
              configMaxHeight: videoLimits.height,
              configMaxWidth: videoLimits.width,
              configOverride: config.override,
              dateCreated: request.dateCreated,
              fileId: id,
              isCompleted: false,
              queueIndex: request.processedCount + index,
              status: "PENDING",
              timestampPairs,
              type,
            });
          }

          if (transforms.length) {
            const inserted = await models.FileTransformModel.insertMany(transforms, {
              session: getBackgroundSession(),
            });

            for (const transform of inserted)
              ids.set(transform.fileId.toString(), transform._id.toString());
          }

          const processedCount = request.processedCount + request.targetIds.length;

          await models.BackgroundOperationModel.updateOne(
            { _id: request._id },
            {
              $pullAll: { targetIds: request.targetIds },
              $push: { transformIds: { $each: request.targetIds.map((id) => ids.get(id)) } },
              $set: {
                completedAt: processedCount === request.totalCount ? dayjs().toISOString() : null,
                dateModified: dayjs().toISOString(),
                message: `Added ${processedCount} of ${request.totalCount} files to the transformer queue.`,
                processedCount,
                startedAt: request.startedAt ?? dayjs().toISOString(),
                status: processedCount === request.totalCount ? "COMPLETE" : "RUNNING",
              },
            },
          );

          return processedCount === request.totalCount;
        })();

        await actions.emitBackgroundOperation(operation._id.toString());

        if (completed) socket.emit("onReloadFileTransforms", { reason: "created" });
      } catch (error) {
        checkBackgroundExecution();
        await actions.setBackgroundOperationStatus(operation._id.toString(), "ERROR", {
          error: error.message,
          message: "Queue insertion stopped. Retry continues from the last committed file.",
        });
      }
    }
  },
  false,
);

export const createFileTransforms = makeAction(
  async (args: {
    fileIds: string[];
    sortValue?: actions.CreateFileFilterPipelineInput["sortValue"];
    timestampPairs?: Array<{ end: number; start: number }>;
    type: Types.FileTransformType;
  }) => {
    if (!args.fileIds.length) throw new Error("No files selected");

    if (args.type === "splice" && args.fileIds.length !== 1)
      throw new Error("Splice transforms must contain exactly one file");

    const sortDir = args.sortValue?.isDesc ? -1 : 1;

    const files = await models.FileModel.find({
      _id: { $in: objectIds(args.fileIds) },
      isArchived: false,
    })
      .select({ _id: 1, duration: 1 })
      .sort(args.sortValue ? { [args.sortValue.key]: sortDir, _id: sortDir } : {})
      .allowDiskUse(true)
      .lean();

    if (files.length !== new Set(args.fileIds).size)
      throw new Error(
        "Some selected files were removed or archived. Refresh the selection and try again.",
      );

    if (args.type === "splice")
      validateTimestampPairs(
        args.timestampPairs?.map(({ end, start }) => [start, end]),
        files[0].duration,
      );

    const targetIds = args.sortValue
      ? files.map((file) => file._id.toString())
      : [...new Set(args.fileIds)];

    const request = await models.BackgroundOperationModel.create({
      dateCreated: dayjs().toISOString(),
      dateModified: dayjs().toISOString(),
      label: "Add files to transformer",
      processedCount: 0,
      status: "PENDING",
      targetIds,
      totalCount: targetIds.length,
      transformIds: [],
      transformOptions: {
        config: getConfig().file.reencode,
        timestampPairs: args.timestampPairs ?? [],
        type: args.type,
      },
      type: "transformQueue",
    });

    await actions.emitBackgroundOperation(request._id.toString());
    await runTransformQueueCreation();

    const completed = await models.BackgroundOperationModel.findById(request._id)
      .select({ error: 1, status: 1, transformIds: 1 })
      .lean();

    if (completed.status !== "COMPLETE")
      throw new Error(
        completed.error ??
          "Queue insertion is saved in Activity and will continue when background work resumes.",
      );

    return { count: completed.transformIds.length, ids: completed.transformIds };
  },
);

export const deleteFileTransforms = makeAction(
  registerMetadataWork(
    "deleteFileTransforms",
    async (args: { ids: string[]; retainMedia?: boolean }) => {
      if (!args.ids.length) return { acknowledged: true, deletedCount: 0 };

      if (activeMediaFinalizations)
        throw new Error("Wait for media finalization or recovery before deleting transforms");

      if (fileTransformerStatus.hasActiveTransforms(args.ids)) {
        await stopFileTransformer();
      }

      if (args.retainMedia) await pauseFileCleanups();

      if (activeMediaFinalizations)
        throw new Error("Wait for media finalization or recovery before deleting transforms");

      if (
        !args.retainMedia &&
        (await models.FileTransformModel.exists({
          _id: { $in: args.ids },
          $or: [{ cleanupPending: true }, { regenerationPending: true }],
        }))
      )
        throw new Error("Finish pending transform recovery before deleting its record");

      if (args.retainMedia) {
        const removedIds = new Set(args.ids);

        await FileOperationModel.deleteMany({
          _id: { $in: args.ids.map((id) => `transform:${id}`) },
        });

        const result = await models.FileTransformModel.deleteMany({ _id: { $in: args.ids } });

        for (const operation of await models.BackgroundOperationModel.find({
          $or: [{ targetIds: { $in: args.ids } }, { "failures.targetId": { $in: args.ids } }],
          type: "duplicateMerge",
        }).lean()) {
          const targetIds = operation.targetIds.filter((id) => !removedIds.has(id));

          const remainingIds = new Set(targetIds);
          const failures = (operation.failures ?? []).filter(
            (failure) => !removedIds.has(failure.targetId),
          );

          await models.BackgroundOperationModel.updateOne({ _id: operation._id }, { failures });
          await actions.setBackgroundOperationStatus(
            operation._id.toString(),
            failures.length ? "ERROR" : targetIds.length ? operation.status : "CANCELLED",
            {
              error: failures.length ? `${failures.length} duplicates still need attention.` : null,
              message: "Failed transform records removed; media files retained.",
              targetIds,
              totalCount:
                operation.processedCount +
                targetIds.length +
                failures.filter((failure) => !remainingIds.has(failure.targetId)).length,
            },
          );
        }

        socket.emitReliable("onFileTransformDeleted", { ids: args.ids });

        return result;
      }

      const transforms = await models.FileTransformModel.find({ _id: { $in: args.ids } })
        .select({ afterPath: 1, outputTempPath: 1 })
        .lean();

      await retireTransformPreparations(args.ids);

      for (const batch of chunkArray(transforms, 500)) {
        const paths = new Set(
          batch
            .flatMap((transform) => [transform.afterPath, transform.outputTempPath])
            .filter(Boolean),
        );
        const cleanup = [];

        for (const path of paths) {
          const file = await describeFileCleanup(path);

          if (file) cleanup.push(file);
        }

        if (cleanup.length)
          await FileOperationModel.updateOne(
            {
              _id: String(
                getMetadataCreateId(
                  `deleteTransforms:${batch.map((transform) => String(transform._id)).join()}`,
                ),
              ),
            },
            { $setOnInsert: { cleanup, state: "COMMITTED" } },
            { ...metadataWriteOptions(), upsert: true },
          );
      }

      const result = await models.FileTransformModel.deleteMany({ _id: { $in: args.ids } });

      runFileCleanupQueue();

      socket.emitReliable("onFileTransformDeleted", { ids: args.ids });

      return result;
    },
    true,
  ),
);

export const deleteFileTransformsByFileIds = makeAction(async (args: { fileIds: string[] }) => {
  const transforms = await models.FileTransformModel.find({
    fileId: { $in: objectIds(args.fileIds) },
    isCompleted: false,
  })
    .select({ _id: 1 })
    .lean();

  const res = await deleteFileTransforms({ ids: transforms.map(({ _id }) => _id.toString()) });

  if (!res.success) throw new Error(res.error);

  return res.data;
});

export const getFileTransformerStatus = makeAction(async () => {
  const hasPendingTransforms = await models.FileTransformModel.exists({
    isCompleted: false,
    type: { $ne: "splice" },
  });

  return {
    isAuto: fileTransformerStatus.getIsAuto(),
    isPaused: !!hasPendingTransforms && fileTransformerStatus.getIsPaused(),
    isTransforming: fileTransformerStatus.getIsTransforming(),
  };
});

export const getFileTransformQueueCount = makeAction(async () => {
  const totals = await models.FileTransformModel.aggregate<{
    afterSize: number;
    beforeSize: number;
  }>([
    { $match: { type: { $ne: "splice" } } },
    {
      $group: {
        _id: null,
        afterSize: {
          $sum: {
            $cond: [{ $eq: ["$status", "MERGED"] }, 0, { $ifNull: ["$afterSize", "$beforeSize"] }],
          },
        },
        beforeSize: { $sum: "$beforeSize" },
      },
    },
  ]);

  return {
    afterSize: totals[0]?.afterSize ?? 0,
    beforeSize: totals[0]?.beforeSize ?? 0,
    pendingCount: await models.FileTransformModel.countDocuments({
      isCompleted: false,
    }),
  };
});

export const pauseFileTransformer = makeAction(async () => {
  fileTransformerStatus.setIsPaused(true);
});

const resolveDuplicateOutput = async (
  id: string,
  fileId: string,
  output: { hash: string; path: string },
  persist = true,
) => {
  const duplicate = await models.FileModel.findOne({
    _id: { $ne: fileId },
    hash: output.hash,
  }).lean();

  if (!duplicate) return null;

  if ((await hashMediaFile(output.path)) !== output.hash)
    throw new Error("The output file no longer matches its recorded MD5");

  if (duplicate.path !== output.path && (await hashMediaFile(duplicate.path)) !== output.hash)
    throw new Error("The matched file no longer matches its recorded MD5");

  const info = await getMediaInfo(output.path);

  return recordDuplicateTransform(id, info, output, duplicate, persist);
};

export const inspectFileTransformDuplicate = makeAction(async (args: { id: string }) => {
  const transform = await models.FileTransformModel.findById(args.id).lean();

  if (!transform) throw new Error("Transform not found");

  if (transform.status !== "DUPLICATE")
    throw new Error("Only duplicate transforms can be verified");

  if (!transform.afterHash || !transform.afterPath)
    throw new Error("Transform output is unavailable");

  return resolveDuplicateOutput(
    args.id,
    transform.fileId.toString(),
    { hash: transform.afterHash, path: transform.afterPath },
    false,
  );
});

export const listFileTransformDuplicates = makeAction(async () =>
  (
    await models.FileTransformModel.find({
      isCompleted: true,
      status: "DUPLICATE",
      type: { $ne: "splice" },
    })
      .select({ _id: 1 })
      .sort({ _id: 1 })
      .lean()
  ).map((transform) => transform._id.toString()),
);

let duplicateMergeAbortController: AbortController;
let duplicateMergeOperationId: string;
let activeMediaFinalizations = 0;

export const cancelFileTransformDuplicateMerge = makeAction(async () => {
  duplicateMergeAbortController?.abort();

  if (duplicateMergeOperationId)
    await actions.setBackgroundOperationStatus(duplicateMergeOperationId, "CANCELLED");
});

const completeDuplicateMerge = async (id: string) => {
  const updates = {
    errorMsg: null,
    finalizationPending: false,
    regenerationPending: false,
    regenerationTagIds: [],
  };

  await models.FileTransformModel.updateOne({ _id: id }, updates);
  socket.emit("onFileTransformUpdated", { id, updates });
};

const verifyDuplicateTransform = async (args: { id: string }) => {
  const verified = await models.FileTransformModel.findById(args.id).lean();

  if (!verified) throw new Error("Transform not found");

  if (verified.status !== "MERGED") {
    const inspection = await inspectFileTransformDuplicate(args);

    if (!inspection.success) throw new Error(inspection.error);

    if (!inspection.data) throw new Error("No matching file was found");

    if ((await hashMediaFile(verified.beforePath)) !== verified.beforeHash)
      throw new Error("The original file no longer matches its recorded MD5");

    verified.duplicateFileId = inspection.data.duplicateFileId;
    verified.duplicatePath = inspection.data.duplicatePath;
  }

  return verified;
};

const mergeDuplicateTransform = async (
  args: { id: string },
  verified?: Awaited<ReturnType<typeof verifyDuplicateTransform>>,
) =>
  withMetadataMutation(async () => {
    verified ??= await verifyDuplicateTransform(args);

    const transform = await models.FileTransformModel.findById(args.id).lean();

    if (transform?.status === "MERGED") {
      if (!transform.regenerationPending) return;

      const files = await models.FileModel.find({
        _id: { $in: [transform.fileId, transform.duplicateFileId] },
      }).lean();

      await actions.queueTagMetadataRegen([
        ...files.flatMap((file) => file.tagIds.map(String)),
        ...(transform.regenerationTagIds ?? []).map(String),
      ]);

      const collections = await actions.regenCollAttrs({
        fileIds: files.map((file) => file._id.toString()),
      });

      if (!collections.success) throw new Error(collections.error);

      await completeDuplicateMerge(args.id);

      return;
    }

    if (!transform || transform.type === "splice" || transform.status !== "DUPLICATE")
      throw new Error("Only duplicate media transforms can be merged");

    if (
      transform.beforeHash !== verified.beforeHash ||
      transform.beforePath !== verified.beforePath ||
      transform.afterHash !== verified.afterHash ||
      transform.afterPath !== verified.afterPath
    )
      throw new Error("Transform changed during verification");

    const original = await models.FileModel.findById(transform.fileId).lean();
    const match = await models.FileModel.findById(verified.duplicateFileId).lean();

    if (!original)
      throw new Error(
        `Original file record ${transform.fileId} is missing for ${transform.beforePath}. If the file is permanently gone, use Remove Failed Records in Activity.`,
      );

    if (!match)
      throw new Error(
        `Matched file record ${verified.duplicateFileId} is missing for ${verified.duplicatePath}. Retry to search for a current match.`,
      );

    if (original._id.equals(match._id))
      throw new Error(
        `Transform ${args.id} points to the same original and matched file (${original._id}). No files were merged or archived.`,
      );

    if (match.isArchived)
      throw new Error("The matched file is archived; unarchive it before merging");

    if (original.hash !== transform.beforeHash || original.path !== transform.beforePath)
      throw new Error("The original file has changed since this transform was created");

    if (match.hash !== verified.afterHash || match.path !== verified.duplicatePath)
      throw new Error("Matched file changed during verification");

    if (
      original.isArchived &&
      (await models.FileTransformModel.exists({
        duplicateFileId: { $ne: match._id },
        fileId: original._id,
        status: { $in: ["DUPLICATE", "MERGED"] },
      }))
    )
      throw new Error("The archived original has a merge targeting a different file");

    const metadata = mergeDuplicateMetadata(original, match);

    const updated = await actions.updateFile({
      args: {
        id: match._id.toString(),
        updates: {
          diffusionParams: metadata.diffusionParams,
          hasTranscript: metadata.hasTranscript,
          originalName: metadata.originalName,
          timestamps: metadata.timestamps,
          transcription: metadata.transcription,
        },
      },
    });

    if (!updated.success) throw new Error(updated.error);

    if (metadata.tagIds.length) {
      const tagged = await actions.editFileTags({
        addedTagIds: metadata.tagIds,
        fileIds: [match._id.toString()],
      });

      if (!tagged.success) throw new Error(tagged.error);
    }

    const rated = await actions.setFileRating({
      fileIds: [match._id.toString()],
      rating: metadata.rating,
    });

    if (!rated.success) throw new Error(rated.error);

    const collections = await models.FileCollectionModel.find({
      "fileIdIndexes.fileId": original._id,
    }).lean();

    for (const collection of collections) {
      const updatedCollection = await actions.updateCollection({
        fileIdIndexes: replaceDuplicateCollectionReferences(
          collection.fileIdIndexes,
          original._id.toString(),
          match._id.toString(),
        ),
        id: collection._id.toString(),
      });

      if (!updatedCollection.success) throw new Error(updatedCollection.error);
    }

    fileTransformerStatus.setActiveFileId(null, args.id);

    const archived = await actions.setFileIsArchived({
      fileIds: [original._id.toString()],
      isArchived: true,
    });

    if (!archived.success) throw new Error(archived.error);

    await updateFileTransform(args.id, {
      duplicateFileId: String(match._id),
      duplicatePath: match.path,
      errorMsg: null,
      regenerationPending: true,
      status: "MERGED",
    });

    if (transform.regenerationTagIds?.length)
      await actions.queueTagMetadataRegen(transform.regenerationTagIds.map(String));

    await completeDuplicateMerge(args.id);

    socket.emit("onFileTransformUpdated", {
      id: args.id,
      updates: { errorMsg: null, regenerationPending: false, status: "MERGED" },
    });

    socket.emit("onFilesArchived", { fileIds: [verified.fileId.toString()] });

    socket.emit("onFilesUpdated", {
      fileIds: [verified.fileId.toString()],
      updates: { isArchived: true },
    });
  });

const processDuplicateMergeQueue = async (operationId?: string, batchId?: string) => {
  while (operationId || canRunBackgroundQueues()) {
    let operation: models.BackgroundOperationSchema;

    try {
      operation = leanModelToJson<models.BackgroundOperationSchema>(
        await models.BackgroundOperationModel.findOne({
          ...(operationId ? { _id: operationId } : {}),
          status: { $in: ["PENDING", "RUNNING"] },
          type: "duplicateMerge",
        })
          .sort({ dateCreated: 1, _id: 1 })
          .lean(),
      );

      if (!operation) return;

      const ids = operation.targetIds
        .filter((id) => !operation.failures?.some((failure) => failure.targetId === id))
        .slice(0, 32);

      if (!ids.length) {
        await actions.setBackgroundOperationStatus(
          operation.id,
          operation.failures?.length ? "ERROR" : "COMPLETE",
          {
            error: operation.failures?.length
              ? `${operation.failures.length} duplicates could not be merged. See the individual failures below.`
              : null,
            message: `Merged ${operation.processedCount} of ${operation.totalCount} duplicates.`,
          },
        );

        if (operationId) return;

        continue;
      }

      await actions.setBackgroundOperationStatus(operation.id, "RUNNING");

      for (const id of ids) {
        try {
          const verified = await verifyDuplicateTransform({ id });

          const merged = await (async () => {
            const current = await models.BackgroundOperationModel.findById(operation.id).lean();

            if (!current || !["PENDING", "RUNNING"].includes(current.status)) return false;

            if (!current.targetIds.includes(id)) return true;

            await mergeDuplicateTransform({ id }, verified);
            await actions.completeBackgroundOperationTargets(
              operation.id,
              [id],
              `Merged ${current.processedCount + 1} of ${current.totalCount} duplicates.`,
            );

            return true;
          })();

          if (!merged) return;
        } catch (error) {
          if (backgroundExecution.getStore()?.cancelled || isServerStopping()) return;

          await models.BackgroundOperationModel.updateOne(
            { _id: operation.id, status: { $in: ["PENDING", "RUNNING"] } },
            { $push: { failures: { message: error.message, targetId: id } } },
          );
        }

        if (batchId) {
          const current = await models.BackgroundOperationModel.findById(operation.id).lean();

          socket.emit("onDuplicateMergeProgress", {
            batchId,
            completed: current.processedCount,
            failed: current.failures?.length ?? 0,
            isRegenerating: false,
          });
        }
      }
    } catch (error) {
      if (backgroundExecution.getStore()?.cancelled || isServerStopping()) return;

      if (!operation) throw error;

      await actions.setBackgroundOperationStatus(operation.id, "ERROR", { error: error.message });

      throw error;
    }
  }
};

export const mergeFileTransformDuplicate = makeAction(
  async (args: { id: string } | { ids: string[] }) => {
    if (activeMediaFinalizations || fileTransformerStatus.getIsTransforming())
      throw new Error("Wait for the current media operation to finish before merging duplicates");

    const ids = "ids" in args ? args.ids : [args.id];

    if (ids.length > CONSTANTS.FILE.TRANSFORM.BATCH_SIZE)
      throw new Error(`Merge at most ${CONSTANTS.FILE.TRANSFORM.BATCH_SIZE} duplicates per batch`);

    activeMediaFinalizations++;
    duplicateMergeAbortController = new AbortController();

    try {
      const operation = await actions.queueBackgroundOperation({
        label: "Duplicate merge",
        queueKey: `duplicateMerge:${randomUUID()}`,
        targetIds: ids,
        type: "duplicateMerge",
      });

      if (!operation) return { completed: 0, failures: [] as string[] };

      duplicateMergeOperationId = operation.id;

      await runBackgroundExecution(
        () => processDuplicateMergeQueue(operation.id, ids[0]),
        duplicateMergeAbortController.signal,
        false,
      );

      const result = await models.BackgroundOperationModel.findById(operation.id).lean();

      const failedTransforms = await models.FileTransformModel.find({
        _id: { $in: (result.failures ?? []).map((failure) => failure.targetId) },
      })
        .select({ beforePath: 1 })
        .lean();

      const failures = result.failures?.length
        ? result.failures.map((failure) => {
            const transform = failedTransforms.find(
              (transform) => transform._id.toString() === failure.targetId,
            );

            return `${transform?.beforePath ?? "Original file unavailable"} (transform ${failure.targetId}): ${failure.message}`;
          })
        : result.error
          ? [result.error]
          : [];

      if ("id" in args && failures.length) throw new Error(failures.join("\n"));

      socket.emit("onDuplicateMergeProgress", {
        batchId: ids[0],
        completed: result.processedCount,
        failed: failures.length,
        isRegenerating: false,
      });

      return { completed: result.processedCount, failures };
    } finally {
      duplicateMergeOperationId = null;
      activeMediaFinalizations--;
    }
  },
);

const autoMergeDuplicateTransform = async (id: string) => {
  try {
    await mergeDuplicateTransform({ id });
  } catch (error) {
    await updateFileTransform(id, { errorMsg: `Automatic merge failed: ${error.message}` });
  }
};

const retainTransformRecoveryFailure = async (id: string, error: Error) => {
  if (backgroundExecution.getStore()?.cancelled || isServerStopping()) throw error;

  if (error.message === "Original file not found") {
    const updates = {
      errorMsg:
        "The original file record no longer exists. The rendered output has been retained; this transform cannot replace the missing record.",
      finalizationPending: false,
      status: "ERROR" as const,
    };

    await models.FileTransformModel.updateOne({ _id: id }, updates);
    socket.emitReliable("onFileTransformUpdated", { id, updates });

    return;
  }

  await updateFileTransform(id, { errorMsg: `Recovery pending: ${error.message}` });
  console.error("Transform recovery retained for retry:", error);
};

export const resumeFileTransformer = makeAction(async () => {
  await assertMediaPathIndexesReady();

  fileTransformerStatus.setIsPaused(false);
});

export const setFileTransformerAuto = makeAction(async (args: { isAuto: boolean }) => {
  fileTransformerStatus.setIsAuto(args.isAuto);
});

const finishTransformCleanup = async (id: string) => {
  const transform = await models.FileTransformModel.findById(id).lean();

  if (!transform?.cleanupPending) return;

  try {
    if (transform.status === "SKIPPED") {
      if (!(await isMediaPathReferenced(transform.afterPath, { transformId: id }))) {
        try {
          await syncMediaFile(transform.afterPath, transform.afterHash);

          checkBackgroundExecution();

          const removed = await deleteFile(transform.afterPath);

          if (!removed.success) throw new Error(removed.error);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }

      await models.FileTransformModel.updateOne(
        { _id: id, status: "SKIPPED" },
        {
          afterHash: null,
          afterPath: null,
          cleanupPending: false,
          errorMsg: null,
        },
      );

      return;
    }

    if (transform.status !== "REPLACED")
      throw new Error("Unexpected cleanup state; files retained");

    if (!mediaPathPattern(transform.beforePath).test(transform.afterPath)) {
      const originalExists = await fs
        .stat(transform.beforePath)
        .then(() => true)
        .catch((error) => {
          if (error.code === "ENOENT") return false;

          throw error;
        });

      if (
        originalExists &&
        !(await isMediaPathReferenced(transform.beforePath, { transformId: id }))
      ) {
        const file = await models.FileModel.findById(transform.fileId)
          .select({ hash: 1, path: 1 })
          .lean();

        if (!file?.path || !file.hash)
          throw new Error("Replacement metadata missing; original retained");

        // A later replacement may already have superseded this transform's output.
        await syncMediaFile(file.path, file.hash);

        if ((await hashMediaFile(transform.beforePath)) !== transform.beforeHash)
          throw new Error("Original checksum changed; original retained");

        checkBackgroundExecution();

        const diskRes = await deleteFile(transform.beforePath, file.path);

        if (!diskRes.success) throw new Error(diskRes.error);
      }
    }

    await models.FileTransformModel.updateOne(
      { _id: id, status: "REPLACED" },
      { cleanupPending: false, errorMsg: null },
    );
  } catch (error) {
    if (backgroundExecution.getStore()?.cancelled || isServerStopping()) throw error;

    await models.FileTransformModel.updateOne(
      { _id: id },
      { errorMsg: `Cleanup pending: ${error.message}` },
    );

    console.error("Replacement committed; original cleanup will be retried:", error);
  }
};

const assertTransformPreservesAnimation = async (
  transform: Pick<models.FileTransformSchema, "beforePath" | "type">,
  info: MediaInfo,
  signal?: AbortSignal,
) => {
  if (
    transform.type === "reencode" &&
    !info.isAnimated &&
    (await getMediaInfo(transform.beforePath, signal)).isAnimated
  )
    throw new Error("Re-encoding lost the animation; the original file has been retained.");
};

const replaceTransformOutput = async (args: { id: string }, outputInfo?: MediaInfo) => {
  const startedAt = Date.now();
  const transform = await models.FileTransformModel.findById(args.id).lean();

  if (!transform?.afterPath || !transform.afterHash) throw new Error("Transform output not found");

  if (transform.status === "REPLACED") {
    if (await FileOperationModel.exists({ _id: `transform:${args.id}`, state: "PREPARED" }))
      await commitTransformMetadata(args.id, { retainOutput: true });

    runTransformCleanupQueue();

    return { status: "REPLACED" as const };
  }

  if (transform.status === "DUPLICATE") return { status: "DUPLICATE" as const };

  const source = await models.FileModel.findById(transform.fileId)
    .select({ hash: 1, path: 1, thumb: 1 })
    .lean();

  if (!source) throw new Error("Original file not found");

  if (
    source.hash !== transform.afterHash &&
    (await hashMediaFile(transform.beforePath)) !== transform.beforeHash
  )
    throw new Error("Original checksum changed; replacement cancelled");

  const info = outputInfo ?? (await getMediaInfo(transform.afterPath));

  await assertTransformPreservesAnimation(transform, info);

  const fileInfo = await prepareTransformMetadata(args.id, {
    filePath: transform.afterPath,
    hash: transform.afterHash,
    withTranscription: false,
    withWaveform: true,
  });

  if (isGeneratedMediaUnreadable(fileInfo)) throw new Error("Replacement media could not be read");

  // Preserve concurrent transcript edits for remuxes; reencoding explicitly clears them below.
  delete fileInfo.hasTranscript;
  delete fileInfo.transcription;

  if (fileInfo.thumb?.path) await syncMediaFile(fileInfo.thumb.path);

  const previousThumb = await describeFileCleanup(source.thumb?.path, fileInfo.thumb?.path);

  const fileUpdates = {
    ...fileInfo,
    ...info,
    ...(transform.type === "reencode" ? { hasTranscript: false, transcription: null } : {}),
    hash: transform.afterHash,
    path: transform.afterPath,
  };

  const preparedAt = Date.now();

  const result = await (async () => {
    const current = await models.FileTransformModel.findById(args.id).lean();
    const original = await models.FileModel.findById(transform.fileId).lean();

    if (
      !current ||
      current.afterHash !== transform.afterHash ||
      current.afterPath !== transform.afterPath
    )
      throw new Error("Transform changed during finalization");

    if (
      !original ||
      !(
        (original.hash === transform.beforeHash && original.path === transform.beforePath) ||
        (original.hash === transform.afterHash && original.path === transform.afterPath)
      ) ||
      original.thumb?.path !== source.thumb?.path
    )
      throw new Error("Original changed during finalization");

    const duplicate = await models.FileModel.findOne({
      _id: { $ne: original._id },
      hash: transform.afterHash,
    }).lean();

    if (duplicate) {
      const duplicateResult = await recordDuplicateTransform(
        args.id,
        info,
        { hash: transform.afterHash, path: transform.afterPath },
        duplicate,
      );

      await commitTransformMetadata(args.id);

      return duplicateResult;
    }

    if (previousThumb)
      await FileOperationModel.updateOne(
        { _id: `transform:${args.id}`, state: "PREPARED" },
        { $addToSet: { cleanup: previousThumb } },
        metadataWriteOptions(),
      );

    const updates = {
      ...makeAfterAttrs(info, transform.afterPath, transform.afterHash),
      cleanupPending: true,
      finalizationPending: false,
      status: "REPLACED" as const,
    };

    await models.FileTransformModel.updateOne(
      { _id: args.id },
      { finalizationPending: true, regenerationPending: true },
      metadataWriteOptions(),
    );

    const updated = await actions.updateFile({
      args: {
        id: original._id.toString(),
        updates: fileUpdates,
      },
    });

    if (!updated.success) throw new Error(updated.error);

    await updateFileTransform(args.id, updates);
    await commitTransformMetadata(args.id, { retainOutput: true });

    runTransformCleanupQueue();

    return updates;
  })();

  if (result.status === "REPLACED") {
    socket.emitReliable("onFileUpdated", {
      id: transform.fileId.toString(),
      updates: fileUpdates,
    });
  }

  socket.emit("onFileTransformUpdated", { id: args.id, updates: result });

  if (Date.now() - startedAt >= 1000)
    fileLog(
      `[TRANSFORM ${args.id}] Replace took ${Date.now() - startedAt} ms: preparation ${preparedAt - startedAt} ms, metadata commit ${Date.now() - preparedAt} ms.`,
    );

  return result;
};

const runTransformCleanupQueue = makeBackgroundOperationRunner("transform cleanup", async () => {
  for await (const transform of models.FileTransformModel.find({ cleanupPending: true })
    .select({ _id: 1 })
    .lean()
    .cursor()) {
    if (!canRunBackgroundQueues()) return;

    await finishTransformCleanup(transform._id.toString());
  }
});

const runTransformRegenerationQueue = makeBackgroundOperationRunner(
  "transform metadata regeneration",
  async () => {
    if (activeMediaFinalizations || activeTransformExecution) return;

    const transforms = await models.FileTransformModel.find({
      finalizationPending: false,
      regenerationPending: true,
      status: { $ne: "MERGED" },
    })
      .select({ _id: 1, fileId: 1, regenerationTagIds: 1 })
      .lean();

    if (!transforms.length) return;

    const collectionIds = new Set<string>();
    const tagIds = new Set<string>();

    for (const batch of chunkArray(transforms, 100)) {
      checkBackgroundExecution();

      for (const transform of batch) {
        for (const id of transform.regenerationTagIds ?? []) tagIds.add(String(id));
      }

      const fileIds = batch.map(({ fileId }) => fileId);

      const [files, collections] = await Promise.all([
        models.FileModel.find({ _id: { $in: fileIds } })
          .select({ tagIds: 1 })
          .lean(),
        models.FileCollectionModel.find({ "fileIdIndexes.fileId": { $in: fileIds } })
          .select({ _id: 1 })
          .lean(),
      ]);

      for (const file of files) {
        for (const id of file.tagIds) tagIds.add(String(id));
      }

      for (const collection of collections) collectionIds.add(String(collection._id));
    }

    checkBackgroundExecution();

    if (tagIds.size) await actions.queueTagMetadataRegen([...tagIds]);

    if (collectionIds.size) {
      const result = await actions.regenCollAttrs({ collIds: [...collectionIds] });

      if (!result.success) throw new Error(result.error);
    }

    for (const batch of chunkArray(transforms, 100))
      await models.FileTransformModel.updateMany(
        {
          _id: { $in: batch.map(({ _id }) => _id) },
          finalizationPending: false,
          status: { $ne: "MERGED" },
        },
        { regenerationPending: false, regenerationTagIds: [] },
        metadataWriteOptions(),
      );
  },
  false,
);

makeBackgroundOperationRunner("file recovery and duplicate merging", async () => {
  if (activeMediaFinalizations || activeTransformExecution)
    throw new Error("Pause the transformer before resuming file recovery");

  activeMediaFinalizations++;

  try {
    await recoverDirectImports(canRunBackgroundQueues);

    for await (const transform of models.FileTransformModel.find({
      regenerationPending: true,
      status: "MERGED",
    })
      .lean()
      .cursor()) {
      if (!canRunBackgroundQueues()) return;

      try {
        await mergeDuplicateTransform({ id: transform._id.toString() });
      } catch (error) {
        await retainTransformRecoveryFailure(transform._id.toString(), error);
      }
    }

    await resetStaleRunningTransforms();

    for await (const transform of models.FileTransformModel.find({ finalizationPending: true })
      .lean()
      .cursor()) {
      if (!canRunBackgroundQueues()) return;

      try {
        if (transform.status === "DUPLICATE")
          await autoMergeDuplicateTransform(String(transform._id));
        else if (["COMPLETE", "COMPRESSED"].includes(transform.status)) {
          const result = await replaceTransformOutput({ id: String(transform._id) });

          if (result.status === "DUPLICATE")
            await autoMergeDuplicateTransform(String(transform._id));
        }
      } catch (error) {
        await retainTransformRecoveryFailure(transform._id.toString(), error);
      }
    }

    await processDuplicateMergeQueue();
  } finally {
    activeMediaFinalizations--;
    runTransformRegenerationQueue();
  }
});

export const replaceFileTransformOutput = makeAction(async (args: { id: string }) => {
  if (activeMediaFinalizations || fileTransformerStatus.getIsTransforming())
    throw new Error("Wait for the current media operation to finish before replacing output");

  activeMediaFinalizations++;

  try {
    return await runBackgroundExecution(() => replaceTransformOutput(args));
  } finally {
    activeMediaFinalizations--;
    runTransformRegenerationQueue();
  }
});

const executeFileTransform = async (args: { id: string }, signal: AbortSignal) => {
  let output: { hash: string; info?: MediaInfo; path: string } = null;
  let withNextTransform = true;
  let transform: LeanDocument<models.FileTransformSchema & { _id: MongoTypes.ObjectId }>;
  let stageTimeout: ReturnType<typeof setTimeout>;

  const clearStage = () => clearTimeout(stageTimeout);

  const setStage = (stage: string) => {
    clearStage();

    if (signal.aborted) return;

    stageTimeout = setTimeout(() => {
      fileLog(`[TRANSFORM ${args.id}] Still ${stage} after 10 seconds.`);
    }, 10000);
    stageTimeout.unref();
  };

  signal.addEventListener("abort", clearStage, { once: true });

  try {
    signal.throwIfAborted();
    setStage("loading the transform record");
    transform = await models.FileTransformModel.findById(args.id).lean();

    if (!transform) throw new Error(`File transform not found: ${args.id}`);

    if (transform.isCompleted) throw new Error(`File transform is completed: ${args.id}`);

    setStage("loading the source file and its tags");

    const file = await models.FileModel.findById(transform.fileId).lean();

    fileTransformerStatus.setActiveFileId(transform.fileId.toString(), args.id);

    if (!file || file.isArchived) {
      fileTransformerStatus.setActiveFileId(null, args.id);

      const deleted = await deleteFileTransforms({ ids: [args.id] });

      if (!deleted.success) throw new Error(deleted.error);

      return true;
    }

    if (file.hash !== transform.beforeHash || file.path !== transform.beforePath)
      throw new Error("The original file has changed since this transform was created");

    const startedAt = transform.startedAt ?? dayjs().toISOString();

    setStage("saving the running state");
    await updateFileTransform(args.id, { errorMsg: null, startedAt, status: "RUNNING" });

    fileTransformerStatus.publishPreview(leanModelToJson<models.FileSchema>(file), {
      ...leanModelToJson<models.FileTransformSchema>(transform),
      errorMsg: null,
      startedAt,
      status: "RUNNING",
    });

    const options = {
      onOutputPrepared: async (output: { hash: string; path: string; tempPath: string }) => {
        setStage("recording the prepared output");
        await updateFileTransform(args.id, {
          afterHash: output.hash,
          afterPath: output.path,
          outputTempPath: output.tempPath,
        });

        setStage("publishing the output file");
      },

      onTempPath: async (outputTempPath: string) => {
        setStage("reserving the temporary output path");
        await updateFileTransform(args.id, { afterHash: null, afterPath: null, outputTempPath });
        setStage("encoding and verifying the output");
      },

      onProgress: (progress) => {
        updateFileTransform(args.id, {
          progressPercent: Number.isFinite(progress.percent)
            ? Math.min(100, Math.max(0, progress.percent))
            : 0,
          progressSize: Number.isFinite(progress.size) ? progress.size : 0,
          progressTime: progress.time,
        }).catch((error) => {
          if (!signal.aborted) console.error("Transform progress update failed:", error);
        });
      },

      signal,
    };

    signal.throwIfAborted();

    setStage("checking recoverable output");
    output = await recoverMediaOutput({
      hash: transform.afterHash,
      path: transform.afterPath,
      tempPath: transform.outputTempPath,
    });

    if (!output) {
      setStage("removing incomplete output");

      if (transform.outputTempPath) await fs.rm(transform.outputTempPath, { force: true });

      setStage("checking available file storage");

      const storageRes = await getAvailableFileStorage(transform.beforeSize);

      if (!storageRes.success) throw new Error(storageRes.error);

      setStage("preparing the encoder");
      output =
        transform.type === "reencode"
          ? await reencode(transform.beforePath, storageRes.data.location, options)
          : transform.type === "remux"
            ? await remux(transform.beforePath, storageRes.data.location, options)
            : await spliceVideo(
                transform.beforePath,
                storageRes.data.location,
                transform.timestampPairs.map(({ end, start }) => [start, end]),
                options,
              );
    }

    setStage("recording the published output");
    await updateFileTransform(args.id, {
      afterHash: output.hash,
      afterPath: output.path,
      outputTempPath: null,
    });

    setStage("reading output metadata");

    const info = output.info ?? (await getMediaInfo(output.path));

    await assertTransformPreservesAnimation(transform, info, signal);

    if (transform.type !== "splice") {
      setStage("checking for duplicate output");

      const duplicate = await models.FileModel.findOne({
        _id: { $ne: file._id },
        hash: output.hash,
      }).lean();

      if (duplicate) {
        setStage("finalizing duplicate output");
        await updateFileTransform(args.id, { finalizationPending: true });
        await recordDuplicateTransform(args.id, info, output, duplicate);
        await autoMergeDuplicateTransform(args.id);

        return true;
      }
    }

    const status =
      transform.type === "reencode"
        ? info.size < transform.beforeSize
          ? ("COMPRESSED" as const)
          : ("SKIPPED" as const)
        : ("COMPLETE" as const);

    setStage("committing completion and tag changes");
    await updateFileTransform(args.id, {
      ...makeAfterAttrs(info, output.path, output.hash),
      cleanupPending: status === "SKIPPED",
      completedAt: dayjs().toISOString(),
      finalizationPending:
        fileTransformerStatus.getIsAuto() && status !== "SKIPPED" && transform.type !== "splice",
      isCompleted: true,
      progressPercent: 100,
      status,
    });

    if (status === "SKIPPED") runTransformCleanupQueue();

    if (fileTransformerStatus.getIsAuto() && status !== "SKIPPED" && transform.type !== "splice") {
      activeMediaFinalizations++;

      try {
        setStage("replacing the source file");

        const replacement = await replaceTransformOutput({ id: args.id }, info);

        if (replacement.status === "DUPLICATE") await autoMergeDuplicateTransform(args.id);
      } finally {
        activeMediaFinalizations--;
      }
    }
  } catch (err) {
    if (signal.aborted || backgroundExecution.getStore()?.cancelled || isServerStopping())
      return false;

    if (!transform) throw err;

    setStage("recording the transform failure");

    const committed = await models.FileTransformModel.findById(args.id)
      .select({ status: 1 })
      .lean();

    if (!committed || ["MERGED", "REPLACED", "SAVED", "SKIPPED"].includes(committed.status))
      return false;

    if (output && transform.type !== "splice") {
      try {
        if (await resolveDuplicateOutput(args.id, transform.fileId.toString(), output)) {
          await autoMergeDuplicateTransform(args.id);

          return true;
        }
      } catch (duplicateError) {
        err.message = `${err.message}\nDuplicate verification failed: ${duplicateError.message}`;
      }
    }

    withNextTransform = !err.message.includes("No available file storage location found");

    await updateFileTransform(args.id, {
      ...(output ? { afterHash: output.hash, afterPath: output.path } : {}),
      completedAt: dayjs().toISOString(),
      errorMsg: err.message,
      isCompleted: true,
      status: "ERROR",
    });
  } finally {
    clearStage();
    signal.removeEventListener("abort", clearStage);
    fileTransformerStatus.setActiveFileId(null, args.id);
  }

  return withNextTransform;
};

// @generator-ignore-export
export const stopFileTransformer = async () => {
  duplicateMergeAbortController?.abort();
  fileTransformerStatus.setIsPaused(true);
};

const startFileTransform = (args: { id: string }) => {
  if (activeMediaFinalizations || isServerStopping()) return false;

  const signal = fileTransformerStatus.tryRun();

  if (!signal) return false;

  const startupTimeout = setTimeout(() => {
    fileLog(`[TRANSFORM ${args.id}] Still loading or claiming work after 10 seconds.`);
  }, 10000);

  const clearStartupTimeout = () => {
    clearTimeout(startupTimeout);
    signal.removeEventListener("abort", clearStartupTimeout);
  };

  startupTimeout.unref();
  signal.addEventListener("abort", clearStartupTimeout, { once: true });

  let execution: Promise<void>;

  execution = (async () => {
    try {
      let next = leanModelToJson<models.FileTransformSchema>(
        await models.FileTransformModel.findById(args.id).lean(),
      );

      while (next && !signal.aborted && !fileTransformerStatus.getIsPaused()) {
        const concurrentImages =
          fileTransformerStatus.getIsAuto() &&
          next.type === "reencode" &&
          getIsImage(next.beforeExt) &&
          next.beforeExt !== "gif";

        const firstId = next.id;

        const workers = Array.from(
          {
            length: concurrentImages
              ? Math.max(
                  1,
                  Math.min(16, Math.floor(getConfig().file.reencode.imageConcurrency) || 1),
                )
              : 1,
          },
          (_, index) =>
            runBackgroundExecution(
              async () => {
                let candidate = index === 0 ? next : null;

                while (!signal.aborted && !fileTransformerStatus.getIsPaused()) {
                  candidate ??= await getQueueTransform("PENDING");

                  if (!candidate) return;

                  if (index !== 0 && candidate.id === firstId) {
                    await new Promise<void>((resolve) => setImmediate(resolve));
                    candidate = null;
                    continue;
                  }

                  if (
                    concurrentImages &&
                    (candidate.type !== "reencode" ||
                      !getIsImage(candidate.beforeExt) ||
                      candidate.beforeExt === "gif")
                  )
                    return;

                  const claimed = await models.FileTransformModel.findOneAndUpdate(
                    { _id: candidate.id, isCompleted: false, status: "PENDING" },
                    { $set: { startedAt: dayjs().toISOString(), status: "RUNNING" } },
                    { new: true },
                  ).lean();

                  candidate = null;

                  if (!claimed) continue;

                  if (index === 0) clearStartupTimeout();

                  const withNextTransform = await executeFileTransform(
                    { id: String(claimed._id) },
                    signal,
                  );

                  if (!withNextTransform) {
                    fileTransformerStatus.setIsPaused(true);

                    return;
                  }

                  if (!concurrentImages || !fileTransformerStatus.getIsAuto()) return;
                }
              },
              signal,
              false,
            ).catch(async (error) => {
              const wasInterrupted = signal.aborted || isServerStopping();

              fileTransformerStatus.setIsPaused(true);

              if (!wasInterrupted) {
                console.error("Media processing stopped:", error);
                await actions.recordNotification({ message: error.message, type: "error" });
              }

              throw error;
            }),
        );

        const results = await Promise.allSettled(workers);

        for (const result of results) {
          if (result.status === "rejected") throw result.reason;
        }

        if (!fileTransformerStatus.getIsAuto() || next.type === "splice" || signal.aborted) break;

        next = await getQueueTransform("PENDING");
      }
    } finally {
      clearStartupTimeout();
      fileTransformerStatus.setIsTransforming(false);
    }
  })()
    .catch(async (error) => {
      if (signal.aborted || isServerStopping()) return;

      console.error("Media processing stopped:", error);
      await actions.recordNotification({ message: error.message, type: "error" });
    })
    .finally(() => {
      if (activeTransformExecution === execution) activeTransformExecution = null;

      runTransformRegenerationQueue();
    });

  activeTransformExecution = execution;

  return true;
};

export const runFileTransform = makeAction(async (args: { id: string; isAuto?: boolean }) => {
  await assertMediaPathIndexesReady();

  if (activeMediaFinalizations)
    throw new Error("Wait for media finalization or recovery to finish");

  if (typeof args.isAuto === "boolean") fileTransformerStatus.setIsAuto(args.isAuto);

  if (activeTransformExecution) {
    fileTransformerStatus.setIsPaused(true);
    await activeTransformExecution;
  }

  await resetStaleRunningTransforms();

  const transform = await models.FileTransformModel.findById(args.id).lean();

  if (!transform) throw new Error(`File transform not found: ${args.id}`);

  if (transform.isCompleted && transform.status !== "ERROR")
    throw new Error(`File transform is completed: ${args.id}`);

  if (transform.status === "ERROR") {
    await updateFileTransform(args.id, {
      completedAt: null,
      errorMsg: null,
      isCompleted: false,
      progressPercent: null,
      progressSize: null,
      progressTime: null,
      startedAt: null,
      status: "PENDING",
    });
  }

  fileTransformerStatus.setIsPaused(false);

  return { started: startFileTransform({ id: args.id }) };
});

export const runFileTransformer = makeAction(async (args: { isAuto?: boolean }) => {
  await assertMediaPathIndexesReady();

  if (activeMediaFinalizations)
    throw new Error("Wait for media finalization or recovery to finish");

  if (activeTransformExecution) throw new Error("The media transformer is already running");

  if (typeof args.isAuto === "boolean") fileTransformerStatus.setIsAuto(args.isAuto);

  await resetStaleRunningTransforms();

  const transform = await getQueueTransform("PENDING");

  return { started: transform ? startFileTransform({ id: transform.id }) : false };
});

const saveTransformCopy = async (args: { id: string }) => {
  const transform = await models.FileTransformModel.findById(args.id).lean();

  if (!transform?.afterPath || !transform.afterHash) throw new Error("Transform output not found");

  if (transform.status === "SAVED") {
    const saved = await models.FileModel.findOne({ hash: transform.afterHash }).lean();

    if (!saved) throw new Error("The saved copy is no longer available");

    const preparation = await FileOperationModel.findById(`transform:${args.id}`).lean();

    if (preparation?.state === "PREPARED")
      await commitTransformMetadata(args.id, {
        retainOutput: saved.thumb?.path === preparation.outputPath,
      });

    return leanModelToJson<models.FileSchema>(saved);
  }

  const file = await models.FileModel.findById(transform.fileId).lean();

  if (!file) throw new Error("Original file not found");

  const info = await prepareTransformMetadata(args.id, {
    filePath: transform.afterPath,
    hash: transform.afterHash,
    withTranscription: false,
    withWaveform: true,
  });

  if (isGeneratedMediaUnreadable(info)) throw new Error("Transform output could not be read");

  if (info.thumb?.path) await syncMediaFile(info.thumb.path);

  const current = await models.FileTransformModel.findById(args.id).lean();

  if (
    !current ||
    current.afterHash !== transform.afterHash ||
    current.afterPath !== transform.afterPath
  )
    throw new Error("Transform changed during finalization");

  const original = await models.FileModel.findById(transform.fileId).lean();

  if (!original) throw new Error("Original file not found");

  const config = getConfig().file.splice.onComplete;

  const tagIds = [
    ...new Set([
      ...original.tagIds.map(String).filter((id) => !config.removeTagIds.includes(id)),
      ...config.addTagIds,
    ]),
  ];

  let saved = leanModelToJson<models.FileSchema>(
    await models.FileModel.findOne({ hash: transform.afterHash }).lean(),
  );

  if (!saved) {
    const imported = await actions.importFile({
      ...info,
      dateCreated: dayjs().toISOString(),
      dateImported: dayjs().toISOString(),
      originalHash: transform.afterHash,
      originalName: original.originalName,
      originalPath: transform.afterPath,
      path: transform.afterPath,
      tagIds,
    });

    if (!imported.success) throw new Error(imported.error);

    saved = imported.data;
  } else {
    const tagged = await actions.editFileTags({ addedTagIds: tagIds, fileIds: [saved.id] });

    if (!tagged.success) throw new Error(tagged.error);
  }

  await updateFileTransform(args.id, { status: "SAVED" });
  await commitTransformMetadata(args.id, {
    retainOutput: saved.thumb?.path === info.thumb?.path,
  });

  socket.emit("onFileTransformUpdated", { id: args.id, updates: { status: "SAVED" } });

  return saved;
};

export const saveFileTransformCopy = makeAction(async (args: { id: string }) => {
  if (activeMediaFinalizations || fileTransformerStatus.getIsTransforming())
    throw new Error("Wait for the current media operation to finish before saving a copy");

  activeMediaFinalizations++;

  try {
    return await runBackgroundExecution(() => saveTransformCopy(args));
  } finally {
    activeMediaFinalizations--;
  }
});
