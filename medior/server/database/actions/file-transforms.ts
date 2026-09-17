import * as models from "medior/_generated/server/models";
import { ModelCreationData } from "mobx-keystone";
import { deleteFile, md5File } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import {
  deferRegeneration,
  withRegenerationBatch,
} from "medior/server/database/regeneration-batch";
import * as Types from "medior/server/database/types";
import { FileImporter } from "medior/store/imports/importer";
import { CONSTANTS, dayjs, getOrientedSizeLimits } from "medior/utils/common";
import {
  mergeDuplicateMetadata,
  replaceDuplicateCollectionReferences,
} from "medior/utils/common/duplicate-metadata";
import { leanModelToJson, makeAction, objectIds, socket } from "medior/utils/server";
import { getAvailableFileStorage, getConfig } from "medior/utils/server/config";
import { getMediaInfo, MediaInfo, reencode, remux, spliceVideo } from "medior/utils/server/videos";

class FileTransformerStatus {
  private abortController: AbortController = null;
  private activeFileId: string = null;
  private activeTransformId: string = null;
  private isAuto = false;
  private isPaused = false;
  private isTransforming = false;

  getIsAuto() {
    return this.isAuto;
  }

  getIsPaused() {
    return this.isPaused;
  }

  getIsTransforming() {
    return this.isTransforming;
  }

  setActiveFileId(fileId: string) {
    this.activeFileId = fileId;
  }

  setActiveTransformId(id: string) {
    this.activeTransformId = id;
  }

  abortByTransformIds(ids: string[]) {
    if (this.activeTransformId && ids.includes(this.activeTransformId))
      this.abortController?.abort();
  }

  abortByFileIds(fileIds: string[]) {
    if (this.activeFileId && fileIds.includes(this.activeFileId)) this.abortController?.abort();
  }

  setIsPaused(isPaused: boolean) {
    if (this.isPaused === isPaused) return;
    this.isPaused = isPaused;
    if (isPaused) this.abortController?.abort();
    socket.emit("onFileTransformerStatusUpdated");
  }

  setIsAuto(isAuto: boolean) {
    this.isAuto = isAuto;
    socket.emit("onFileTransformerStatusUpdated");
  }

  setIsTransforming(isTransforming: boolean) {
    this.isTransforming = isTransforming;
    if (!isTransforming) {
      this.abortController = null;
      this.activeFileId = null;
      this.activeTransformId = null;
    }
    socket.emit("onFileTransformerStatusUpdated");
  }

  tryRun() {
    if (this.isTransforming) return null;
    this.abortController = new AbortController();
    this.isPaused = false;
    this.isTransforming = true;
    socket.emit("onFileTransformerStatusUpdated");
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
  await models.FileTransformModel.updateOne({ _id: id }, updates);
  const tagEvent = {
    COMPLETE: "onComplete",
    COMPRESSED: "onComplete",
    DUPLICATE: "onDuplicate",
    ERROR: "onError",
    SKIPPED: "onSkip",
  }[updates.status];
  if (tagEvent) {
    const tags = getConfig().file.reencode[tagEvent] as {
      addTagIds: string[];
      removeTagIds: string[];
    };
    if (tags.addTagIds.length || tags.removeTagIds.length) {
      try {
        const transform = await models.FileTransformModel.findById(id).lean();
        if (transform && transform.type !== "splice") {
          const res = await actions.editFileTags({
            addedTagIds: tags.addTagIds,
            fileIds: [transform.fileId.toString()],
            removedTagIds: tags.removeTagIds,
          });
          if (!res.success) throw new Error(res.error);
        }
      } catch (error) {
        updates.errorMsg = [updates.errorMsg, `Status tag updates failed: ${error.message}`]
          .filter(Boolean)
          .join("\n");
        await models.FileTransformModel.updateOne({ _id: id }, { errorMsg: updates.errorMsg });
      }
    }
  }
  socket.emit("onFileTransformUpdated", { id, updates });
};

const recordDuplicateTransform = async (
  id: string,
  info: MediaInfo,
  output: { hash: string; path: string },
  duplicate: { _id: { toString(): string }; path: string },
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
  await updateFileTransform(id, updates);
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
  if (res.modifiedCount) socket.emit("onReloadFileTransforms");
};

const getQueueTransform = async (status: Types.FileTransformStatus) =>
  leanModelToJson<models.FileTransformSchema>(
    await models.FileTransformModel.findOne({ isCompleted: false, status })
      .sort({ dateCreated: 1, queueIndex: 1, _id: 1 })
      .lean(),
  );

export const getNextFileTransform = makeAction(async () => {
  await resetStaleRunningTransforms();
  return (await getQueueTransform("RUNNING")) ?? (await getQueueTransform("PENDING"));
});

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

