import { createReadStream } from "fs";
import fs from "fs/promises";
import nodePath from "path";
import { createHash, randomUUID } from "crypto";
import {
  FileModel,
  FileSchema,
  FileTransformModel,
  TagModel,
} from "medior/_generated/server/models";
import { Schema } from "mongoose";
import { addAbortSignal } from "stream";
import { deleteFile, removeEmptyFolders } from "trabecula/utils/server";
import { backgroundExecutionPlugin } from "medior/server/database/database-context";
import type { MediaImportInput } from "medior/server/database/media-import";
import {
  getMediaIndexVersion,
  mediaPathKey,
  mediaPathPlugin,
} from "medior/server/database/media-paths";
import { registerPersistenceModel } from "medior/server/database/persistence";
import { isServerStopping, serverShutdownSignal } from "medior/server/process-lifecycle";
import { Fmt } from "medior/utils/common";
import { workSignal } from "medior/utils/server/work-signal";

export interface FileCleanup {
  hash: string;
  path: string;
  pathKey: string;
  retainedHash?: string;
  retainedPath?: string;
}

class FileCleanupPausedError extends Error {
  constructor() {
    super("File cleanup paused; remaining work retained.");
    this.name = "FileCleanupPausedError";
  }
}

const checkCleanupCancelled = (canContinue: () => boolean) => {
  workSignal.getStore()?.throwIfAborted();

  if (isServerStopping() || !canContinue()) throw new FileCleanupPausedError();
};

const hashCleanupFile = async (path: string, canContinue: () => boolean = () => true) => {
  checkCleanupCancelled(canContinue);

  const hash = createHash("md5");
  const stream = createReadStream(path);

  if (workSignal.getStore()) addAbortSignal(workSignal.getStore(), stream);

  for await (const chunk of stream) {
    checkCleanupCancelled(canContinue);
    hash.update(chunk);
  }

  checkCleanupCancelled(canContinue);

  return hash.digest("hex");
};

export interface FileOperation {
  _id: string;
  batchId?: string;
  cleanup: FileCleanup[];
  emptyFolderPath?: string;
  error?: string;
  fileId?: string;
  importInput?: MediaImportInput;
  importResult?: {
    audio?: Partial<FileSchema>;
    cleanup: FileCleanup[];
    ignored: boolean;
    info?: Omit<FileSchema, "id">;
    unusedOutput: FileCleanup[];
  };
  kind?: "import" | "thumbnail" | "transform";
  outputHash?: string;
  outputMetadata?: Partial<FileSchema>;
  outputPath?: string;
  sourceHash?: string;
  sourceModified?: string;
  sourcePath?: string;
  state: "COMMITTED" | "PREPARED";
  tempPath?: string;
  thumbnailInput?: {
    legacyPaths: string[];
    refresh: boolean;
    withTranscription?: boolean;
    withWaveform?: boolean;
  };
  thumbPath?: string;
}

const schema = new Schema<FileOperation>({
  _id: { type: String, default: () => randomUUID() },
  batchId: { index: true, type: String },
  cleanup: [
    { hash: String, path: String, pathKey: String, retainedHash: String, retainedPath: String },
  ],
  emptyFolderPath: String,
  error: String,
  fileId: String,
  importInput: Schema.Types.Mixed,
  importResult: Schema.Types.Mixed,
  kind: { enum: ["import", "thumbnail", "transform"], type: String },
  outputHash: String,
  outputMetadata: Schema.Types.Mixed,
  outputPath: String,
  sourceHash: String,
  sourceModified: String,
  sourcePath: String,
  thumbnailInput: Schema.Types.Mixed,
  state: { type: String, enum: ["COMMITTED", "PREPARED"], required: true },
  tempPath: String,
  thumbPath: String,
});

export const MediaOwnershipModel = registerPersistenceModel(
  "MediaOwnership",
  new Schema({
    _id: String,
    complete: Boolean,
    indexVersion: String,
    lastId: Schema.Types.Mixed,
    processedCount: Number,
    revision: Number,
  }),
);

let readyIndexVersion: string;

export const areMediaPathIndexesReady = async () => {
  const version = getMediaIndexVersion();

  if (readyIndexVersion === version) return true;

  if (!(await MediaOwnershipModel.exists({ _id: version, complete: true }))) return false;

  readyIndexVersion = version;

  return true;
};

