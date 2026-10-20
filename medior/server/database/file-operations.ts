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
import { isServerStopping, serverShutdownSignal } from "trabecula/utils/process";
import { deleteFile, extendFileName, removeEmptyFolders } from "trabecula/utils/server";
import { backgroundExecutionPlugin } from "medior/server/database/database-context";
import { withIndexHint } from "medior/server/database/index-hints";
import type { MediaImportInput } from "medior/server/database/media-import";
import {
  getMediaIndexVersion,
  mediaPathKey,
  mediaPathPlugin,
} from "medior/server/database/media-paths";
import { registerPersistenceModel } from "medior/server/database/persistence";
import { Fmt } from "medior/utils/common";
import { isWithinFolder } from "medior/utils/server/source-folders";
import { workSignal } from "medior/utils/server/work-signal";

export interface FileCleanup {
  hash: string;
  path: string;
  pathKey: string;
  retainedHash?: string;
  retainedPath?: string;
  /** The recorded size, which confirms the file without reading it in full. */
  size?: number;
}

export const makeFileCleanup = (hash: string, path: string, size?: number): FileCleanup => ({
  hash,
  path,
  pathKey: mediaPathKey(path),
  ...(typeof size === "number" ? { size } : {}),
});

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

/**
 * Confirms a file is the one recorded before it's removed. A file whose recorded size still
 * matches is taken as unchanged; others, including any whose size differs, are checksummed in full.
 */
const isCleanupFileUnchanged = async (file: FileCleanup, canContinue: () => boolean) =>
  (typeof file.size === "number" && (await fs.stat(file.path)).size === file.size) ||
  (!!file.hash && (await hashCleanupFile(file.path, canContinue)) === file.hash);

export interface FileOperation {
  _id: string;
  batchId?: string;
  cleanup: FileCleanup[];
  /** Imported in place of the source, such as the source remuxed with its subtitles. */
  contentPath?: string;
  emptyFolderPath?: string;
  error?: string;
  fileId?: string;
  importInput?: MediaImportInput;
  importResult?: {
    audio?: Partial<FileSchema>;
    cleanup: FileCleanup[];
    ignored: boolean;
    info?: Omit<FileSchema, "id">;
    subtitles?: FileSchema["subtitles"];
    unusedOutput: FileCleanup[];
  };
  kind?: "import" | "thumbnail" | "transform";
  outputHash?: string;
  outputMetadata?: Partial<FileSchema>;
  outputPath?: string;
  sourceHash?: string;
  sourceModified?: string;
  sourcePath?: string;
  /** Import root whose folders emptied by this operation's deleted sources are removed. */
  sourceRootPath?: string;
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
  _id: { default: () => randomUUID(), type: String },
  batchId: { index: true, type: String },
  cleanup: [
    {
      hash: String,
      path: String,
      pathKey: String,
      retainedHash: String,
      retainedPath: String,
      size: Number,
    },
  ],
  contentPath: String,
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
  sourceRootPath: String,
  state: { enum: ["COMMITTED", "PREPARED"], required: true, type: String },
  tempPath: String,
  thumbnailInput: Schema.Types.Mixed,
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

/** Committed cleanups own the paths they will delete or still write. */
const makeCleanupOwnerFilter = (keys: string[]) => ({
  $or: [{ "cleanup.pathKey": { $in: keys } }, { tempPathKey: { $in: keys, $type: "string" } }],
  state: "COMMITTED",
});

/** Transforms own their unfinished output and the files their pending cleanup will delete. */
const makeTransformOwnerFilter = (keys: string[], transformId?: string) => ({
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
});

export const assertMediaPathsAvailable = async (paths: string[], transformId?: string) => {
  const keys = [...new Set(paths.filter(Boolean).map(mediaPathKey))];

  if (!keys.length) return;

  await assertMediaPathIndexesReady();

  const [fileOperation, transform] = await Promise.all([
    FileOperationModel.exists(makeCleanupOwnerFilter(keys)),
    FileTransformModel.exists(makeTransformOwnerFilter(keys, transformId)),
  ]);

  if (fileOperation)
    throw new Error("Media cleanup owns this path. Complete recovery in Activity before retrying.");

  if (transform)
    throw new Error(
      "Transform cleanup owns this path. Complete recovery in Activity before retrying.",
    );
};

/** Lists the keys of paths that `assertMediaPathsAvailable` rejects, by the kind of owner. */
export const listOwnedMediaPathKeys = async (paths: string[]) => {
  const keys = [...new Set(paths.filter(Boolean).map(mediaPathKey))];

  await assertMediaPathIndexesReady();

  const [operations, transforms] = await Promise.all([
    FileOperationModel.find(makeCleanupOwnerFilter(keys))
      .select({ "cleanup.pathKey": 1, tempPath: 1 })
      .lean(),
    FileTransformModel.find(makeTransformOwnerFilter(keys))
      .select({ afterPath: 1, beforePath: 1, outputTempPath: 1 })
      .lean(),
  ]);

  const keySet = new Set(keys);

  const getOwnedKeys = (ownedPaths: string[]) =>
    new Set(
      ownedPaths
        .filter(Boolean)
        .map(mediaPathKey)
        .filter((key) => keySet.has(key)),
    );

  return {
    cleanupKeys: getOwnedKeys(
      operations.flatMap((operation) => [
        ...operation.cleanup.map((file) => file.pathKey),
        operation.tempPath,
      ]),
    ),
    transformKeys: getOwnedKeys(
      transforms.flatMap((transform) => [
        transform.afterPath,
        transform.beforePath,
        transform.outputTempPath,
      ]),
    ),
  };
};

export const describeFileCleanup = async (path: string, retainedPath?: string) => {
  if (!path || (retainedPath && mediaPathKey(path) === mediaPathKey(retainedPath))) return null;

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
    pathKey: mediaPathKey(path),
    ...(retainedPath ? { retainedHash: await hashCleanupFile(retainedPath), retainedPath } : {}),
  } satisfies FileCleanup;
};

