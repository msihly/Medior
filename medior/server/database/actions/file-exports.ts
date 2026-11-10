import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { checkFileExists, fileLog } from "trabecula/utils/server";
import {
  canRunBackgroundQueues,
  makeBackgroundOperationRunner,
  runFileCleanupQueue,
} from "medior/server/database/actions/background-operations";
import { getForeignFileLock, lockFiles, unlockFiles } from "medior/server/database/file-locks";
import {
  assertMediaPathIndexesReady,
  assertMediaPathsAvailable,
  FileOperation,
  FileOperationModel,
  finishFileOperation,
  isMediaPathReferenced,
  makeFileCleanup,
} from "medior/server/database/file-operations";
import { Job, startJob } from "medior/server/database/jobs";
import { mediaPathKey } from "medior/server/database/media-paths";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { metadataSaveOptions, metadataWriteOptions } from "medior/server/database/metadata-work";
import { Fmt, getSubtitleFilePaths } from "medior/utils/common";
import {
  getIsLinkedPath,
  getIsStoragePath,
  getThumbNtfsIdentity,
  leanModelToJson,
  makeAction,
  objectId,
  objectIds,
  socket,
  sortByStoredNtfsIdentity,
} from "medior/utils/server";
import { copyMediaFile, hashMediaFile, syncMediaFile } from "medior/utils/server/media-output";
import { moveFileNoReplace } from "medior/utils/server/move-file";
import { workSignal } from "medior/utils/server/work-signal";

type ExportFile = Pick<
  models.FileSchema,
  "hash" | "id" | "originalPath" | "path" | "size" | "subtitles" | "thumb"
>;

/** Transforms that still read their file at its stored path to finish. */
const PENDING_TRANSFORM_STATUSES = ["COMPLETE", "COMPRESSED", "PENDING", "RUNNING"];

/** Why files were left out, which the job counts together. */
const SKIPS = {
  failed: "Failed, with details in the log",
  inPlace: "Already at its original path",
  link: "Original path is a link",
  linked: "Already in a linked folder",
  missing: "Stored file missing",
  notLinked: "Original folder not linked",
  notStored: "Not in file storage",
  owned: "Path held by a cleanup or transform; finish it in Activity",
  pending: "Earlier move back still finishing",
  retained: "Moved, with its library update retried",
  sameFile: "Original path is the stored file",
  taken: "Another file at that path",
  transform: "Waiting on a transform",
  used: "Library already uses that path",
};

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
/** Counts a file left out under its reason, logging errors that aren't a known one. */
const addFileFailure = (
  job: Job,
  label: string,
  filePath: string,
  error: NodeJS.ErrnoException,
) => {
  if (Object.values(SKIPS).includes(error.message)) job.addFailure(error.message);
  else if (error.code === "EEXIST") job.addFailure(SKIPS.taken);
  else if (error.code === "ENOENT") job.addFailure(SKIPS.missing);
  else {
    logFileError(label, filePath, error);
    job.addFailure(SKIPS.failed);
  }
};

/** Refuses paths a cleanup or transform owns, as a reason the file is left out. */
const assertPathsAvailable = async (paths: string[]) => {
  try {
    await assertMediaPathsAvailable(paths);
  } catch {
    throw new Error(SKIPS.owned);
  }
};

/**
 * Copies a file's subtitles beside its copy, named after it and numbered when it has several.
 * Subtitles removed from disk, or already beside the copy, are left out.
 */
const copySubtitles = async (file: ExportFile, mediaPath: string) => {
  const { dir, name } = path.parse(mediaPath);
  const subtitles = file.subtitles ?? [];

  for (const [index, subtitle] of subtitles.entries()) {
    const baseName = subtitles.length > 1 ? `${name}.${index + 1}` : name;

    for (const subtitlePath of getSubtitleFilePaths([subtitle])) {
      if (await checkFileExists(subtitlePath)) {
        try {
          await copyToNewPath(
            subtitlePath,
            path.join(dir, `${baseName}${path.extname(subtitlePath)}`),
          );
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
        }
      }
    }
  }
};

