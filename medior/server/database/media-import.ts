import type { BigIntStats } from "fs";
import fs from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { isServerStopping, serverShutdownSignal } from "trabecula/utils/process";
import { checkFileExists, extendFileName, fileLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import { checkBackgroundExecution } from "medior/server/database/background-execution";
import {
  assertMediaPathIndexesReady,
  assertMediaPathsAvailable,
  describeFileCleanup,
  FileOperation,
  FileOperationModel,
  finishFileOperation,
  isMediaPathReferenced,
  listPendingCleanupPathKeys,
  makeFileCleanup,
} from "medior/server/database/file-operations";
import { queueImportCleanup } from "medior/server/database/import-cleanup";
import { mediaPathKey } from "medior/server/database/media-paths";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { metadataWriteOptions } from "medior/server/database/metadata-work";
import {
  dayjs,
  FileImportSidecar,
  getSubtitleFilePaths,
  hasTranscription,
  MusicImportOptions,
  normalizeTimestampPairs,
  SubtitleMode,
  SubtitleSource,
} from "medior/utils/common";
import {
  getAvailableFileStorage,
  getConfig,
  getDerivedMediaFolder,
  getIsActiveScratchPath,
  getIsAudio,
  getIsLinkedPath,
  getIsStoragePath,
  getIsStorageScratchPath,
  getIsVideo,
  getNtfsFileIdentity,
  getScratchFolder,
  leanModelToJson,
  socket,
} from "medior/utils/server";
import { genFileInfo, isGeneratedMediaUnreadable } from "medior/utils/server/files";
import {
  copyMediaFile,
  hashMediaFile,
  publishMediaOutput,
  recoverMediaOutput,
  syncMediaFile,
} from "medior/utils/server/media-output";
import { moveFileNoReplace, moveOrdinaryFileNoReplace } from "medior/utils/server/move-file";
import { canEmbedSubtitle, getPartialMuxPath, muxSubtitles } from "medior/utils/server/subtitles";
import { waitForWork, withResources, workSignal } from "medior/utils/server/work-signal";

export interface MediaImportInput {
  batchId?: string;
  dateCreated?: string;
  deleteOnImport: boolean;
  diffusionParams?: string;
  ext: string;
  ignorePrevDeleted: boolean;
  /** How an audio file is read into Music, which leaves it out without them. */
  musicOptions?: MusicImportOptions | null;
  originalName: string;
  originalPath: string;
  /** Batch root, within which folders emptied by deleting this source are removed. */
  rootFolderPath?: string;
  sidecar?: FileImportSidecar;
  size: number;
  subtitleMode?: SubtitleMode;
  subtitles?: SubtitleSource[];
  tagIds: string[];
}

const activeImportHashes = new Map<string, Promise<void>>();
const activeImports = new Set<string>();
let importSequence = 0;
let importStorage: { bytesLeft: number; location: string };
let importStorageCheck: Promise<{ bytesLeft: number; location: string }>;

/**
 * Commits an unfinished import's outputs to cleanup, retaining its source. A source moved into
 * storage goes back first, unless a library file already uses it. An import that moved its source
 * after this operation was read isn't abandoned, so the source's only copy is never cleaned up.
 */
export const abandonPreparedImport = async (operation: FileOperation) => {
  if (operation.isSourceMoved) await undoSourceMove(operation);

  const cleanup = [...operation.cleanup];

  for (const outputPath of [
    operation.outputPath,
    operation.thumbPath,
    ...getImportScratchPaths(operation),
  ]) {
    if (!outputPath || mediaPathKey(outputPath) === mediaPathKey(operation.sourcePath)) continue;

    const file =
      outputPath === operation.outputPath && operation.outputHash
        ? makeFileCleanup(operation.outputHash, outputPath)
        : await describeFileCleanup(outputPath);

    if (file) cleanup.push(file);
  }

  const isOutputUsed =
    !!operation.outputPath &&
    (await isMediaPathReferenced(operation.outputPath, { fileOperationId: operation._id }));

  const result = await FileOperationModel.updateOne(
    {
      _id: operation._id,
      state: "PREPARED",
      ...(isOutputUsed ? {} : { isSourceMoved: { $ne: true } }),
    },
    { cleanup, state: "COMMITTED" },
  );

  if (
    !result.matchedCount &&
    (await FileOperationModel.exists({ _id: operation._id, state: "PREPARED" }))
  )
    throw new Error("This import moved its source while being abandoned. Try again once it stops.");
};

const acquireImportHash = async (hash: string) => {
  checkBackgroundExecution();
  workSignal.getStore()?.throwIfAborted();

  const previous = activeImportHashes.get(hash) ?? Promise.resolve();
  let release: () => void;
  const completed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = previous.then(() => completed);

  activeImportHashes.set(hash, pending);
  pending.then(() => {
    if (activeImportHashes.get(hash) === pending) activeImportHashes.delete(hash);
  });

  try {
    await waitForWork(previous, [serverShutdownSignal, workSignal.getStore()]);
    checkBackgroundExecution();
    workSignal.getStore()?.throwIfAborted();

    return release;
  } catch (error) {
    release();

    throw error;
  }
};

/** Copies are verified against their source and flushed before they replace a partial copy. */
const copySubtitleFile = async (sourcePath: string, outputPath: string) => {
  const hash = await hashMediaFile(sourcePath);
  const tempPath = `${outputPath}.tmp`;

  await copyMediaFile(sourcePath, tempPath);
  await syncMediaFile(tempPath, hash);
  await fs.rename(tempPath, outputPath);
};

/**
 * Subtitles are named after the stored media, so re-copying them for a retried import overwrites.
 * Copies align with their sources, and ones removed since scanning are left out as null.
 */
const copySubtitles = async (mediaPath: string, subtitles: SubtitleSource[]) => {
  const copies: (models.FileSchema["subtitles"][number] | null)[] = [];

  for (const [index, subtitle] of subtitles.entries()) {
    if (!(await getIsSubtitleAvailable(subtitle))) copies.push(null);
    else {
      const ext = path.extname(subtitle.path).slice(1).toLowerCase();
      const subtitlePath = getSubtitleCopyPath(mediaPath, subtitle.path, index);

      await copySubtitleFile(subtitle.path, subtitlePath);

      if (ext === "idx")
        await copySubtitleFile(
          extendFileName(subtitle.path, "sub"),
          extendFileName(subtitlePath, "sub"),
        );

      copies.push({ ext, path: subtitlePath, pathKey: mediaPathKey(subtitlePath) });
    }
  }

  return copies;
};

/**
 * Files whose import changed their bytes, such as by embedding subtitles, keep the source checksum,
 * and re-encoded, spliced, or edited files keep the checksums they were imported and edited with.
 * A file currently holding the content comes first, so a retried import finds its own record.
 */
const findImportDuplicate = async (hash: string, sourceHash: string) => {
  const hashes = [...new Set([hash, sourceHash])];

  return (
    (await models.FileModel.findOne({ hash: { $in: hashes } })
      .select("-tagIdsWithAncestors")
      .lean()) ??
    (await models.FileModel.findOne({
      $or: [
        { originalHash: { $in: hashes, $type: "string" } },
        { previousHashes: { $in: hashes, $type: "string" } },
        { sourceHash: { $in: hashes, $type: "string" } },
      ],
    })
      .select("-tagIdsWithAncestors")
      .lean())
  );
};

export const getImportOperationId = (args: Pick<MediaImportInput, "batchId" | "originalPath">) =>
  args.batchId
    ? createHash("sha256").update(`${args.batchId}\0${args.originalPath}`).digest("hex")
    : randomUUID();

/** Outputs an unfinished import may have written besides its media and thumbnail. */
const getImportScratchPaths = (operation: FileOperation) => [
  ...(operation.contentPath
    ? [operation.contentPath, getPartialMuxPath(operation.contentPath)]
    : []),
  ...(operation.outputPath && operation.importInput
    ? getSubtitleFilePaths(
        getImportSubtitles(operation.importInput).kept.map((subtitle, index) => ({
          path: getSubtitleCopyPath(operation.outputPath, subtitle.path, index),
        })),
      ).flatMap((subtitlePath) => [subtitlePath, `${subtitlePath}.tmp`])
    : []),
];

/** Subtitles the container cannot hold are kept beside the video instead of being embedded. */
const getImportSubtitles = (args: MediaImportInput) => {
  const subtitles =
    args.subtitleMode && args.subtitleMode !== "none" && getIsVideo(args.ext)
      ? (args.subtitles ?? [])
      : [];

  const embedded =
    args.subtitleMode === "embed"
      ? subtitles.filter((subtitle) => canEmbedSubtitle(args.ext, subtitle.path))
      : [];

  return { embedded, kept: subtitles.filter((subtitle) => !embedded.includes(subtitle)) };
};

/** Whether a folder's drive, read from its nearest existing folder, has room to copy a file in. */
const getHasCopySpace = async (folderPath: string, size: number) => {
  for (let current = path.resolve(folderPath); ; current = path.dirname(current)) {
    try {
      const { bavail, bsize } = await fs.statfs(current);
      return bavail * bsize > size + 500000;
    } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(current) === current) throw error;
    }
  }
};