/**
 * Describes a file that cleanup confirms by its size alone, which reads only its metadata. Missing
 * files need no cleanup.
 */
export const describeFileCleanupBySize = async (path: string) => {
  if (!path) return null;

  try {
    return makeFileCleanup(null, path, (await fs.stat(path)).size);
  } catch (error) {
    if (error.code === "ENOENT") return null;

    throw error;
  }
};

/** VobSub .sub images belong to the .idx a file records. */
const getSubtitlePathKeys = (path: string) => {
  const key = mediaPathKey(path);

  return nodePath.extname(path).toLowerCase() === ".sub"
    ? [key, mediaPathKey(extendFileName(path, "idx"))]
    : [key];
};

/**
 * The given paths still referenced by the library, a transform, another prepared operation, or a
 * tag thumbnail, checked together rather than one path at a time. Committed cleanups reserve their
 * paths, so nothing new can claim them while the cleanup runs.
 */
const listReferencedCleanupPaths = async (paths: string[], fileOperationId: string) => {
  await assertMediaPathIndexesReady();

  const subtitleKeysByPath = new Map(paths.map((path) => [path, getSubtitlePathKeys(path)]));
  const keys = [...new Set(paths.map(mediaPathKey))];
  const subtitleKeys = [...new Set([...subtitleKeysByPath.values()].flat())];
  const inKeys = { $in: keys, $type: "string" };

  const [files, transforms, operations, tags] = await Promise.all([
    FileModel.find({
      $or: [
        { pathKey: inKeys },
        { "subtitles.pathKey": { $in: subtitleKeys, $type: "string" } },
        { thumbPathKey: inKeys },
      ],
    })
      .select({ pathKey: 1, "subtitles.pathKey": 1, thumbPathKey: 1 })
      .lean<{ pathKey?: string; subtitles?: { pathKey?: string }[]; thumbPathKey?: string }[]>(),
    FileTransformModel.find({
      $or: [{ afterPathKey: inKeys }, { outputTempPathKey: inKeys }],
    })
      .select({ afterPathKey: 1, outputTempPathKey: 1 })
      .lean<{ afterPathKey?: string; outputTempPathKey?: string }[]>(),
    FileOperationModel.find({
      _id: { $ne: fileOperationId },
      $or: ["contentPathKey", "outputPathKey", "tempPathKey", "thumbPathKey"].map((field) => ({
        [field]: inKeys,
      })),
      state: "PREPARED",
    })
      .select({ contentPathKey: 1, outputPathKey: 1, tempPathKey: 1, thumbPathKey: 1 })
      .lean<Record<string, string>[]>(),
    withIndexHint(() =>
      TagModel.find({ thumbPathKey: inKeys })
        .select({ thumbPathKey: 1 })
        .hint({ thumbPathKey: 1 })
        .lean<{ thumbPathKey?: string }[]>()
        .exec(),
    ),
  ]);

  const subtitleReferences = new Set(
    files.flatMap((file) => (file.subtitles ?? []).map((subtitle) => subtitle.pathKey)),
  );
  const references = new Set([
    ...files.flatMap((file) => [file.pathKey, file.thumbPathKey]),
    ...transforms.flatMap((transform) => [transform.afterPathKey, transform.outputTempPathKey]),
    ...operations.flatMap((operation) => [
      operation.contentPathKey,
      operation.outputPathKey,
      operation.tempPathKey,
      operation.thumbPathKey,
    ]),
    ...tags.map((tag) => tag.thumbPathKey),
  ]);

  return new Set(
    paths.filter(
      (path) =>
        references.has(mediaPathKey(path)) ||
        subtitleKeysByPath.get(path).some((key) => subtitleReferences.has(key)),
    ),
  );
};