/**
 * Copies a file to a path no file has, flushed under a temporary name, and verified there against
 * its checksum when given one, before it takes that path. It keeps its modified time. Rejects with
 * code EEXIST when a file is already there.
 */
const copyToNewPath = async (
  sourcePath: string,
  targetPath: string,
  hash?: string,
  tempPath = `${targetPath}.${randomUUID()}.partial`,
) => {
  const { atime, mtime } = await fs.stat(sourcePath);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await copyMediaFile(sourcePath, tempPath, true);
    await syncMediaFile(tempPath, hash);
    await fs.utimes(tempPath, atime, mtime);
    await moveFileNoReplace(tempPath, targetPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
};

/**
 * Each file's copy path: its original path, or inside the destination, its path below the folder
 * that all of their original paths share. Files from several drives keep their drives as folders.
 */
const getCopyPaths = (files: ExportFile[], destination: string | null) => {
  if (destination === null) return new Map(files.map((file) => [file.id, getOriginalPath(file)]));
  else {
    const parts = files.map((file) =>
      path.resolve(getOriginalPath(file)).split(path.sep).filter(Boolean),
    );
    let sharedCount = parts.length ? parts[0].length - 1 : 0;

    for (const fileParts of parts) {
      let index = 0;

      while (
        index < sharedCount &&
        index < fileParts.length - 1 &&
        fileParts[index].toLowerCase() === parts[0][index].toLowerCase()
      )
        index++;

      sharedCount = index;
    }

    return new Map(
      files.map((file, index) => [
        file.id,
        path.join(
          destination,
          ...parts[index].slice(sharedCount).map((part) => part.replace(/:$/, "")),
        ),
      ]),
    );
  }
};

/** Whether a path holds the media as a file of its own, rather than a link or the stored file. */
const getHoldsMedia = async (filePath: string, storedPath: string, hash: string) => {
  try {
    if ((await fs.lstat(filePath)).isSymbolicLink()) return false;
    else if (await getIsSameFile(filePath, storedPath)) return false;
    else return (await hashMediaFile(filePath)) === hash;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    return false;
  }
};

/** Whether two paths reach the same file, such as through a mapped drive or a hard link. */
const getIsSameFile = async (filePath: string, otherPath: string) => {
  try {
    const [stats, otherStats] = await Promise.all([
      fs.stat(filePath, { bigint: true }),
      fs.stat(otherPath, { bigint: true }),
    ]);

    return stats.dev === otherStats.dev && stats.ino === otherStats.ino;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    return false;
  }
};

const getMoveBackId = (fileId: string) => `move-back:${fileId}`;

/**
 * The file's original path, with the stored file's extension when a transform changed its format.
 * Imports keep the source's extension in storage, so only transforms change it.
 */
const getOriginalPath = (file: ExportFile) => {
  const { dir, ext, name } = path.parse(file.originalPath);
  const storedExt = path.extname(file.path);

  return ext.toLowerCase() === storedExt.toLowerCase()
    ? file.originalPath
    : path.join(dir, `${name}${storedExt}`);
};

/** The files in disk order, since their thumbnails' stored identities follow their media's. */
const listExportFiles = async (fileIds: string[]) =>
  sortByStoredNtfsIdentity(
    (
      await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
        .select({ hash: 1, originalPath: 1, path: 1, size: 1, subtitles: 1, thumb: 1 })
        .lean()
    ).map((file): ExportFile => leanModelToJson<models.FileSchema>(file)),
    getThumbNtfsIdentity,
  );

const logFileError = (label: string, filePath: string, error: Error) =>
  fileLog(`[${label}] ${filePath}: ${error.message}`, { type: "error" });

/**
 * Puts a stored file at its original path and points its record there: moved on its own drive,
 * copied and verified from another, or the same file already there used as it is. The intent is
 * saved first, so a move cut short is finished from what's on disk. Throws why it was left out.
 */
const moveBack = async (file: ExportFile) => {
  const operationId = getMoveBackId(file.id);
  const targetPath = getOriginalPath(file);

  if (mediaPathKey(targetPath) === mediaPathKey(file.path)) throw new Error(SKIPS.inPlace);
  else if (getIsLinkedPath(file.path)) throw new Error(SKIPS.linked);
  else if (!getIsStoragePath(file.path)) throw new Error(SKIPS.notStored);
  else if (!getIsLinkedPath(targetPath)) throw new Error(SKIPS.notLinked);
  else if (await FileOperationModel.exists({ _id: operationId })) throw new Error(SKIPS.pending);
  else if (
    await models.FileTransformModel.exists({
      fileId: file.id,
      status: { $in: PENDING_TRANSFORM_STATUSES },
    })
  )
    throw new Error(SKIPS.transform);

  await assertPathsAvailable([file.path, targetPath]);

  if (await isMediaPathReferenced(targetPath)) throw new Error(SKIPS.used);

  const isFound = await checkFileExists(targetPath);

  if (isFound) {
    if ((await fs.lstat(targetPath)).isSymbolicLink()) throw new Error(SKIPS.link);
    else if (await getIsSameFile(targetPath, file.path)) throw new Error(SKIPS.sameFile);
    else if ((await hashMediaFile(targetPath)) !== file.hash) throw new Error(SKIPS.taken);
  } else if (!(await checkFileExists(file.path))) throw new Error(SKIPS.missing);

  const operation: FileOperation = {
    _id: operationId,
    cleanup: [],
    fileId: file.id,
    kind: "moveBack",
    outputHash: file.hash,
    outputPath: targetPath,
    sourcePath: file.path,
    state: "PREPARED",
    tempPath: `${targetPath}.${randomUUID()}.partial`,
  };

  await new FileOperationModel(operation).save(metadataSaveOptions());

  // Settling runs apart from a stop, which would otherwise leave the record behind a placed file.
  // A placement that failed after moving the file, such as while flushing it, still finishes.
  try {
    if (!isFound) await placeAtOriginalPath(file, targetPath, operation.tempPath);
  } catch (error) {
    const settled = await workSignal.exit(() => settleMoveBack(operation));

    if (settled.isMovedBack) return settled;
    else throw error;
  }

  try {
    return await workSignal.exit(() => settleMoveBack(operation, true));
  } catch (error) {
    logFileError("Move Back", targetPath, error);

    // The saved intent stays while the record is still at its stored path, so it's retried.
    const record = await models.FileModel.findById(file.id).select({ path: 1 }).lean();

    throw new Error(record?.path === file.path ? SKIPS.retained : SKIPS.failed);
  }
};

/**
 * Moves the stored file to its original path on its own drive, or copies it there from another.
 * Once placed, it's flushed apart from a stop, so the record never points at a move a crash could
 * undo.
 */
const placeAtOriginalPath = async (file: ExportFile, targetPath: string, tempPath: string) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await moveFileNoReplace(file.path, targetPath);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;

    await copyToNewPath(file.path, targetPath, file.hash, tempPath);
  }

  await workSignal.exit(() => syncMediaFile(targetPath));
};