const getIsSameVolume = async (pathA: string, pathB: string) => {
  const [volumeA, volumeB] = await Promise.all([getVolumeId(pathA), getVolumeId(pathB)]);
  return !!volumeA && volumeA === volumeB;
};

/** Only subtitles that no longer exist are unavailable; other read failures fail the import. */
const getIsSubtitleAvailable = async (subtitle: SubtitleSource) => {
  for (const filePath of getSubtitleFilePaths([subtitle])) {
    try {
      await fs.stat(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return false;

      throw error;
    }
  }

  return true;
};

/**
 * Storage on the source's drive, where the source can be moved instead of copied, in the configured
 * order, or null without one. It still needs room for a copy, which a source that can't be moved
 * falls back to. Locations that can't be read, such as on a drive that's offline, are skipped.
 */
const getSourceDriveStorage = async (sourcePath: string, size: number) => {
  const sourceVolumeId = await getVolumeId(sourcePath);
  if (!sourceVolumeId) return null;

  for (const location of getConfig().db.fileStorage.locations) {
    if ((await getVolumeId(location)) === sourceVolumeId)
      return (await getHasCopySpace(location, size)) ? location : null;
  }

  return null;
};

const getSubtitleCopyPath = (mediaPath: string, subtitlePath: string, index: number) => {
  const { dir, name } = path.parse(mediaPath);

  return path.join(dir, `${name}-sub-${index}${path.extname(subtitlePath).toLowerCase()}`);
};

/** The volume of a path, read from its nearest existing folder, or null when it can't be read. */
const getVolumeId = async (filePath: string) => {
  for (let current = path.resolve(filePath); ; current = path.dirname(current)) {
    try {
      return (await getNtfsFileIdentity(current)).volumeId;
    } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(current) === current) return null;
    }
  }
};

const prepareMediaImport = async (operation: FileOperation) => {
  // New imports own fresh paths. Reserving them changes one document, not shared media ownership.
  const result = await FileOperationModel.updateOne(
    { _id: operation._id, outputHash: { $exists: false } },
    { $set: operation },
    { ...metadataWriteOptions(), upsert: true },
  );

  if (result.matchedCount + result.upsertedCount !== 1)
    throw new Error("Import preparation changed before its intent was saved");
};

const reserveImportStorage = async (size: number) => {
  const bytesNeeded = size + 500000;

  while (true) {
    if (
      importStorage &&
      getConfig().db.fileStorage.locations.includes(importStorage.location) &&
      importStorage.bytesLeft > bytesNeeded
    ) {
      importStorage.bytesLeft -= size;

      return importStorage.location;
    }

    importStorage = null;

    const storage = await (importStorageCheck ??= getAvailableFileStorage(bytesNeeded)
      .then((result) => {
        if (!result.success) throw new Error(result.error);

        importStorage = result.data;

        return importStorage;
      })
      .finally(() => {
        importStorageCheck = null;
      }));

    if (!getConfig().db.fileStorage.locations.includes(storage.location)) continue;

    if (storage.bytesLeft <= bytesNeeded) continue;

    storage.bytesLeft -= size;

    return storage.location;
  }
};