    const config = getConfig().file.reencode;
    const sortDir = args.sortValue?.isDesc ? -1 : 1;
    const files = await models.FileModel.find({
      _id: { $in: objectIds(args.fileIds) },
      isArchived: false,
    })
      .sort(args.sortValue ? { [args.sortValue.key]: sortDir, _id: sortDir } : {})
      .allowDiskUse(true)
      .lean();
    const fileMap = new Map(files.map((file) => [file._id.toString(), file]));
    const orderedFileIds = args.sortValue
      ? files.map((file) => file._id.toString())
      : [...new Set(args.fileIds)];
    const missingFileIds = args.fileIds.filter((id) => !fileMap.has(id));
    if (missingFileIds.length) throw new Error(`Files not found: ${missingFileIds.join(", ")}`);

    const existingTransforms = await models.FileTransformModel.find({
      fileId: { $in: objectIds(args.fileIds) },
      isCompleted: false,
      type: args.type,
    }).lean();

    const existingFileIdSet = new Set(
      existingTransforms.map((transform) => transform.fileId.toString()),
    );
    const dateCreated = dayjs().toISOString();
    const transforms: ModelCreationData<models.FileTransformSchema>[] = orderedFileIds
      .filter((id) => !existingFileIdSet.has(id))
      .map((id, queueIndex) => {
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
        return {
          ...makeBeforeAttrs(file),
          configCodec: config.codec,
          configImageExt: config.imageExt,
          configImageMaxHeight: imageLimits.height,
          configImageMaxWidth: imageLimits.width,
          configMaxBitrate: config.maxBitrate,
          configMaxFps: config.maxFps,
          configMaxHeight: videoLimits.height,
          configMaxWidth: videoLimits.width,
          configOverride: config.override,
          dateCreated,
          fileId: id,
          isCompleted: false,
          queueIndex,
          status: "PENDING",
          timestampPairs: args.timestampPairs ?? [],
          type: args.type,
        };
      });

    const res = transforms.length ? await models.FileTransformModel.insertMany(transforms) : [];
    if (res.length !== transforms.length) throw new Error("Failed to create file transforms");
    socket.emit("onReloadFileTransforms");
    const transformIdByFileId = new Map(
      [...existingTransforms, ...res].map((transform) => [
        transform.fileId.toString(),
        transform._id.toString(),
      ]),
    );
    const transformIds = orderedFileIds.map((id) => transformIdByFileId.get(id));
    return { count: transformIds.length, ids: transformIds };
  },
);

export const deleteFileTransforms = makeAction(async (args: { ids: string[] }) => {
  fileTransformerStatus.abortByTransformIds(args.ids);
  return await models.FileTransformModel.deleteMany({ _id: { $in: args.ids } });
});

export const deleteFileTransformsByFileIds = makeAction(async (args: { fileIds: string[] }) => {
  fileTransformerStatus.abortByFileIds(args.fileIds);
  const res = await models.FileTransformModel.deleteMany({
    fileId: { $in: objectIds(args.fileIds) },
    isCompleted: false,
  });
  if (res.deletedCount) socket.emit("onReloadFileTransforms");
  return res;
});

