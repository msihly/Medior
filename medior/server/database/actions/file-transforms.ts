import * as models from "medior/_generated/server/models";
import { ModelCreationData } from "mobx-keystone";
import { deleteFile } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import * as Types from "medior/server/database/types";
import { FileImporter } from "medior/store/imports/importer";
import { dayjs } from "medior/utils/common";
import { leanModelToJson, makeAction, objectIds, socket } from "medior/utils/server";
import { getAvailableFileStorage, getConfig } from "medior/utils/server/config";
import { getMediaInfo, MediaInfo, reencode, remux, spliceVideo } from "medior/utils/server/videos";

class FileTransformerStatus {
  private abortController: AbortController = null;
  private activeFileId: string = null;
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

  abortByFileIds(fileIds: string[]) {
    if (this.activeFileId && fileIds.includes(this.activeFileId)) this.abortController?.abort();
  }

  setIsPaused(isPaused: boolean) {
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
    }
    socket.emit("onFileTransformerStatusUpdated");
  }

  tryRun() {
    if (this.isTransforming) return null;
    this.abortController = new AbortController();
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
  socket.emit("onFileTransformUpdated", { id, updates });
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
      .sort({ dateCreated: 1, _id: 1 })
      .lean(),
  );

export const getNextFileTransform = makeAction(async () => {
  await resetStaleRunningTransforms();
  return (await getQueueTransform("RUNNING")) ?? (await getQueueTransform("PENDING"));
});

export const createFileTransforms = makeAction(
  async (args: {
    fileIds: string[];
    timestampPairs?: Array<{ end: number; start: number }>;
    type: Types.FileTransformType;
  }) => {
    if (!args.fileIds.length) throw new Error("No files selected");
    if (args.type === "splice" && args.fileIds.length !== 1)
      throw new Error("Splice transforms must contain exactly one file");

    const config = getConfig().file.reencode;
    const files = await models.FileModel.find({
      _id: { $in: objectIds(args.fileIds) },
      isArchived: false,
    }).lean();
    const fileMap = new Map(files.map((file) => [file._id.toString(), file]));
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
    const transforms: ModelCreationData<models.FileTransformSchema>[] = args.fileIds
      .filter((id) => !existingFileIdSet.has(id))
      .map((id) => {
        const file = fileMap.get(id);
        return {
          ...makeBeforeAttrs(file),
          configCodec: config.codec,
          configImageExt: config.imageExt,
          configImageMaxHeight: config.imageMaxHeight,
          configImageMaxWidth: config.imageMaxWidth,
          configMaxBitrate: config.maxBitrate,
          configMaxFps: config.maxFps,
          configMaxHeight: config.maxHeight,
          configMaxWidth: config.maxWidth,
          configOverride: config.override,
          dateCreated,
          fileId: id,
          isCompleted: false,
          status: "PENDING",
          timestampPairs: args.timestampPairs ?? [],
          type: args.type,
        };
      });

    const res = transforms.length ? await models.FileTransformModel.insertMany(transforms) : [];
    if (res.length !== transforms.length) throw new Error("Failed to create file transforms");
    socket.emit("onReloadFileTransforms");
    const transformIds = [...existingTransforms, ...res].map((transform) =>
      transform._id.toString(),
    );
    return { count: transformIds.length, ids: transformIds };
  },
);

export const deleteFileTransforms = makeAction(async (args: { ids: string[] }) => {
  const transforms = await models.FileTransformModel.find({ _id: { $in: args.ids } })
    .select("fileId")
    .lean();
  fileTransformerStatus.abortByFileIds(transforms.map((transform) => transform.fileId.toString()));
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
        afterSize: { $sum: { $ifNull: ["$afterSize", "$beforeSize"] } },
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
        height: info.height,
        path: transform.afterPath,
        size: info.size,
        videoCodec: info.videoCodec,
        width: info.width,
      },
    },
  });
  if (!dbRes.success) throw new Error(dbRes.error);

  const importer = new FileImporter({
    deleteOnImport: false,
    ext: info.ext,
    ignorePrevDeleted: false,
    originalName: file.originalName,
    originalPath: transform.afterPath,
    size: info.size,
    tagIds: file.tagIds,
  });
  const refreshRes = await importer.refresh(dbRes.data);
  if (!refreshRes.success) throw new Error(refreshRes.error);

  const diskRes = await deleteFile(file.path, transform.afterPath);
  if (!diskRes.success) throw new Error(diskRes.error);

  await updateFileTransform(args.id, updates);
  return updates;
});

const executeFileTransform = async (args: { id: string }, signal: AbortSignal) => {
  let withNextTransform = true;
  const transform = (await models.FileTransformModel.findById(
    args.id,
  ).lean()) as models.FileTransformSchema;

  try {
    if (!transform) throw new Error(`File transform not found: ${args.id}`);
    if (transform.isCompleted) throw new Error(`File transform is completed: ${args.id}`);

    const file = await models.FileModel.findById(transform.fileId).lean();
    fileTransformerStatus.setActiveFileId(transform.fileId.toString());
    if (!file || file.isArchived) {
      await deleteFileTransforms({ ids: [args.id] });
      socket.emit("onReloadFileTransforms");
      return;
    }

    const startedAt = transform.startedAt ?? dayjs().toISOString();
    fileTransformerStatus.setIsPaused(false);
    await updateFileTransform(args.id, { errorMsg: null, startedAt, status: "RUNNING" });
    socket.emit("onFileTransformLoaded", { id: args.id });

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

    const res =
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

    const info = await getMediaInfo(res.path);
    const status =
      transform.type === "reencode"
        ? info.size < transform.beforeSize
          ? ("COMPRESSED" as const)
          : ("SKIPPED" as const)
        : ("COMPLETE" as const);

    if (status === "SKIPPED") await deleteFile(res.path);

    await updateFileTransform(args.id, {
      ...makeAfterAttrs(
        info,
        status === "SKIPPED" ? null : res.path,
        status === "SKIPPED" ? null : res.hash,
      ),
      completedAt: dayjs().toISOString(),
      isCompleted: true,
      progressPercent: 100,
      status,
    });
    if (fileTransformerStatus.getIsAuto() && status !== "SKIPPED" && transform.type !== "splice") {
      const replaceRes = await replaceFileTransformOutput({ id: args.id });
      if (!replaceRes.success) throw new Error(replaceRes.error);
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
      withNextTransform = !err.message.includes("No available file storage location found");
      await updateFileTransform(args.id, {
        completedAt: dayjs().toISOString(),
        errorMsg: err.message,
        isCompleted: true,
        status: "ERROR",
      });
    }
  } finally {
    fileTransformerStatus.setIsTransforming(false);

    if (
      fileTransformerStatus.getIsAuto() &&
      withNextTransform &&
      !fileTransformerStatus.getIsPaused()
    ) {
      const nextTransform = await getQueueTransform("PENDING");
      if (nextTransform) startFileTransform({ id: nextTransform.id });
    }
  }
};

const startFileTransform = (args: { id: string }) => {
  const signal = fileTransformerStatus.tryRun();
  if (!signal) return false;
  let execution: Promise<void>;
  execution = executeFileTransform(args, signal)
    .catch((err) => {
      console.error(`Failed to execute file transform ${args.id}:`, err);
      fileTransformerStatus.setIsTransforming(false);
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