/**
 * Finishes a move back from what's on disk and in the library. Once the original path holds the
 * file, its record points there, and a stored copy left behind goes to cleanup, which removes it
 * only after verifying the file at the original path. A move that never placed the file only loses
 * its intent. Every step can repeat, so one cut short finishes on the next try. Writes match the
 * attempt's own temporary path, so settling an earlier attempt never changes a later one.
 */
const settleMoveBack = async (operation: FileOperation, isPlaced = false) => {
  const { fileId, outputHash: hash, outputPath: targetPath, sourcePath: storedPath } = operation;
  const filter = { _id: operation._id, state: "PREPARED" as const, tempPath: operation.tempPath };

  if (operation.tempPath) await fs.rm(operation.tempPath, { force: true });

  const file = await models.FileModel.findById(fileId).select({ hash: 1, path: 1, size: 1 }).lean();
  const recordPathKey = file?.hash === hash ? mediaPathKey(file.path) : null;
  const isStoredRecord = recordPathKey === mediaPathKey(storedPath);

  const isMovedBack =
    recordPathKey === mediaPathKey(targetPath) ||
    (isStoredRecord && (isPlaced || (await getHoldsMedia(targetPath, storedPath, hash))));

  if (isMovedBack && isStoredRecord) await writeOriginalPath(operation);

  const hasStoredCopy =
    isMovedBack &&
    (await checkFileExists(storedPath)) &&
    !(await getIsSameFile(storedPath, targetPath));

  let isCleanupKept = false;

  if (hasStoredCopy) {
    const committed = await FileOperationModel.updateOne(
      filter,
      {
        $set: {
          cleanup: [
            {
              ...makeFileCleanup(hash, storedPath, file.size),
              retainedHash: hash,
              retainedPath: targetPath,
            },
          ],
          state: "COMMITTED",
        },
        $unset: { outputPath: 1, tempPath: 1 },
      },
      metadataWriteOptions(),
    );

    try {
      if (committed.matchedCount)
        isCleanupKept = (await finishFileOperation(operation._id)) !== "DONE";
    } catch (error) {
      fileLog(`[Move Back] Kept ${storedPath} for a later cleanup: ${error.message}`);
      isCleanupKept = true;
    }
  } else await FileOperationModel.deleteOne(filter);

  return { isCleanupKept, isMovedBack };
};