export const getFileTransformerStatus = makeAction(async () => ({
  isAuto: fileTransformerStatus.getIsAuto(),
  isPaused: fileTransformerStatus.getIsPaused(),
  isTransforming: fileTransformerStatus.getIsTransforming(),
}));

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
) => {
  const duplicate = await models.FileModel.findOne({
    _id: { $ne: fileId },
    hash: output.hash,
  }).lean();
  if (!duplicate) return null;
  if ((await md5File(output.path)) !== output.hash)
    throw new Error("The output file no longer matches its recorded MD5");
  if (duplicate.path !== output.path && (await md5File(duplicate.path)) !== output.hash)
    throw new Error("The matched file no longer matches its recorded MD5");
  const info = await getMediaInfo(output.path);
  return recordDuplicateTransform(id, info, output, duplicate);
};

export const inspectFileTransformDuplicate = makeAction(async (args: { id: string }) => {
  const transform = await models.FileTransformModel.findById(args.id).lean();
  if (!transform) throw new Error("Transform not found");
  if (transform.status !== "DUPLICATE")
    throw new Error("Only duplicate transforms can be verified");
  if (!transform.afterHash || !transform.afterPath)
    throw new Error("Transform output is unavailable");
  return resolveDuplicateOutput(args.id, transform.fileId.toString(), {
    hash: transform.afterHash,
    path: transform.afterPath,
  });
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

let isMergingDuplicate = false;
let isDuplicateMergeCancelled = false;

export const cancelFileTransformDuplicateMerge = makeAction(async () => {
  isDuplicateMergeCancelled = true;
});

const completeDuplicateMerges = async (ids: string[]) => {
  const updates = { errorMsg: null, regenerationPending: false };
  await models.FileTransformModel.updateMany({ _id: { $in: objectIds(ids) } }, updates);
  for (const id of ids) socket.emit("onFileTransformUpdated", { id, updates });
};

const mergeDuplicateTransform = async (args: { id: string }) => {
  const transform = await models.FileTransformModel.findById(args.id).lean();
  if (transform?.status === "MERGED") {
    if (!transform.regenerationPending) return;
    const files = await models.FileModel.find({
      _id: { $in: [transform.fileId, transform.duplicateFileId] },
    }).lean();
    await actions.queueFileTagAncestorRegen(files.map((file) => file._id.toString()));
    await actions.queueTagMetadataRegen(files.flatMap((file) => file.tagIds.map(String)));
    const collections = await actions.regenCollAttrs({
      fileIds: files.map((file) => file._id.toString()),
    });
    if (!collections.success) throw new Error(collections.error);
    if (!deferRegeneration(completeDuplicateMerges, [args.id], "complete"))
      await completeDuplicateMerges([args.id]);
    return;
  }
  if (!transform || transform.type === "splice" || transform.status !== "DUPLICATE")
    throw new Error("Only duplicate media transforms can be merged");
  const inspection = await inspectFileTransformDuplicate(args);
  if (!inspection.success) throw new Error(inspection.error);
  if (!inspection.data) throw new Error("No matching file was found");
  if (inspection.data.errorMsg.includes("Status tag updates failed:"))
    throw new Error(inspection.data.errorMsg);
  const original = await models.FileModel.findById(transform.fileId).lean();
  const match = await models.FileModel.findById(inspection.data.duplicateFileId).lean();
  if (!original || !match || original._id.equals(match._id))
    throw new Error("Two different files are required");
  if (match.isArchived)
    throw new Error("The matched file is archived; unarchive it before merging");
  if (original.hash !== transform.beforeHash || original.path !== transform.beforePath)
    throw new Error("The original file has changed since this transform was created");
  if ((await md5File(original.path)) !== transform.beforeHash)
    throw new Error("The original file no longer matches its recorded MD5");
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
  fileTransformerStatus.setActiveFileId(null);
  const archived = await actions.setFileIsArchived({
    fileIds: [original._id.toString()],
    isArchived: true,
  });
  if (!archived.success) throw new Error(archived.error);
  await updateFileTransform(args.id, {
    errorMsg: null,
    regenerationPending: true,
    status: "MERGED",
  });
  if (!deferRegeneration(completeDuplicateMerges, [args.id], "complete"))
    await completeDuplicateMerges([args.id]);
};

export const mergeFileTransformDuplicate = makeAction(
  async (args: { id: string } | { ids: string[] }) => {
    if (isMergingDuplicate || fileTransformerStatus.getIsTransforming())
      throw new Error("Wait for the current media operation to finish before merging duplicates");
    const ids = "ids" in args ? args.ids : [args.id];
    if (ids.length > CONSTANTS.FILE.TRANSFORM.BATCH_SIZE)
      throw new Error(`Merge at most ${CONSTANTS.FILE.TRANSFORM.BATCH_SIZE} duplicates per batch`);
    isMergingDuplicate = true;
    isDuplicateMergeCancelled = false;
    try {
      return await withRegenerationBatch(async () => {
        let completed = 0;
        const failures: string[] = [];
        for (const id of ids) {
          if (isDuplicateMergeCancelled) break;
          try {
            await mergeDuplicateTransform({ id });
            completed++;
          } catch (error) {
            if ("id" in args) throw error;
            failures.push(`${id}: ${error.message}`);
          }
          if ((completed + failures.length) % 25 === 0) {
            socket.emit("onDuplicateMergeProgress", {
              batchId: ids[0],
              completed,
              failed: failures.length,
              isRegenerating: false,
            });
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }
        socket.emit("onDuplicateMergeProgress", {
          batchId: ids[0],
          completed,
          failed: failures.length,
          isRegenerating: true,
        });
        return { completed, failures };
      });
    } finally {
      isMergingDuplicate = false;
      socket.emit("onReloadFileTransforms");
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

export const resumeFileTransformer = makeAction(async () => {
  fileTransformerStatus.setIsPaused(false);
});

export const setFileTransformerAuto = makeAction(async (args: { isAuto: boolean }) => {
  fileTransformerStatus.setIsAuto(args.isAuto);
});

export const replaceFileTransformOutput = makeAction(async (args: { id: string }) => {
  const transform = await models.FileTransformModel.findById(args.id).lean();
  if (!transform?.afterPath || !transform.afterHash) throw new Error("Transform output not found");

  const file = await models.FileModel.findById(transform.fileId).lean();
  if (!file) throw new Error(`File not found: ${transform.fileId}`);

  const info = await getMediaInfo(transform.afterPath);
  let duplicate = await models.FileModel.findOne({
    _id: { $ne: file._id },
    hash: transform.afterHash,
  }).lean();
  if (duplicate)
    return recordDuplicateTransform(
      args.id,
      info,
      { hash: transform.afterHash, path: transform.afterPath },
      duplicate,
    );
  const updates = {
    ...makeAfterAttrs(info, transform.afterPath, transform.afterHash),
    status: "REPLACED" as const,
  };

  const dbRes = await actions.updateFile({
    args: {
      id: transform.fileId.toString(),
      updates: {
        audioBitrate: info.audioBitrate,
        audioCodec: info.audioCodec,
        bitrate: info.bitrate,
        duration: info.duration,
        ext: info.ext,
        frameRate: info.frameRate,
        hash: transform.afterHash,
        ...(transform.type === "reencode"
          ? { hasTranscript: false, transcription: null, waveformPeaks: null }
          : {}),
        height: info.height,
        path: transform.afterPath,
        size: info.size,
        videoCodec: info.videoCodec,
        width: info.width,
      },
    },
  });
  if (!dbRes.success) {
    if (dbRes.error?.includes("E11000")) {
      duplicate = await models.FileModel.findOne({
        _id: { $ne: file._id },
        hash: transform.afterHash,
      }).lean();
      if (duplicate)
        return recordDuplicateTransform(
          args.id,
          info,
          { hash: transform.afterHash, path: transform.afterPath },
          duplicate,
        );
    }
    throw new Error(dbRes.error);
  }

  const refreshRes = await actions.refreshFileInfo({
    fileId: dbRes.data.id,
    withTranscription: false,
    withWaveform: true,
  });
  if (!refreshRes.success) throw new Error(refreshRes.error);

  await actions.queueTagMetadataRegen(file.tagIds.map(String));
  const collectionRes = await actions.regenCollAttrs({ fileIds: [file._id.toString()] });
  if (!collectionRes.success) throw new Error(collectionRes.error);

  const diskRes = await deleteFile(file.path, transform.afterPath);
  if (!diskRes.success) throw new Error(diskRes.error);

  await updateFileTransform(args.id, updates);
  return updates;
});

const executeFileTransform = async (args: { id: string }, signal: AbortSignal) => {
  fileTransformerStatus.setActiveTransformId(args.id);
  let output: { hash: string; path: string } = null;
  let withNextTransform = true;
  const transform = await models.FileTransformModel.findById(args.id).lean();

  try {
    if (!transform) throw new Error(`File transform not found: ${args.id}`);
    if (transform.isCompleted) throw new Error(`File transform is completed: ${args.id}`);

    const file = await models.FileModel.findById(transform.fileId).lean();
    fileTransformerStatus.setActiveFileId(transform.fileId.toString());
    if (!file || file.isArchived) {
      fileTransformerStatus.setActiveFileId(null);
      fileTransformerStatus.setActiveTransformId(null);
      await deleteFileTransforms({ ids: [args.id] });
      socket.emit("onReloadFileTransforms");
      return true;
    }

    const startedAt = transform.startedAt ?? dayjs().toISOString();
    await updateFileTransform(args.id, { errorMsg: null, startedAt, status: "RUNNING" });
    socket.emit("onFileTransformLoaded", {
      file: leanModelToJson<models.FileSchema>(file),
      transform: {
        ...leanModelToJson<models.FileTransformSchema>(transform),
        errorMsg: null,
        startedAt,
        status: "RUNNING",
      },
    });

    const storageRes = await getAvailableFileStorage(transform.beforeSize);
    if (!storageRes.success) throw new Error(storageRes.error);

    const options = {
      onProgress: (progress) =>
        updateFileTransform(args.id, {
          progressPercent: Number.isFinite(progress.percent)
            ? Math.min(100, Math.max(0, progress.percent))
            : 0,
          progressSize: Number.isFinite(progress.size) ? progress.size : 0,
          progressTime: progress.time,
        }),
      signal,
    };

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

    await updateFileTransform(args.id, { afterHash: output.hash, afterPath: output.path });
    const info = await getMediaInfo(output.path);
    if (transform.type !== "splice") {
      const duplicate = await models.FileModel.findOne({
        _id: { $ne: file._id },
        hash: output.hash,
      }).lean();
      if (duplicate) {
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

    if (status === "SKIPPED" && !(await models.FileModel.exists({ hash: output.hash })))
      await deleteFile(output.path);

    await updateFileTransform(args.id, {
      ...makeAfterAttrs(
        info,
        status === "SKIPPED" ? null : output.path,
        status === "SKIPPED" ? null : output.hash,
      ),
      completedAt: dayjs().toISOString(),
      isCompleted: true,
      progressPercent: 100,
      status,
    });
    if (fileTransformerStatus.getIsAuto() && status !== "SKIPPED" && transform.type !== "splice") {
      const replaceRes = await replaceFileTransformOutput({ id: args.id });
      if (!replaceRes.success) throw new Error(replaceRes.error);
      if (replaceRes.data.status === "DUPLICATE") await autoMergeDuplicateTransform(args.id);
    }
  } catch (err) {
    if (signal.aborted) {
      withNextTransform = false;
      await updateFileTransform(args.id, {
        errorMsg: null,
        progressPercent: null,
        progressSize: null,
        progressTime: null,
        startedAt: null,
        status: "PENDING",
      });
    } else {
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
    }
  }
  return withNextTransform;
};

const startFileTransform = (args: { id: string }) => {
  if (isMergingDuplicate) return false;
  const signal = fileTransformerStatus.tryRun();
  if (!signal) return false;
  let execution: Promise<void>;
  execution = (async () => {
    let nextId = args.id;
    try {
      while (!signal.aborted) {
        const pending = await models.FileTransformModel.find({
          regenerationPending: true,
          status: "MERGED",
        })
          .select({ _id: 1 })
          .limit(CONSTANTS.FILE.TRANSFORM.BATCH_SIZE)
          .lean();
        if (!pending.length) break;
        await withRegenerationBatch(async () => {
          for (const transform of pending)
            await mergeDuplicateTransform({ id: transform._id.toString() });
        });
      }
      while (nextId && !signal.aborted && !fileTransformerStatus.getIsPaused()) {
        await withRegenerationBatch(async () => {
          const startedAt = Date.now();
          for (let count = 0; nextId && count < CONSTANTS.FILE.TRANSFORM.BATCH_SIZE; count++) {
            if (signal.aborted || fileTransformerStatus.getIsPaused()) break;
            const withNextTransform = await executeFileTransform({ id: nextId }, signal);
            nextId = null;
            if (
              !fileTransformerStatus.getIsAuto() ||
              !withNextTransform ||
              fileTransformerStatus.getIsPaused()
            )
              break;
            nextId = (await getQueueTransform("PENDING"))?.id;
            if (Date.now() - startedAt >= CONSTANTS.FILE.TRANSFORM.REGEN_INTERVAL_MS) break;
          }
        });
        socket.emit("onReloadFileTransforms");
        if (!fileTransformerStatus.getIsAuto()) nextId = null;
      }
    } finally {
      fileTransformerStatus.setIsTransforming(false);
    }
  })()
    .catch(async (err) => {
      console.error(`Failed to execute file transform ${args.id}:`, err);
      fileTransformerStatus.setIsTransforming(false);
      await actions.recordNotification({
        message: `Media processing stopped: ${err.message}. Unfinished duplicate merges can be retried with Merge Duplicates.`,
        type: "error",
      });
    })
    .finally(() => {
      if (activeTransformExecution === execution) activeTransformExecution = null;
    });
  activeTransformExecution = execution;
  return true;
};

export const runFileTransform = makeAction(async (args: { id: string; isAuto?: boolean }) => {
  if (typeof args.isAuto === "boolean") fileTransformerStatus.setIsAuto(args.isAuto);

  if (activeTransformExecution) {
    fileTransformerStatus.setIsPaused(true);
    await activeTransformExecution;
  }

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
  if (typeof args.isAuto === "boolean") fileTransformerStatus.setIsAuto(args.isAuto);
  await resetStaleRunningTransforms();
  const transform = await getQueueTransform("PENDING");
  return { started: transform ? startFileTransform({ id: transform.id }) : false };
});

export const saveFileTransformCopy = makeAction(async (args: { id: string }) => {
  const transform = await models.FileTransformModel.findById(args.id).lean();
  if (!transform?.afterPath) throw new Error("Transform output not found");

  const file = await models.FileModel.findById(transform.fileId).lean();
  if (!file) throw new Error(`File not found: ${transform.fileId}`);

  const info = await getMediaInfo(transform.afterPath);
  const spliceConfig = getConfig().file.splice.onComplete;
  const tagIds = [
    ...file.tagIds.filter((id) => !spliceConfig.removeTagIds.includes(id.toString())),
    ...spliceConfig.addTagIds,
  ];

  const importer = new FileImporter({
    deleteOnImport: false,
    ext: info.ext,
    ignorePrevDeleted: false,
    originalName: file.originalName,
    originalPath: transform.afterPath,
    size: info.size,
    tagIds,
  });

  const importRes = await importer.import();
  if (!importRes.success) throw new Error(importRes.error);
  await updateFileTransform(args.id, { status: "SAVED" });
  return importRes.file;
});