/**
 * Moves an import's output back to its source path. A source already back there with the same
 * content leaves the output to the import's cleanup. Failing to move throws, keeping the output.
 */
const restoreMovedSource = async ({ outputHash, outputPath, sourcePath }: FileOperation) => {
  try {
    await fs.stat(outputPath);
  } catch (error) {
    if (error.code === "ENOENT") return;

    throw error;
  }

  if ((await checkFileExists(sourcePath)) && (await hashMediaFile(sourcePath)) === outputHash)
    return;

  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await moveFileNoReplace(outputPath, sourcePath);
};

/**
 * Moves a source the import moved into storage back where it was, so its only copy is never
 * removed as an unused output, then clears the move so later attempts start from the source.
 * A library file already using the output keeps it, as does a committed import's cleanup.
 */
const undoSourceMove = async (operation: FileOperation) => {
  if (!(await FileOperationModel.exists({ _id: operation._id, state: "PREPARED" }))) return;
  if (await isMediaPathReferenced(operation.outputPath, { fileOperationId: operation._id })) return;

  await restoreMovedSource(operation);
  await FileOperationModel.updateOne(
    { _id: operation._id, state: "PREPARED" },
    { $unset: { isSourceMoved: 1 } },
    metadataWriteOptions(),
  );
};

export const importMedia = async (args: MediaImportInput, operationId?: string) => {
  if (isServerStopping()) throw new Error("Importer is shutting down");

  await assertMediaPathIndexesReady();

  const id = operationId ?? getImportOperationId(args);

  if (activeImports.has(id)) throw new Error("This file import is already active");

  const isVideo = getIsVideo(args.ext);
  const sequence = importSequence++;

  activeImports.add(id);

  // Each overlapping import reports its own progress until it ends.
  socket.emit("onFileImportStarted", { batchId: args.batchId, filePath: args.originalPath });

  let releaseHash: () => void;
  /** Set while the source sits in storage because it was moved, which a failure then moves back. */
  let movedOperation: FileOperation;
  const startedAt = performance.now();
  const timings: string[] = [];
  let stageStartedAt = startedAt;

  let message = "Preparing import.";
  let progress: number;

  const reportProgress = (nextMessage: string, nextProgress?: number) => {
    message = nextMessage;
    progress = nextProgress;
  };

  const emitProgress = () =>
    socket.emitVolatile("onFileImportProgress", {
      batchId: args.batchId,
      elapsed: Math.floor((performance.now() - startedAt) / 1000),
      filePath: args.originalPath,
      message,
      progress,
    });

  const progressTimer = isVideo ? setInterval(emitProgress, 1000) : null;

  if (progressTimer) emitProgress();

  const recordTiming = (stage: string) => {
    const now = performance.now();

    timings.push(`${stage}: ${Math.round(now - stageStartedAt)}ms`);
    stageStartedAt = now;
  };

  /**
   * Drives are told apart by volume, read from the nearest existing folder for unwritten outputs.
   * A drive that can't be read isn't gated, leaving the failure to the import's own reads.
   */
  const getDiskResource = async (filePath: string) => {
    if (!isVideo) return null;

    for (let current = filePath; ; current = path.dirname(current)) {
      try {
        return `disk:${(await getNtfsFileIdentity(current)).volumeId}`;
      } catch {
        if (path.dirname(current) === current) return null;
      }
    }
  };

  /**
   * Videos take turns on each drive and with ffmpeg, so stages bound by different resources overlap
   * across files while each drive streams one file at a time. Among waiting imports, the earliest
   * goes first. Stage timings include the wait, which is also logged on its own.
   */
  const withVideoResources = async <T>(
    stage: string,
    resources: string[],
    run: (release: (kept?: string[]) => void) => Promise<T>,
  ) => {
    if (!isVideo) return await run(() => {});

    const waitStartedAt = performance.now();

    reportProgress("Waiting for another import.");

    return await withResources(
      resources.filter(Boolean),
      sequence,
      [serverShutdownSignal, workSignal.getStore()],
      async (release) => {
        timings.push(`${stage} wait: ${Math.round(performance.now() - waitStartedAt)}ms`);

        return await run(release);
      },
    );
  };

  try {
    let operation: FileOperation = await FileOperationModel.findById(id).lean();

    recordTiming("recovery lookup");

    // Imports of the same source share one lock whether or not embedding changed their output.
    if (operation?.outputHash)
      releaseHash = await acquireImportHash(operation.sourceHash ?? operation.outputHash);

    if (operation?.state === "PREPARED" && operation.importResult) {
      if (operation.error)
        await FileOperationModel.updateOne(
          { _id: id, state: "PREPARED" },
          { $unset: { error: 1 } },
          metadataWriteOptions(),
        );

      return await commitMediaImport(args, operation, operation.importResult, recordTiming);
    }

    if (operation?.state === "COMMITTED") {
      const file = leanModelToJson<models.FileSchema>(
        await models.FileModel.findOne(
          operation.fileId ? { _id: operation.fileId } : { hash: operation.outputHash },
        ).lean(),
      );

      const result = {
        file,
        hash: operation.outputHash,
        status: !file
          ? ("DELETED" as const)
          : file.path === operation.outputPath
            ? ("COMPLETE" as const)
            : ("DUPLICATE" as const),
      };

      await updateBatchImport(args, result);
      await queueImportCleanup([id]);

      return result;
    }

    // Re-importing a source before its earlier import deletes it would only produce a duplicate.
    if ((await listPendingCleanupPathKeys([mediaPathKey(args.originalPath)])).size)
      throw new Error(
        "An earlier import is still deleting this source. Wait for Import source cleanup in Activity to finish.",
      );

    // Stored media is registered in place; redundant copies and leftover scratch are deleted.
    const isStored = getIsStoragePath(args.originalPath);
    const isScratch = isStored && getIsStorageScratchPath(args.originalPath);
    // Linked media is registered in place too, but belongs to other apps, so it's never deleted.
    const isLinked = getIsLinkedPath(args.originalPath);
    const isInPlace = isStored || isLinked;

    if (isStored && getIsActiveScratchPath(args.originalPath))
      throw new Error("Scratch output may still be in use, so it was not imported.");

    if (isInPlace && !operation) {
      await assertMediaPathsAvailable([args.originalPath]);

      // A linked file the library already has, such as from rescanning its folder, is a duplicate.
      const linkedFile = isLinked
        ? await models.FileModel.findOne({ pathKey: mediaPathKey(args.originalPath) }).lean()
        : null;

      if (linkedFile) {
        const result = {
          file: leanModelToJson<models.FileSchema>(linkedFile),
          hash: linkedFile.hash,
          status: "DUPLICATE" as const,
        };

        await updateBatchImport(args, result);

        return result;
      } else if (await isMediaPathReferenced(args.originalPath))
        throw new Error(
          "The library, a transform, or another import already uses this stored file.",
        );
    }

    const sourceDisk = await getDiskResource(args.originalPath);

    // A source already moved into storage is verified there instead, when its output is recovered.
    const isSourceAlreadyMoved =
      !!operation?.isSourceMoved && !(await checkFileExists(args.originalPath));
    let sourceStats: BigIntStats;

    if (isSourceAlreadyMoved) movedOperation = operation;

    const sourceHash = isSourceAlreadyMoved
      ? (operation.sourceHash ?? operation.outputHash)
      : await withVideoResources("source checksum", [sourceDisk], async () => {
          reportProgress("Calculating checksum.", 0);
          sourceStats = await fs.stat(args.originalPath, { bigint: true });

          return await hashMediaFile(args.originalPath, workSignal.getStore(), (bytes) =>
            reportProgress(
              "Calculating checksum.",
              args.size > 0 ? Math.min(100, (bytes / args.size) * 100) : undefined,
            ),
          );
        });

    reportProgress("Checking for duplicates.");
    recordTiming("source checksum");

    if (!releaseHash) releaseHash = await acquireImportHash(sourceHash);

    checkBackgroundExecution();

    const subtitles = getImportSubtitles(args);

    // Media kept in place is registered as it is, beside companions subtitle copies could overwrite.
    if (isInPlace && !operation?.outputHash && (subtitles.embedded.length || subtitles.kept.length))
      throw new Error(
        "Subtitles cannot be imported with media kept in place in file storage or a linked folder.",
      );

    const embedSubtitles = async (contentPath: string) => {
      const isAvailable = await Promise.all(subtitles.embedded.map(getIsSubtitleAvailable));

      reportProgress("Embedding subtitles.");
      await fs.mkdir(path.dirname(contentPath), { recursive: true });
      await muxSubtitles({
        inputPath: args.originalPath,
        outputPath: contentPath,
        signal: workSignal.getStore(),
        subtitles: subtitles.embedded.filter((_, index) => isAvailable[index]),
      });
    };

    const clearMoveIntent = async () => {
      await FileOperationModel.updateOne(
        { _id: id, state: "PREPARED" },
        { $unset: { isSourceMoved: 1 } },
        metadataWriteOptions(),
      );
    };

    /**
     * Why the source is copied rather than moved, or null when it may be moved. A moved file keeps
     * its source's links, so only an unchanged file without other names, on its storage's drive, is
     * moved. The move itself also refuses files a copy wouldn't behave like.
     */
    const getMoveRefusal = async () => {
      const stats = await fs.lstat(args.originalPath, { bigint: true });

      if (!sourceStats) return "it wasn't checksummed by this attempt";
      else if (!stats.isFile()) return "it's a link";
      else if (stats.nlink > 1n) return "it has other hard links";
      else if (
        stats.size !== sourceStats.size ||
        stats.mtimeNs !== sourceStats.mtimeNs ||
        stats.ctimeNs !== sourceStats.ctimeNs ||
        stats.ino !== sourceStats.ino
      )
        return "it changed after its checksum";
      else if (!(await getIsSameVolume(args.originalPath, operation.outputPath)))
        return "its storage is on another drive";
      else return null;
    };

    /**
     * Moves a same-drive source into storage, skipping the copy and its verification, since a move
     * leaves the checksummed bytes untouched. Writes still cached for the source are flushed first,
     * and the moved file must still match the source's size and modified time. The intent is saved
     * first, so an abandoned or failed import moves the source back. A source that isn't moved stays
     * in place to be copied, without an intent that would later move the copy instead.
     */
    const moveSourceIntoStorage = async () => {
      const refusal = await getMoveRefusal();

      if (refusal) {
        fileLog(`[Import ${id}] Copying instead of moving, as ${refusal}.`);

        if (operation.isSourceMoved) await clearMoveIntent();

        return false;
      }

      const marked = await FileOperationModel.updateOne(
        { _id: id, state: "PREPARED" },
        { isSourceMoved: true },
        metadataWriteOptions(),
      );

      if (marked.matchedCount !== 1)
        throw new Error("Import preparation changed before its move was saved");

      reportProgress("Moving media.");

      try {
        await moveOrdinaryFileNoReplace(args.originalPath, operation.outputPath);
      } catch (error) {
        // A move that may still have happened keeps its intent, so its output is never removed.
        if (
          !(await checkFileExists(args.originalPath)) ||
          (await checkFileExists(operation.outputPath))
        )
          throw error;

        fileLog(`[Import ${id}] Copying instead of moving: ${error.message}`);
        await clearMoveIntent();

        return false;
      }

      movedOperation = operation;

      // A write between the check and the move changes these, so the source goes back to be copied.
      const moved = await fs.stat(operation.outputPath, { bigint: true });

      if (moved.size !== sourceStats.size || moved.mtimeNs !== sourceStats.mtimeNs) {
        fileLog(`[Import ${id}] Copying instead of moving, as it changed while moving.`);
        await restoreMovedSource(operation);
        movedOperation = null;
        await clearMoveIntent();

        return false;
      }

      return true;
    };

    const duplicate = await findImportDuplicate(sourceHash, sourceHash);

    // Stored media follows the import's own setting for previously deleted files like any other.
    // A source already moved into storage was accepted, and ignoring it would remove its only copy.
    let ignored =
      !duplicate &&
      !isSourceAlreadyMoved &&
      (isScratch ||
        (args.ignorePrevDeleted && !!(await models.DeletedFileModel.exists({ hash: sourceHash }))));

    recordTiming("duplicate lookup");

    const preparedSourceHash = operation?.sourceHash ?? operation?.outputHash;

    if (preparedSourceHash && preparedSourceHash !== sourceHash)
      throw new Error("Import source changed; the prepared output has been retained");

    if (!operation?.outputHash) {
      // Sources the import may move go to storage on their own drive, as a copy would need space.
      const storage =
        duplicate || ignored || isInPlace
          ? null
          : (args.deleteOnImport &&
              !subtitles.embedded.length &&
              (await getSourceDriveStorage(args.originalPath, args.size))) ||
            (await reserveImportStorage(args.size));

      const contentPath =
        operation?.contentPath ??
        (storage && subtitles.embedded.length
          ? path.join(
              getScratchFolder(path.join(storage, "_tmp")),
              `subtitle-mux-${id}.${args.ext}`,
            )
          : null);

      const isEmbedding = Boolean(storage && contentPath);
      let outputHash = sourceHash;

      if (isEmbedding) {
        // Record the scratch output first so an abandoned import still cleans it up.
        await prepareMediaImport({
          _id: id,
          batchId: args.batchId,
          cleanup: [],
          contentPath,
          importInput: args,
          kind: "import",
          sourceHash,
          sourcePath: args.originalPath,
          state: "PREPARED",
        });

        const contentDisk = await getDiskResource(contentPath);

        outputHash = await withVideoResources(
          "subtitle embedding",
          [sourceDisk, contentDisk],
          async (release) => {
            // Remuxes only take their final name once finished, so an existing one is complete.
            if (!(await checkFileExists(contentPath))) await embedSubtitles(contentPath);

            release([contentDisk]);
            reportProgress("Calculating checksum.");

            return await hashMediaFile(contentPath, workSignal.getStore());
          },
        );
      }

      const outputPath = storage
        ? path.join(
            storage,
            outputHash.slice(0, 2),
            outputHash.slice(2, 4),
            `${outputHash}-${randomUUID()}.${args.ext}`,
          )
        : isInPlace && !duplicate && !ignored
          ? args.originalPath
          : null;

      const tempPath = storage ? `${outputPath}.${id}.tmp` : null;

      // Stored media keeps its own name, which another file's thumbnail could share without the ID.
      // Linked media's thumbnail goes to storage instead, named by its checksum.
      const thumbPath = !outputPath
        ? null
        : isLinked
          ? path.join(
              getDerivedMediaFolder(outputPath, outputHash),
              `${outputHash}-${id}-thumb.jpg`,
            )
          : path.join(
              path.dirname(outputPath),
              `${path.parse(outputPath).name}${storage ? "" : `-${id}`}-thumb.jpg`,
            );

      operation = {
        _id: id,
        batchId: args.batchId,
        cleanup: [],
        ...(contentPath ? { contentPath, sourceHash } : {}),
        importInput: args,
        kind: "import",
        outputHash,
        outputPath,
        sourcePath: args.originalPath,
        state: "PREPARED",
        tempPath,
        thumbPath,
      };

      await prepareMediaImport(operation);
    }

    const hash = operation.outputHash;

    // Deleted files record the checksum of their stored media, which embedding changes.
    if (!duplicate && !ignored && args.ignorePrevDeleted && hash !== sourceHash)
      ignored = !!(await models.DeletedFileModel.exists({ hash }));

    recordTiming("durable intent");

    if (
      !ignored &&
      !duplicate &&
      mediaPathKey(operation.outputPath) !== mediaPathKey(args.originalPath)
    ) {
      if (!operation.outputPath)
        throw new Error("Import eligibility changed; cancel and requeue this import");

      // Sources the import deletes anyway are moved in, unless their bytes change on import.
      const isMovable = args.deleteOnImport && !operation.contentPath;

      // A move only renames the source, so it doesn't wait for its drive while another import reads
      // a whole file there. Outputs an earlier attempt left are verified with the drive first.
      const canMoveFirst =
        isMovable &&
        !(await checkFileExists(operation.outputPath)) &&
        !(await checkFileExists(operation.tempPath));

      if (canMoveFirst) await fs.mkdir(path.dirname(operation.outputPath), { recursive: true });

      const isMovedFirst = canMoveFirst && (await moveSourceIntoStorage());

      if (!isMovedFirst) {
        // Remuxed media is copied from scratch; the source is only read to rebuild a missing remux.
        const isSourceRead =
          !operation.contentPath || !(await checkFileExists(operation.contentPath));

        const contentDisk = operation.contentPath
          ? await getDiskResource(operation.contentPath)
          : null;
        const outputDisk = await getDiskResource(operation.outputPath);

        await withVideoResources(
          "publish media",
          [isSourceRead ? sourceDisk : null, contentDisk, outputDisk],
          async (release) => {
            let recovered: Awaited<ReturnType<typeof recoverMediaOutput>>;

            reportProgress("Verifying existing media.");

            try {
              recovered = await recoverMediaOutput({
                hash,
                path: operation.outputPath,
                tempPath: operation.tempPath,
              });
            } catch (error) {
              if (
                error?.name !== "MediaChecksumMismatchError" ||
                error.filePath !== operation.tempPath ||
                operation.tempPath !== `${operation.outputPath}.${id}.tmp` ||
                mediaPathKey(operation.tempPath) === mediaPathKey(args.originalPath)
              )
                throw error;

              await withMetadataMutation(async () => {
                let isPublished = false;

                try {
                  await fs.lstat(operation.outputPath);
                  isPublished = true;
                } catch (statError) {
                  if (statError.code !== "ENOENT") throw statError;
                }

                if (
                  isPublished ||
                  (await isMediaPathReferenced(operation.tempPath, { fileOperationId: id }))
                )
                  throw error;

                await assertMediaPathsAvailable([operation.tempPath]);
                workSignal.getStore()?.throwIfAborted();
                await fs.rm(operation.tempPath, { force: true });
              });
            }

            if (!recovered) {
              if (operation.contentPath && !(await checkFileExists(operation.contentPath))) {
                await embedSubtitles(operation.contentPath);

                if ((await hashMediaFile(operation.contentPath, workSignal.getStore())) !== hash)
                  throw new Error(
                    "Embedding subtitles produced a different file; cancel and requeue this import",
                  );
              }

              // Remuxed media is copied from scratch, freeing the source's drive.
              release([operation.contentPath ? contentDisk : sourceDisk, outputDisk]);
              await fs.mkdir(path.dirname(operation.outputPath), { recursive: true });

              // A source whose earlier outputs were cleared above can still be moved instead.
              const isMoved = isMovable && !canMoveFirst && (await moveSourceIntoStorage());

              if (!isMoved) {
                // Storage picked for a move reserved no space, so a copy checks for it first.
                if (
                  isMovable &&
                  !(await getHasCopySpace(path.dirname(operation.outputPath), args.size))
                )
                  throw new Error("Not enough free space in file storage to copy this file.");

                reportProgress("Copying media.", 0);
                await copyMediaFile(
                  operation.contentPath ?? args.originalPath,
                  operation.tempPath,
                  true,
                  (bytes) =>
                    reportProgress(
                      "Copying media.",
                      args.size > 0 ? Math.min(100, (bytes / args.size) * 100) : undefined,
                    ),
                );

                // Verifying reads only the copy, so the next import can read its source meanwhile.
                release([outputDisk]);
                reportProgress("Verifying and saving media.");

                await publishMediaOutput({
                  hash,
                  path: operation.outputPath,
                  tempPath: operation.tempPath,
                });
              }
            }
          },
        );
      }
    }

    recordTiming("publish media");

    const outputPaths = [operation.outputPath, operation.thumbPath];

    if (!duplicate && !ignored) {
      const thumbPath =
        operation.thumbPath ??
        path.join(getDerivedMediaFolder(operation.outputPath, hash), `${hash}-${id}-thumb.jpg`);

      if (operation.thumbPath !== thumbPath) {
        const previous = await describeFileCleanup(operation.thumbPath);

        if (previous) operation.cleanup.push(previous);

        operation.thumbPath = thumbPath;

        await assertMediaPathsAvailable([thumbPath]);

        await FileOperationModel.updateOne(
          { _id: id, state: "PREPARED" },
          { cleanup: operation.cleanup, thumbPath },
        );
      }
    }

    const info =
      !duplicate && !ignored
        ? await genFileInfo({
            filePath: operation.outputPath,
            hash,
            musicOptions: args.musicOptions ?? null,
            onProgress: reportProgress,
            originalName: args.sidecar?.originalName ?? args.originalName,
            // Only thumbnails take turns with other videos; reading metadata doesn't.
            runThumbs: async (run) => {
              recordTiming("media probe");
              await withVideoResources("thumbnail", ["ffmpeg"], run);
            },
            signal: workSignal.getStore(),
            skipAudio: true,
            thumbId: path.basename(operation.thumbPath).replace(/-thumb\.jpg$/, ""),
            withTagRating: true,
          })
        : null;

    if (info && isGeneratedMediaUnreadable(info))
      throw new Error("Imported media could not be read; source retained");

    if (info?.thumb?.path) await syncMediaFile(info.thumb.path);

    if (info?.thumb?.path && info.thumb.path !== operation.thumbPath)
      await FileOperationModel.updateOne({ _id: id }, { thumbPath: info.thumb.path });

    recordTiming("thumbnail");

    let keptCopies: Awaited<ReturnType<typeof copySubtitles>> = [];

    if (subtitles.kept.length && !duplicate && !ignored) {
      reportProgress("Copying subtitles.");
      keptCopies = await copySubtitles(operation.outputPath, subtitles.kept);
    }

    const storedSubtitles = keptCopies.filter(Boolean);

    reportProgress("Preparing source cleanup.");

    const cleanup = [];
    const copiedKept = subtitles.kept.filter((_, index) => keptCopies[index]);
    const keptCopyPaths = getSubtitleFilePaths(storedSubtitles);
    const keptSourcePaths = getSubtitleFilePaths(copiedKept);

    // Ignored files besides leftover scratch were previously deleted and are skipped, not discarded.
    // Linked sources stay for the apps they belong to.
    if (args.deleteOnImport && !isLinked && (!ignored || isScratch)) {
      for (const sourcePath of [
        args.originalPath,
        extendFileName(args.originalPath, "json"),
        ...(args.diffusionParams ? [extendFileName(args.originalPath, "txt")] : []),
        // Subtitles leave once stored, embedded, attached to a duplicate, or discarded with their video.
        ...(duplicate?.subtitles?.length
          ? []
          : getSubtitleFilePaths(
              duplicate?.sourceHash
                ? subtitles.kept
                : [...subtitles.embedded, ...(duplicate || ignored ? subtitles.kept : copiedKept)],
            )),
      ]) {
        // Persist the expected source checksum; cleanup verifies it and that the retained copy exists.
        const file =
          sourcePath === args.originalPath
            ? makeFileCleanup(sourceHash, sourcePath)
            : await describeFileCleanup(
                sourcePath,
                keptCopyPaths[keptSourcePaths.indexOf(sourcePath)],
              );

        if (file) cleanup.push(file);
      }
    } else if (isStored && !isLinked && (duplicate || isScratch)) {
      // Without source deletion, only redundant stored copies and leftover scratch are removed.
      cleanup.push(makeFileCleanup(sourceHash, args.originalPath));
    }

    const unusedOutput = [];

    for (const outputPath of new Set([
      ...outputPaths,
      info?.thumb?.path,
      ...getImportScratchPaths(operation),
    ])) {
      if (!outputPath || mediaPathKey(outputPath) === mediaPathKey(args.originalPath)) continue;

      // Output checksums differ from the source's only when taken from the finished remux.
      const entry =
        outputPath === operation.outputPath ||
        (outputPath === operation.contentPath && hash !== sourceHash)
          ? makeFileCleanup(hash, outputPath)
          : await describeFileCleanup(outputPath);

      if (entry) unusedOutput.push(entry);
    }

    recordTiming("prepare cleanup");

    const importResult = { cleanup, ignored, info, subtitles: storedSubtitles, unusedOutput };

    reportProgress("Saving file and tag metadata.");

    return await commitMediaImport(args, operation, importResult, recordTiming);
  } catch (error) {
    // A moved source goes back, so a failed import doesn't leave it hidden in storage. A paused
    // import can't move it back, and its saved intent lets the retry continue or an abandon undo it.
    if (movedOperation) {
      try {
        await undoSourceMove(movedOperation);
      } catch (undoError) {
        fileLog(`[Import ${id}] Moved source kept in storage: ${undoError.message}`);
      }
    }

    throw error;
  } finally {
    if (progressTimer) clearInterval(progressTimer);

    releaseHash?.();
    activeImports.delete(id);
    socket.emit("onFileImportEnded", { batchId: args.batchId, filePath: args.originalPath });

    if (performance.now() - startedAt >= 250)
      fileLog(
        `[Import ${id}] ${Math.round(performance.now() - startedAt)}ms; ${timings.join("; ")}`,
      );
  }
};