export const isMediaPathReferenced = async (
  filePath: string,
  exclude: { fileOperationId?: string; transformId?: string } = {},
) => {
  await assertMediaPathIndexesReady();

  const key = mediaPathKey(filePath);
  const subtitleKeys = getSubtitlePathKeys(filePath);

  return !!(
    (await FileModel.exists({
      $or: [
        { pathKey: { $eq: key, $type: "string" } },
        { "subtitles.pathKey": { $in: subtitleKeys, $type: "string" } },
        { thumbPathKey: { $eq: key, $type: "string" } },
      ],
    })) ||
    (await FileTransformModel.exists({
      ...(exclude.transformId ? { _id: { $ne: exclude.transformId } } : {}),
      $or: ["afterPathKey", "outputTempPathKey"].map((field) => ({
        [field]: { $eq: key, $type: "string" },
      })),
    })) ||
    (await FileOperationModel.exists({
      ...(exclude.fileOperationId ? { _id: { $ne: exclude.fileOperationId } } : {}),
      $or: ["contentPathKey", "outputPathKey", "tempPathKey", "thumbPathKey"].map((field) => ({
        [field]: { $eq: key, $type: "string" },
      })),
      state: "PREPARED",
    }))
  );
};

/** Removes folders emptied by deleted sources, walking up from each source to the import root. */
const removeEmptySourceFolders = async (filePaths: string[], rootPath: string) => {
  for (const filePath of filePaths) {
    for (
      let folderPath = nodePath.dirname(filePath);
      isWithinFolder(rootPath, folderPath);
      folderPath = nodePath.dirname(folderPath)
    ) {
      try {
        await fs.rmdir(folderPath);
      } catch (error) {
        // Folders that still hold files, or are locked, stop the walk and are left in place.
        if (error.code !== "ENOENT") break;
      }
    }
  }
};

/** WAITING means files still referenced by the library or a tag thumbnail keep the operation open. */
type FileCleanupResult = "DONE" | "PAUSED" | "WAITING";

/** Lists path keys that committed cleanups still intend to delete. Failed cleanups stop reserving them. */
export const listPendingCleanupPathKeys = async (pathKeys: string[]) => {
  const keys = new Set(pathKeys);
  const pendingKeys = new Set<string>();

  for await (const operation of FileOperationModel.find({
    "cleanup.pathKey": { $in: pathKeys },
    error: null,
    state: "COMMITTED",
  })
    .select({ "cleanup.pathKey": 1 })
    .lean()
    .cursor()) {
    for (const { pathKey } of operation.cleanup) {
      if (keys.has(pathKey)) pendingKeys.add(pathKey);
    }
  }

  return pendingKeys;
};