export const assertMediaPathIndexesReady = async () => {
  if (!(await areMediaPathIndexesReady()))
    throw new Error(
      "Media path indexing is incomplete and runs automatically. If its Activity entry is cancelled or failed, click Retry. Browsing remains available.",
    );
};

schema.plugin(backgroundExecutionPlugin);
schema.plugin(mediaPathPlugin, { modelName: "FileOperation" });
schema.index({ fileId: 1 }, { partialFilterExpression: { kind: "thumbnail" }, unique: true });
schema.index({ state: 1, "cleanup.pathKey": 1 });
schema.index({ state: 1, tempPath: 1 });

export const FileOperationModel = registerPersistenceModel<FileOperation>("FileOperation", schema);

export const mediaPathPattern = (filePath: string) =>
  new RegExp(
    `^${nodePath
      .resolve(filePath)
      .split(/[\\/]/)
      .map((part) => Fmt.regexEscape(part))
      .join("[\\\\/]")}$`,
    "i",
  );

export const assertMediaPathsAvailable = async (paths: string[], transformId?: string) => {
  const keys = [...new Set(paths.filter(Boolean).map(mediaPathKey))];

  if (!keys.length) return;

  await assertMediaPathIndexesReady();

  const [fileOperation, transform] = await Promise.all([
    FileOperationModel.exists({
      $or: [{ "cleanup.pathKey": { $in: keys } }, { tempPathKey: { $in: keys, $type: "string" } }],
      state: "COMMITTED",
    }),
    FileTransformModel.exists({
      ...(transformId ? { _id: { $ne: transformId } } : {}),
      $or: [
        {
          afterPathKey: { $in: keys, $type: "string" },
          cleanupPending: true,
          status: { $ne: "REPLACED" },
        },
        {
          beforePathKey: { $in: keys, $type: "string" },
          cleanupPending: true,
          status: { $ne: "SKIPPED" },
        },
        { outputTempPathKey: { $in: keys, $type: "string" } },
      ],
    }),
  ]);

  if (fileOperation)
    throw new Error("Media cleanup owns this path. Complete recovery in Activity before retrying.");

  if (transform)
    throw new Error(
      "Transform cleanup owns this path. Complete recovery in Activity before retrying.",
    );
};

export const describeFileCleanup = async (path: string, retainedPath?: string) => {
  if (
    !path ||
    (retainedPath &&
      nodePath.resolve(path).toLowerCase() === nodePath.resolve(retainedPath).toLowerCase())
  )
    return null;

  let hash: string;

  try {
    hash = await hashCleanupFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;

    throw error;
  }

  return {
    hash,
    path,
    pathKey: nodePath.resolve(path).toLowerCase(),
    ...(retainedPath ? { retainedHash: await hashCleanupFile(retainedPath), retainedPath } : {}),
  } satisfies FileCleanup;
};

export const isMediaPathReferenced = async (
  filePath: string,
  exclude: { fileOperationId?: string; transformId?: string } = {},
) => {
  await assertMediaPathIndexesReady();

  const key = mediaPathKey(filePath);

  return !!(
    (await FileModel.exists({
      $or: ["pathKey", "thumbPathKey"].map((field) => ({
        [field]: { $eq: key, $type: "string" },
      })),
    })) ||
    (await FileTransformModel.exists({
      ...(exclude.transformId ? { _id: { $ne: exclude.transformId } } : {}),
      $or: ["afterPathKey", "outputTempPathKey"].map((field) => ({
        [field]: { $eq: key, $type: "string" },
      })),
    })) ||
    (await FileOperationModel.exists({
      ...(exclude.fileOperationId ? { _id: { $ne: exclude.fileOperationId } } : {}),
      $or: ["outputPathKey", "tempPathKey", "thumbPathKey"].map((field) => ({
        [field]: { $eq: key, $type: "string" },
      })),
      state: "PREPARED",
    }))
  );
};

const activeCleanups = new Map<string, Promise<void>>();
const cleanupControllers = new Set<AbortController>();
let cleanupRevision = 0;

export const pauseFileCleanups = () => {
  cleanupRevision++;

  for (const controller of cleanupControllers) controller.abort(new FileCleanupPausedError());

  return Promise.all(activeCleanups.values());
};