/**
 * Duplicates without subtitles take the imported ones beside their existing, unchanged media.
 * Files imported with embedded subtitles already hold the ones that would have been embedded.
 */
const attachDuplicateSubtitles = async (file: models.FileSchema, args: MediaImportInput) => {
  const { embedded, kept } = getImportSubtitles(args);
  const sources = file.sourceHash ? kept : [...embedded, ...kept];

  // Copies would overwrite the identically named subtitles a file already has, and a linked file's
  // folder belongs to other apps.
  if (!sources.length || file.subtitles?.length || getIsLinkedPath(file.path)) return file;

  const copyPaths = getSubtitleFilePaths(
    sources.map((subtitle, index) => ({
      path: getSubtitleCopyPath(file.path, subtitle.path, index),
    })),
  );

  // Another import may have attached its subtitles since the file was read.
  for (const copyPath of copyPaths) if (await isMediaPathReferenced(copyPath)) return file;

  const subtitles = (await copySubtitles(file.path, sources)).filter(Boolean);
  if (!subtitles.length) return file;

  const updated = await models.FileModel.updateOne(
    { _id: file.id, "subtitles.0": { $exists: false } },
    { $set: { subtitles } },
    metadataWriteOptions(),
  );
  if (!updated.modifiedCount) return file;

  socket.emitVolatile("onFilesUpdated", { fileIds: [file.id], updates: { subtitles } });

  return { ...file, subtitles };
};