const activeCleanups = new Map<string, Promise<FileCleanupResult>>();
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

const cleanFileOperation = async (
  id: string,
  canContinue: () => boolean,
): Promise<FileCleanupResult> => {
  try {
    checkCleanupCancelled(canContinue);

    const operation = await FileOperationModel.findById(id).lean();

    if (operation?.state !== "COMMITTED") return "DONE";

    // A retried cleanup reserves its paths again until it succeeds or fails anew.
    if (operation.error) await FileOperationModel.updateOne({ _id: id }, { $unset: { error: 1 } });

    const cleanedPaths: string[] = [];

    try {
      // Derived tag thumbnails may still reference an old file until their queued refresh commits.
      const referencedPaths = await listReferencedCleanupPaths(
        operation.cleanup.map((file) => file.path),
        id,
      );

      for (const file of operation.cleanup) {
        checkCleanupCancelled(canContinue);

        if (referencedPaths.has(file.path)) continue;

        let isMissing = false;
        let isUnchanged = false;

        try {
          isUnchanged = await isCleanupFileUnchanged(file, canContinue);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;

          isMissing = true;
        }

        if (!isMissing) {
          if (!isUnchanged) throw new Error(`Cleanup checksum changed: ${file.path}`);

          // Imports verified their retained copy when publishing it, so they only record its path.
          if (
            file.retainedHash &&
            (await hashCleanupFile(file.retainedPath, canContinue)) !== file.retainedHash
          )
            throw new Error("Retained file checksum changed; cleanup deferred");

          checkCleanupCancelled(canContinue);

          const removed = await deleteFile(file.path, file.retainedPath);

          if (!removed.success) throw new Error(removed.error);
        }

        cleanedPaths.push(file.path);
      }
    } finally {
      // Every write waits for the journal, so finished files are recorded together rather than
      // one at a time, and not at all when the whole operation is removed next. A retry
      // interrupted before then finds their files already gone.
      if (cleanedPaths.length && cleanedPaths.length < operation.cleanup.length)
        await FileOperationModel.updateOne(
          { _id: id, state: "COMMITTED" },
          { $pull: { cleanup: { path: { $in: cleanedPaths } } } },
        );
    }

    checkCleanupCancelled(canContinue);

    // Files still referenced keep the operation open until they are released.
    if (cleanedPaths.length < operation.cleanup.length) return "WAITING";

    let tempPathExists = false;

    if (operation.tempPath) {
      try {
        await fs.stat(operation.tempPath);
        tempPathExists = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }

    if (
      tempPathExists &&
      !(await isMediaPathReferenced(operation.tempPath, { fileOperationId: id }))
    ) {
      checkCleanupCancelled(canContinue);
      await fs.rm(operation.tempPath, { force: true });
    }

    checkCleanupCancelled(canContinue);

    if (operation.sourceRootPath)
      await removeEmptySourceFolders(
        operation.cleanup.map((file) => file.path),
        operation.sourceRootPath,
      );

    if (operation.emptyFolderPath)
      await removeEmptyFolders(operation.emptyFolderPath, { hardDelete: true });

    await FileOperationModel.deleteOne({ _id: id, state: "COMMITTED" });

    return "DONE";
  } catch (error) {
    if (
      error?.name === "FileCleanupPausedError" ||
      workSignal.getStore()?.aborted ||
      !canContinue() ||
      isServerStopping()
    )
      return "PAUSED";

    await FileOperationModel.updateOne({ _id: id }, { error: error.message });

    throw error;
  }
};

export const recoverFileOperations = async (canContinue: () => boolean) => {
  const operations = await withIndexHint(() =>
    FileOperationModel.find({ state: "COMMITTED" })
      .select({ _id: 1 })
      .hint({ recordType: 1, state: 1, "cleanup.pathKey": 1 })
      .lean()
      .exec(),
  );

  for (const operation of operations) {
    if (!canContinue()) return;

    try {
      await finishFileOperation(operation._id, canContinue);
    } catch (error) {
      if (workSignal.getStore()?.aborted || !canContinue() || isServerStopping()) return;

      console.error("File cleanup retained for retry:", error);
    }
  }
};