export const finishFileOperation = (id: string, canContinue: () => boolean = () => true) => {
  if (activeCleanups.has(id)) return activeCleanups.get(id);

  const revision = cleanupRevision;
  const controller = new AbortController();
  const parentSignal = workSignal.getStore();

  const abort = () => controller.abort(new FileCleanupPausedError());

  cleanupControllers.add(controller);
  parentSignal?.addEventListener("abort", abort, { once: true });
  serverShutdownSignal.addEventListener("abort", abort, { once: true });

  if (parentSignal?.aborted || serverShutdownSignal.aborted) abort();

  const execution = workSignal
    .run(controller.signal, () =>
      cleanFileOperation(id, () => revision === cleanupRevision && canContinue()),
    )
    .finally(() => {
      activeCleanups.delete(id);
      cleanupControllers.delete(controller);
      parentSignal?.removeEventListener("abort", abort);
      serverShutdownSignal.removeEventListener("abort", abort);
    });

  activeCleanups.set(id, execution);

  return execution;
};

const cleanFileOperation = async (id: string, canContinue: () => boolean) => {
  try {
    checkCleanupCancelled(canContinue);

    const operation = await FileOperationModel.findById(id).lean();

    if (operation?.state !== "COMMITTED") return;

    for (const file of operation.cleanup) {
      checkCleanupCancelled(canContinue);

      if (await isMediaPathReferenced(file.path, { fileOperationId: id })) continue;

      // Derived tag thumbnails may still reference the old file until their queued refresh commits.
      if (
        await TagModel.exists({
          thumbPathKey: { $eq: mediaPathKey(file.path), $type: "string" },
        }).hint({ thumbPathKey: 1 })
      )
        continue;

      const hash = await hashCleanupFile(file.path, canContinue).catch((error) => {
        if (error.code === "ENOENT") return null;

        throw error;
      });

      if (hash !== null) {
        if (hash !== file.hash) throw new Error(`Cleanup checksum changed: ${file.path}`);

        if (
          file.retainedPath &&
          (await hashCleanupFile(file.retainedPath, canContinue)) !== file.retainedHash
        )
          throw new Error("Retained file checksum changed; cleanup deferred");

        checkCleanupCancelled(canContinue);

        const removed = await deleteFile(file.path, file.retainedPath);

        if (!removed.success) throw new Error(removed.error);
      }

      await FileOperationModel.updateOne(
        { _id: id, state: "COMMITTED" },
        { $pull: { cleanup: file } },
      );
    }

    checkCleanupCancelled(canContinue);

    if (await FileOperationModel.exists({ _id: id, "cleanup.0": { $exists: true } })) return;

    if (
      operation.tempPath &&
      (await fs.stat(operation.tempPath).catch((error) => {
        if (error.code === "ENOENT") return null;

        throw error;
      })) &&
      !(await isMediaPathReferenced(operation.tempPath, { fileOperationId: id }))
    ) {
      checkCleanupCancelled(canContinue);
      await fs.rm(operation.tempPath, { force: true });
    }

    checkCleanupCancelled(canContinue);

    if (operation.emptyFolderPath)
      await removeEmptyFolders(operation.emptyFolderPath, { hardDelete: true });

    await FileOperationModel.deleteOne({ _id: id, state: "COMMITTED" });
  } catch (error) {
    if (
      error?.name === "FileCleanupPausedError" ||
      workSignal.getStore()?.aborted ||
      !canContinue() ||
      isServerStopping()
    )
      return;

    await FileOperationModel.updateOne({ _id: id }, { error: error.message });

    throw error;
  }
};

export const recoverFileOperations = async (canContinue: () => boolean) => {
  for await (const operation of FileOperationModel.find({ state: "COMMITTED" })
    .select({ _id: 1 })
    .hint({ recordType: 1, state: 1, "cleanup.pathKey": 1 })
    .lean()
    .cursor()) {
    if (!canContinue()) return;

    try {
      await finishFileOperation(operation._id, canContinue);
    } catch (error) {
      if (workSignal.getStore()?.aborted || !canContinue() || isServerStopping()) return;

      console.error("File cleanup retained for retry:", error);
    }
  }
};