/** Fills metadata an existing file lacks from an imported sidecar without replacing existing values. */
const mergeImportSidecar = async (file: models.FileSchema, sidecar: FileImportSidecar) => {
  const updates: Partial<models.FileSchema> = {
    ...(!file.diffusionParams && sidecar.diffusionParams
      ? { diffusionParams: sidecar.diffusionParams }
      : {}),
    ...(!file.originalName && sidecar.originalName ? { originalName: sidecar.originalName } : {}),
    ...(!file.timestamps?.length && sidecar.timestamps?.length
      ? { timestamps: sidecar.timestamps }
      : {}),
    ...(!hasTranscription(file.transcription) && hasTranscription(sidecar.transcription)
      ? { transcription: sidecar.transcription }
      : {}),
  };

  if (Object.keys(updates).length) {
    const updated = await actions.updateFile({ args: { id: file.id, updates } });
    if (!updated.success) throw new Error(updated.error);
  }

  if (!file.rating && sidecar.rating) {
    const rated = await actions.setFileRating({ fileIds: [file.id], rating: sidecar.rating });
    if (!rated.success) throw new Error(rated.error);
  }
};

const commitMediaImport = async (
  args: MediaImportInput,
  operation: FileOperation,
  prepared: FileOperation["importResult"],
  recordTiming: (stage: string) => void,
) => {
  if (operation.state !== "PREPARED") throw new Error("Import is no longer prepared");

  const hash = operation.outputHash;
  const { audio, cleanup, ignored, info, subtitles, unusedOutput } = prepared;

  let file = leanModelToJson<models.FileSchema>(
    await findImportDuplicate(hash, operation.sourceHash ?? hash),
  );

  recordTiming("file lookup");

  const status: "COMPLETE" | "DELETED" | "DUPLICATE" =
    file && file.path !== operation.outputPath ? "DUPLICATE" : ignored ? "DELETED" : "COMPLETE";
  let isSubtitleAttached = false;

  if (!file && !ignored) {
    if (!info) throw new Error("Duplicate changed during import; source retained for retry");

    const imported = await actions.importFile({
      ...info,
      dateCreated: args.sidecar?.dateCreated ?? args.dateCreated ?? dayjs().toISOString(),
      dateImported: dayjs().toISOString(),
      diffusionParams: args.sidecar?.diffusionParams ?? args.diffusionParams,
      hasTranscript: info.hasTranscript || hasTranscription(args.sidecar?.transcription),
      isArchived: args.sidecar?.isArchived,
      originalHash: hash,
      originalName: args.sidecar?.originalName ?? args.originalName,
      originalPath: args.originalPath,
      path: operation.outputPath,
      // A sidecar's Medior rating comes before one a player saved in the file's tag.
      rating: args.sidecar?.rating || info.rating,
      sourceHash: hash === operation.sourceHash ? undefined : operation.sourceHash,
      subtitles: subtitles?.length ? subtitles : undefined,
      tagIds: args.tagIds,
      timestamps: args.sidecar?.timestamps?.map((timestamp) => ({
        ...timestamp,
        pairs: normalizeTimestampPairs(timestamp.pairs),
      })),
      transcription: args.sidecar?.transcription ?? info.transcription,
      withTagRegen: !args.batchId,
    });
    if (!imported.success) throw new Error(imported.error);

    file = imported.data;

    if (file.isArchived)
      socket.emitVolatile("onFilesUpdated", { fileIds: [file.id], updates: { isArchived: true } });
  } else if (file) {
    const addedTagIds = args.tagIds.filter(
      (id) => !file.tagIds.some((tagId) => String(tagId) === id),
    );

    if (addedTagIds.length) {
      const tagged = await actions.editFileTags({
        addedTagIds,
        fileIds: [file.id],
        withRegen: !args.batchId,
      });
      if (!tagged.success) throw new Error(tagged.error);
    } else if (status === "COMPLETE" && !args.batchId) {
      await actions.queueTagMetadataRegen(file.tagIds, file.tagIdsWithAncestors);
    }

    if (args.sidecar) await mergeImportSidecar(file, args.sidecar);

    if (status === "DUPLICATE" && !file.subtitles?.length) {
      const attached = await attachDuplicateSubtitles(file, args);

      isSubtitleAttached = attached !== file;
      file = attached;
    }
  }

  if (file && audio) {
    await models.FileModel.updateOne(
      { _id: file.id, hash },
      { peakDecibels: audio.peakDecibels, waveformPeaks: audio.waveformPeaks },
    );

    socket.emitVolatile("onFilesUpdated", {
      fileIds: [file.id],
      updates: { peakDecibels: audio.peakDecibels, waveformPeaks: audio.waveformPeaks },
    });
  }

  if (
    file &&
    (getIsAudio(file.ext) || getIsVideo(file.ext)) &&
    file.audioCodec &&
    file.audioCodec !== "None" &&
    (!file.waveformPeaks?.length || file.peakDecibels == null) &&
    !audio
  ) {
    const { queueImportedAudio } = await import("medior/server/database/import-audio");

    await queueImportedAudio(file.id);
  }

  if (status === "COMPLETE" && file?.music) await actions.regenMusicByFileIds([file.id]);

  recordTiming("file metadata");

  await updateBatchImport(args, { file, hash, status });
  recordTiming("import progress");

  const retainedPaths = [file?.path, file?.thumb?.path, ...getSubtitleFilePaths(file?.subtitles)]
    .filter(Boolean)
    .map(mediaPathKey);

  // A duplicate's subtitle sources only leave once they were attached to it.
  const keptSubtitleKeys = new Set(
    status === "DUPLICATE" && !isSubtitleAttached
      ? getSubtitleFilePaths(args.subtitles).map(mediaPathKey)
      : [],
  );

  const removedEntries = [...cleanup, ...operation.cleanup, ...unusedOutput].filter(
    (entry) => !retainedPaths.includes(entry.pathKey) && !keptSubtitleKeys.has(entry.pathKey),
  );
  const removedKeys = new Set(removedEntries.map((entry) => entry.pathKey));

  // Sources stay when the copy retaining them is unused too, such as a late duplicate's subtitles.
  // A duplicate's library copy was never verified by this import, so cleanup verifies its checksum.
  const committedCleanup = removedEntries
    .filter((entry) => !entry.retainedPath || !removedKeys.has(mediaPathKey(entry.retainedPath)))
    .map((entry) =>
      file && (entry.path === args.originalPath || entry.path === operation.outputPath)
        ? {
            ...entry,
            ...(status === "DUPLICATE" ? { retainedHash: file.hash } : {}),
            retainedPath: file.path,
          }
        : entry,
    );

  if (committedCleanup.length) {
    await FileOperationModel.updateOne(
      { _id: operation._id, state: "PREPARED" },
      {
        cleanup: committedCleanup,
        fileId: file?.id,
        ...(args.deleteOnImport && args.rootFolderPath
          ? { sourceRootPath: args.rootFolderPath }
          : {}),
        state: "COMMITTED",
        tempPath: null,
      },
    );

    await queueImportCleanup([operation._id]);
  } else await FileOperationModel.deleteOne({ _id: operation._id, state: "PREPARED" });

  recordTiming("cleanup intent");

  return { file, hash, status };
};