/**
 * Settles the files' unfinished move backs apart from a stop, resolving to the files they moved
 * back. Ones that can't settle yet stay for recovery.
 */
const settleUnfinishedMoveBacks = async (fileIds: string[]) => {
  const settledIds = new Set<string>();

  for (const operation of await FileOperationModel.find({
    _id: { $in: fileIds.map(getMoveBackId) },
    state: "PREPARED",
  }).lean()) {
    try {
      const { isMovedBack } = await workSignal.exit(() => settleMoveBack(operation));

      if (isMovedBack) settledIds.add(operation.fileId);
    } catch (error) {
      logFileError("Move Back", operation.outputPath, error);
    }
  }

  return settledIds;
};

/** Points the file's record at its original path, unless its media or path changed meanwhile. */
const writeOriginalPath = async ({ fileId, outputHash, outputPath, sourcePath }: FileOperation) => {
  const res = await withMetadataMutation(() =>
    models.FileModel.updateOne(
      { _id: objectId(fileId), hash: outputHash, path: sourcePath },
      { $set: { path: outputPath } },
      metadataWriteOptions(),
    ),
  );

  if (res.matchedCount !== 1) throw new Error("The file changed while it was being moved back.");

  socket.emitVolatile("onFileUpdated", { id: fileId, updates: { path: outputPath } });
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
/**
 * Copies files out of the library under their original names: to their original paths, or into
 * the destination with the folders below the one they share. Files already there are skipped, and
 * the library keeps its own copies.
 */
export const startFileCopy = makeAction(
  async ({ destination, fileIds }: { destination: string | null; fileIds: string[] }) => {
    const uniqueIds = [...new Set(fileIds)];

    if (destination !== null && !path.isAbsolute(destination))
      throw new Error("Choose a folder to copy the files into.");
    else if (destination !== null && getIsStoragePath(destination))
      throw new Error("Choose a folder outside file storage, whose cleanup would delete copies.");

    return startJob({
      fileIds: uniqueIds,
      label: "File Copy",
      run: async (job) => {
        let copiedCount = 0;

        try {
          await assertMediaPathIndexesReady();

          const files = await listExportFiles(uniqueIds);
          const copyPaths = getCopyPaths(files, destination);
          const foundIds = new Set(files.map((file) => file.id));

          job.complete(uniqueIds.filter((fileId) => !foundIds.has(fileId)));

          for (const file of files) {
            const copyPath = copyPaths.get(file.id);

            job.signal.throwIfAborted();
            job.report({ item: copyPath });

            try {
              if (mediaPathKey(copyPath) === mediaPathKey(file.path))
                throw new Error(SKIPS.inPlace);
              else if (await checkFileExists(copyPath)) throw new Error(SKIPS.taken);

              await assertPathsAvailable([copyPath]);

              if (await isMediaPathReferenced(copyPath)) throw new Error(SKIPS.used);

              await workSignal.run(job.signal, () => copyToNewPath(file.path, copyPath, file.hash));
              copiedCount++;

              try {
                await workSignal.run(job.signal, () => copySubtitles(file, copyPath));
              } catch (error) {
                job.signal.throwIfAborted();
                logFileError("File Copy", copyPath, error);
                job.addFailure("Copied without its subtitles");
              }
            } catch (error) {
              job.signal.throwIfAborted();
              addFileFailure(job, "File Copy", copyPath, error);
            }

            job.complete([file.id]);
          }
        } finally {
          job.report({ item: "", message: `${Fmt.commas(copiedCount)} files copied` });
        }
      },
      type: "copyFiles",
    });
  },
);

/**
 * Moves stored files back to their original paths, where they stay in the library as linked files
 * with their thumbnails and subtitles left in storage. The same file already at its original path,
 * such as one restored by hand, takes the stored copy's place. Files whose original folder isn't
 * linked, or whose original path holds another file, are left out.
 */
export const startFileMoveBack = makeAction(async ({ fileIds }: { fileIds: string[] }) => {
  const uniqueIds = [...new Set(fileIds)];

  return startJob({
    fileIds: uniqueIds,
    label: "Move Back",
    run: async (job) => {
      let keptCount = 0;
      let movedCount = 0;

      try {
        await assertMediaPathIndexesReady();

        // Moves an earlier attempt cut short finish before these files are looked at again.
        const settledIds = await settleUnfinishedMoveBacks(uniqueIds);
        const files = (await listExportFiles(uniqueIds)).filter((file) => !settledIds.has(file.id));
        const foundIds = new Set(files.map((file) => file.id));

        movedCount += settledIds.size;
        job.complete(uniqueIds.filter((fileId) => !foundIds.has(fileId)));

        for (const file of files) {
          job.signal.throwIfAborted();
          job.report({ item: getOriginalPath(file) });

          try {
            const { isCleanupKept, isMovedBack } = await workSignal.run(job.signal, () =>
              moveBack(file),
            );

            if (isMovedBack) movedCount++;

            if (isCleanupKept) keptCount++;
          } catch (error) {
            job.signal.throwIfAborted();
            addFileFailure(job, "Move Back", getOriginalPath(file), error);
          }

          job.complete([file.id]);
        }
      } finally {
        // Moves a stop or a failed save left unfinished finish now, rather than after a restart.
        try {
          await settleUnfinishedMoveBacks(uniqueIds);
        } catch (error) {
          fileLog(`[Move Back] Unfinished moves left for recovery: ${error.message}`, {
            type: "error",
          });
        }

        job.report({
          item: "",
          message: [
            `${Fmt.commas(movedCount)} files moved back`,
            keptCount && `${Fmt.commas(keptCount)} stored copies kept for a later cleanup`,
          ]
            .filter(Boolean)
            .join(" · "),
        });

        // Cleanups a stop paused are picked up by the queue.
        runFileCleanupQueue();
      }
    },
    type: "moveFilesBack",
  });
});

/* -------------------------------------------------------------------------- */
/*                                  RECOVERY                                  */
/* -------------------------------------------------------------------------- */
/**
 * Finishes move backs a restart cut short, leaving those a running move back still holds. Each file
 * stays locked while it settles, so no move back starts on it meanwhile. Ones that can't finish are
 * reported and tried again on the next start.
 */
makeBackgroundOperationRunner("move back recovery", async () => {
  const owner = { id: "move-back-recovery", label: "Move Back Recovery" };
  let failedCount = 0;

  for (const operation of await FileOperationModel.find({
    kind: "moveBack",
    state: "PREPARED",
  }).lean()) {
    if (!canRunBackgroundQueues()) return;

    if (!getForeignFileLock(operation.fileId)) {
      lockFiles(owner, [operation.fileId]);

      try {
        await settleMoveBack(operation);
      } catch (error) {
        failedCount++;
        logFileError("Move Back", operation.outputPath, error);
      } finally {
        unlockFiles(owner.id, [operation.fileId]);
      }
    }
  }

  if (failedCount)
    throw new Error(`${Fmt.commas(failedCount)} move backs couldn't finish yet; see the log.`);
});