const updateBatchImport = async (
  input: MediaImportInput,
  result: Awaited<ReturnType<typeof commitMediaImport>>,
) => {
  if (!input.batchId || !result) return;

  const updated = await actions.updateFileImportByPath({
    batchId: input.batchId,
    errorMsg: null,
    fileId: result.file?.id,
    filePath: input.originalPath,
    hash: result.hash,
    status: result.status,
    thumb: result.file?.thumb,
  });

  if (!updated.success && (await models.FileImportBatchModel.exists({ _id: input.batchId })))
    throw new Error(updated.error);
};

const recordImportError = async (input: MediaImportInput, error: unknown) => {
  checkBackgroundExecution();

  if (!input.batchId) throw error;

  const updated = await actions.updateFileImportByPath({
    batchId: input.batchId,
    errorMsg: (error as Error)?.message ?? String(error),
    filePath: input.originalPath,
    status: "ERROR",
  });
  if (!updated.success) throw new Error(updated.error);

  console.error("Error importing file:", error);
};

export const importBatchFile = async (input: MediaImportInput) => {
  try {
    await importMedia(input);
  } catch (error) {
    await recordImportError(input, error);
  }
};

export const recoverDirectImports = async (canContinue: () => boolean) => {
  for await (const operation of FileOperationModel.find({
    batchId: null,
    kind: { $in: ["import", null] },
    state: "PREPARED",
  })
    .lean()
    .cursor()) {
    if (!canContinue()) return;

    if (activeImports.has(operation._id)) continue;

    try {
      if (operation.importInput) await importMedia(operation.importInput, operation._id);
      else {
        await abandonPreparedImport(operation);
        await finishFileOperation(operation._id);
      }
    } catch (error) {
      await FileOperationModel.updateOne({ _id: operation._id }, { error: error.message });
      console.error("Direct import retained for recovery:", error);
    }
  }
};
