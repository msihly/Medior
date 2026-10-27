import fs from "fs/promises";
import path from "path";
import * as models from "medior/_generated/server/models";
import { extendFileName } from "trabecula/utils/server";
import { deleteFiles, relinkFiles } from "medior/server/database/actions/files";
import {
  assertMediaPathIndexesReady,
  describeFileCleanupBySize,
  FileCleanup,
  FileOperationModel,
  finishFileOperation,
} from "medior/server/database/file-operations";
import { mediaPathKey } from "medior/server/database/media-paths";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { makeRepairReporter } from "medior/server/database/repair-progress";
import { chunkArray, CONSTANTS, Fmt, getSubtitleFilePaths } from "medior/utils/common";
import { getConfig, getIsActiveScratchPath, makeAction } from "medior/utils/server";
import { hashMediaFile } from "medior/utils/server/media-output";
import { runConcurrent } from "medior/utils/server/work-signal";

type StorageRecord = Pick<models.FileSchema, "hash" | "path" | "thumb"> & { _id: unknown };

type StorageRecovery = {
  hash: string;
  id: string;
  missingFile: boolean;
  missingThumb: boolean;
  path: string;
  thumbPath: string;
};

const DIRECTORY_BUFFER_SIZE = 4096;

let isScanningStorage = false;

const getOwnedStoragePaths = async (paths: string[]) => {
  const keys = paths.map(mediaPathKey);
  const subtitleKeys = paths
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".sub")
    .map((filePath) => mediaPathKey(extendFileName(filePath, "idx")));

  // Transforms, unfinished imports, and pending cleanups own their outputs as the library does.
  const [files, transforms, operations] = await Promise.all([
    models.FileModel.find({
      $or: [
        { pathKey: { $in: keys, $type: "string" } },
        { "subtitles.pathKey": { $in: [...keys, ...subtitleKeys], $type: "string" } },
        { thumbPathKey: { $in: keys, $type: "string" } },
      ],
    })
      .select({ path: 1, "subtitles.ext": 1, "subtitles.path": 1, "thumb.path": 1 })
      .lean(),
    models.FileTransformModel.find({
      $or: [
        { afterPathKey: { $in: keys, $type: "string" } },
        { beforePathKey: { $in: keys, $type: "string" }, cleanupPending: true },
        { outputTempPathKey: { $in: keys, $type: "string" } },
      ],
    })
      .select({ afterPath: 1, beforePath: 1, cleanupPending: 1, outputTempPath: 1 })
      .lean(),
    FileOperationModel.find({
      $or: [
        { "cleanup.pathKey": { $in: keys }, state: "COMMITTED" },
        { contentPathKey: { $in: keys, $type: "string" }, state: "PREPARED" },
        { outputPathKey: { $in: keys, $type: "string" }, state: "PREPARED" },
        { tempPathKey: { $in: keys, $type: "string" } },
        { thumbPathKey: { $in: keys, $type: "string" }, state: "PREPARED" },
      ],
    })
      .select({ cleanup: 1, contentPath: 1, outputPath: 1, state: 1, tempPath: 1, thumbPath: 1 })
      .lean(),
  ]);

  return new Set(
    [
      ...files.flatMap((file) => [
        file.path,
        file.thumb?.path,
        ...getSubtitleFilePaths(file.subtitles),
      ]),
      ...transforms.flatMap((transform) => [
        transform.afterPath,
        transform.cleanupPending ? transform.beforePath : null,
        transform.outputTempPath,
      ]),
      ...operations.flatMap((operation) => [
        ...(operation.state === "COMMITTED" ? operation.cleanup.map((file) => file.path) : []),
        ...(operation.state === "PREPARED"
          ? [operation.contentPath, operation.outputPath, operation.thumbPath]
          : []),
        operation.tempPath,
      ]),
    ]
      .filter(Boolean)
      .map(mediaPathKey),
  );
};

const isStoredFile = async (filePath?: string) => {
  let exists = false;

  if (filePath) {
    try {
      exists = (await fs.stat(filePath)).isFile();
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }

  return exists;
};

const readStorageDirectory = async (directory: string, signal: AbortSignal) => {
  const files = new Set<string>();
  const links = new Set<string>();

  try {
    const handle = await fs.opendir(directory, { bufferSize: DIRECTORY_BUFFER_SIZE });

    for await (const entry of handle) {
      signal.throwIfAborted();

      if (entry.isFile()) files.add(entry.name.toLowerCase());
      else if (entry.isSymbolicLink()) links.add(entry.name.toLowerCase());
    }
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  }

  return { files, links };
};

/** Deletes storage files no record owns, in batches of 200 that each keep their own progress. */
export const deleteUntrackedStorageFiles = makeAction(
  async ({ paths, repairId }: { paths: string[]; repairId: string }) => {
    const { checkCancelled, report, run, signal } = makeRepairReporter(
      repairId,
      "deleteUntrackedStorageFiles",
    );

    return run(async () => {
      const removedPaths: string[] = [];

      for (const batch of chunkArray(paths, 200)) {
        checkCancelled();

        await withMetadataMutation(async () => {
          const ownedPaths = await getOwnedStoragePaths(batch);
          const untrackedPaths: string[] = [];

          await runConcurrent(
            batch,
            CONSTANTS.FILE.IO_CONCURRENCY,
            async (filePath) => {
              checkCancelled();

              if (!(await isStoredFile(filePath))) removedPaths.push(filePath);
              else if (!ownedPaths.has(mediaPathKey(filePath))) untrackedPaths.push(filePath);
            },
            signal,
          );

          if (untrackedPaths.length) {
            checkCancelled();

            const cleanup: FileCleanup[] = [];

            // Cleanup confirms each file by its size, so files aren't read while metadata waits.
            for (const filePath of untrackedPaths) {
              const entry = await describeFileCleanupBySize(filePath);

              if (entry) cleanup.push(entry);
            }

            if (cleanup.length) {
              checkCancelled();

              const operation = await FileOperationModel.create({ cleanup, state: "COMMITTED" });

              await finishFileOperation(operation._id);
            }

            checkCancelled();

            await runConcurrent(
              untrackedPaths,
              CONSTANTS.FILE.IO_CONCURRENCY,
              async (filePath) => {
                if (!(await isStoredFile(filePath))) removedPaths.push(filePath);
              },
              signal,
            );
          }
        });

        report(
          `Removed ${Fmt.commas(removedPaths.length)} untracked files of ${Fmt.commas(paths.length)}.`,
          "progress",
        );
      }

      return { removedPaths, retainedCount: paths.length - removedPaths.length };
    });
  },
);

/**
 * Deletes records whose media is missing, in batches of 200. Each record stays locked until its
 * batch is checked.
 */
export const removeMissingStorageRecords = makeAction(
  async ({ fileIds, repairId }: { fileIds: string[]; repairId: string }) => {
    const { checkCancelled, lock, report, run, signal, unlock } = makeRepairReporter(
      repairId,
      "removeMissingStorageRecords",
    );

    return run(async () => {
      let removedCount = 0;
      let retainedCount = 0;

      lock(fileIds);

      for (const batch of chunkArray(fileIds, 200)) {
        checkCancelled();

        await withMetadataMutation(async () => {
          const files = await models.FileModel.find({ _id: { $in: batch } })
            .select({ path: 1 })
            .lean();

          const missingIds: string[] = [];

          await runConcurrent(
            files,
            CONSTANTS.FILE.IO_CONCURRENCY,
            async (file) => {
              checkCancelled();

              if (!(await isStoredFile(file.path))) missingIds.push(String(file._id));
            },
            signal,
          );

          if (missingIds.length) {
            checkCancelled();

            // Missing media was lost, not rejected, so its content is not marked deleted.
            const result = await deleteFiles({ fileIds: missingIds, withDeletedHashes: false });

            if (!result.success) throw new Error(result.error);
          }

          removedCount += missingIds.length;
          retainedCount += files.length - missingIds.length;
        });

        unlock(batch);
        report(
          `Removed ${Fmt.commas(removedCount)} missing records; retained ${Fmt.commas(retainedCount)} records whose files are now present.`,
          "progress",
        );
      }

      return { removedCount, retainedCount };
    });
  },
);

export const scanFileStorage = makeAction(async ({ repairId }: { repairId: string }) => {
  if (isScanningStorage) throw new Error("A file storage scan is already running.");

  const { checkCancelled, lock, progress, report, run, signal, unlock } = makeRepairReporter(
    repairId,
    "scanFileStorage",
  );

  isScanningStorage = true;

  try {
    return await run(async () => {
      await assertMediaPathIndexesReady();

      const locations: string[] = [];

      for (const location of getConfig().db.fileStorage.locations) {
        checkCancelled();

        const resolved = path.resolve(location);
        const stats = await fs.stat(resolved);

        if (!stats.isDirectory())
          throw new Error(`Storage location is not a directory: ${location}`);

        if (!locations.some((existing) => mediaPathKey(existing) === mediaPathKey(resolved)))
          locations.push(resolved);
      }

      if (!locations.length) throw new Error("No file storage locations are configured.");

      lock(
        (await models.FileModel.find().select({ _id: 1 }).lean()).map((file) => String(file._id)),
      );

      const candidates: StorageRecovery[] = [];
      const directories = new Map<string, Awaited<ReturnType<typeof readStorageDirectory>>>();
      const matches = new Map<string, string | null>();
      const scanStartedAt = Date.now();
      let inspected = 0;

      const reportInspected = () => {
        const rate = Math.round((inspected * 1000) / Math.max(1, Date.now() - scanStartedAt));

        progress(
          `Storage scan: checked ${inspected.toLocaleString()} records at ${rate.toLocaleString()} records/s; ${candidates.length.toLocaleString()} need recovery.`,
        );
      };

      const inspectRecords = async (files: StorageRecord[]) => {
        const groupedPaths = new Map<string, { directory: string; paths: Set<string> }>();
        const lastFile = files[files.length - 1];
        const retainedKeys = new Set(
          [lastFile?.path, lastFile?.thumb?.path]
            .filter(Boolean)
            .map((filePath) => mediaPathKey(path.dirname(path.resolve(filePath)))),
        );
        const retainedDirectories = new Map<
          string,
          Awaited<ReturnType<typeof readStorageDirectory>>
        >();
        const storedPaths = new Set<string>();

        for (const file of files) {
          checkCancelled();

          for (const filePath of [file.path, file.thumb?.path].filter(Boolean)) {
            const resolved = path.resolve(filePath);
            const directory = path.dirname(resolved);
            const key = mediaPathKey(directory);

            if (!groupedPaths.has(key)) groupedPaths.set(key, { directory, paths: new Set() });

            groupedPaths.get(key).paths.add(resolved);
          }
        }

        progress(
          `Storage scan: checking ${files.length.toLocaleString()} records across ${groupedPaths.size.toLocaleString()} folders; ${inspected.toLocaleString()} records already checked.`,
        );

        await runConcurrent(
          [...groupedPaths],
          CONSTANTS.FILE.IO_CONCURRENCY,
          async ([key, { directory, paths }]) => {
            checkCancelled();

            const entries = directories.get(key) ?? (await readStorageDirectory(directory, signal));

            for (const filePath of paths) {
              checkCancelled();

              const name = path.basename(filePath).toLowerCase();

              if (
                entries.files.has(name) ||
                (entries.links.has(name) && (await isStoredFile(filePath)))
              )
                storedPaths.add(mediaPathKey(filePath));
            }

            // Reuse the trailing media/thumbnail folders across record batches.
            if (retainedKeys.has(key)) retainedDirectories.set(key, entries);
          },
          signal,
        );

        directories.clear();

        for (const [key, entries] of retainedDirectories) directories.set(key, entries);

        const foundIds: string[] = [];

        for (const file of files) {
          checkCancelled();

          const missingFile = !storedPaths.has(mediaPathKey(file.path));
          const missingThumb = !storedPaths.has(mediaPathKey(file.thumb?.path));

          if (!missingFile && !missingThumb) foundIds.push(String(file._id));
          else {
            candidates.push({
              hash: file.hash,
              id: String(file._id),
              missingFile,
              missingThumb,
              path: file.path,
              thumbPath: file.thumb?.path,
            });

            if (missingFile && file.path)
              matches.set(path.basename(file.path).toLowerCase(), undefined);

            if (missingThumb) {
              if (file.thumb?.path)
                matches.set(path.basename(file.thumb.path).toLowerCase(), undefined);

              if (file.hash) matches.set(`${file.hash}-thumb.jpg`.toLowerCase(), undefined);
            }
          }
        }

        // Records found in place need nothing more; the rest stay locked until resolved.
        unlock(foundIds);
        inspected += files.length;
        reportInspected();
      };

      report("Checking recorded paths against directory listings.");
      reportInspected();

      // The path index groups neighboring files to reuse their directory listing.
      // Unindexed path keys are scanned separately so no records are skipped.
      for (const hasPath of [true, false]) {
        const cursor = models.FileModel.find({
          pathKey: hasPath ? { $type: "string" } : { $not: { $type: "string" } },
        })
          .select({ hash: 1, path: 1, "thumb.path": 1 })
          .sort(hasPath ? { pathKey: 1 } : {})
          .lean()
          .cursor({ batchSize: 2000 });

        const records: StorageRecord[] = [];

        try {
          for await (const file of cursor) {
            checkCancelled();
            records.push(file);

            if (records.length >= 2000) {
              await inspectRecords(records);
              records.length = 0;
            }
          }

          if (records.length) await inspectRecords(records);
        } finally {
          await cursor.close();
        }
      }

      directories.clear();
      reportInspected();

      report(
        `Found ${candidates.length.toLocaleString()} records with missing media or thumbnails.`,
      );

      const filesLeftInStorageOnly = new Map<string, string>();
      const pendingDirectories: string[] = [];
      const pendingPaths: string[] = [];
      let ownershipCheck = Promise.resolve();
      let scanned = 0;

      const findStorageOnly = async () => {
        if (pendingPaths.length) {
          const paths = pendingPaths.splice(0);

          // Directory workers share bounded batches; ownership reads remain serialized.
          ownershipCheck = ownershipCheck.then(async () => {
            checkCancelled();

            const ownedKeys = await getOwnedStoragePaths(paths);

            for (const filePath of paths) {
              if (!ownedKeys.has(mediaPathKey(filePath)))
                filesLeftInStorageOnly.set(mediaPathKey(filePath), filePath);
            }
          });

          await ownershipCheck;
        }
      };

      const scanDirectory = async (directory: string) => {
        checkCancelled();

        const handle = await fs.opendir(directory, { bufferSize: DIRECTORY_BUFFER_SIZE });

        for await (const entry of handle) {
          checkCancelled();

          const filePath = path.join(directory, entry.name);

          if (entry.isDirectory()) {
            if (!getIsActiveScratchPath(filePath)) pendingDirectories.push(filePath);
          } else if (entry.isFile()) {
            const name = entry.name.toLowerCase();

            if (matches.has(name)) {
              const previous = matches.get(name);

              if (previous === undefined) matches.set(name, filePath);
              else if (previous && mediaPathKey(previous) !== mediaPathKey(filePath))
                matches.set(name, null);
            }

            if (!/-thumb(-\d+)?\.\w+$/i.test(entry.name) && !getIsActiveScratchPath(filePath)) {
              pendingPaths.push(filePath);

              if (pendingPaths.length >= 1000) await findStorageOnly();
            }

            scanned++;

            if (scanned % 1000 === 0)
              progress(
                `Storage scan: searched ${scanned.toLocaleString()} files for recovery candidates.`,
              );
          }
        }
      };

      // Omit nested roots so every storage tree is searched only once.
      const roots = locations.filter(
        (location) =>
          !locations.some((other) => {
            const relative = path.relative(other, location);

            return (
              relative &&
              !path.isAbsolute(relative) &&
              relative !== ".." &&
              !relative.startsWith(`..${path.sep}`)
            );
          }),
      );

      for (const location of roots) {
        report(`Searching file storage: ${location}`);
        progress(`Storage scan: searching ${location}.`);
        pendingDirectories.push(location);

        while (pendingDirectories.length) {
          checkCancelled();

          await runConcurrent(
            pendingDirectories.splice(-CONSTANTS.FILE.IO_CONCURRENCY),
            CONSTANTS.FILE.IO_CONCURRENCY,
            scanDirectory,
            signal,
          );
        }
      }

      await findStorageOnly();

      const claimedPaths = new Set<string>();
      const fileIdsLeftInDbOnly: string[] = [];
      const matchPaths = [...matches.values()].filter(Boolean);
      const occupiedPaths = new Set<string>();
      const pendingRelinks: Parameters<typeof relinkFiles>[0]["filesToRelink"] = [];
      let recoveredFiles = 0;
      let recoveredThumbs = 0;
      let unresolvedThumbs = 0;

      for (let index = 0; index < matchPaths.length; index += 1000) {
        checkCancelled();

        const ownedKeys = await getOwnedStoragePaths(matchPaths.slice(index, index + 1000));

        for (const key of ownedKeys) occupiedPaths.add(key);
      }

      const flushRelinks = async () => {
        checkCancelled();

        if (pendingRelinks.length) {
          const res = await relinkFiles({ filesToRelink: pendingRelinks });

          if (!res.success) throw new Error(res.error);

          pendingRelinks.length = 0;
        }
      };

      for (const [index, candidate] of candidates.entries()) {
        checkCancelled();

        let recoveredPath: string;
        let recoveredThumbPath: string;

        if (candidate.missingFile && candidate.path && candidate.hash) {
          const match = matches.get(path.basename(candidate.path).toLowerCase());

          if (
            match &&
            !claimedPaths.has(mediaPathKey(match)) &&
            !occupiedPaths.has(mediaPathKey(match))
          ) {
            try {
              if (
                (await hashMediaFile(match, signal)).toLowerCase() === candidate.hash.toLowerCase()
              )
                recoveredPath = match;
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
          }
        }

        if (candidate.missingThumb) {
          const match =
            (candidate.thumbPath &&
              matches.get(path.basename(candidate.thumbPath).toLowerCase())) ||
            matches.get(`${candidate.hash}-thumb.jpg`.toLowerCase());

          if (
            match &&
            !claimedPaths.has(mediaPathKey(match)) &&
            !occupiedPaths.has(mediaPathKey(match))
          )
            recoveredThumbPath = match;
        }

        if (recoveredPath || recoveredThumbPath) {
          const keys = [recoveredPath, recoveredThumbPath].filter(Boolean).map(mediaPathKey);

          pendingRelinks.push({
            expectedHash: candidate.hash,
            expectedPath: candidate.path,
            expectedThumbPath: candidate.thumbPath ?? null,
            id: candidate.id,
            path: recoveredPath ?? candidate.path,
            thumbPath: recoveredThumbPath ?? candidate.thumbPath ?? null,
          });

          for (const key of keys) {
            claimedPaths.add(key);
            filesLeftInStorageOnly.delete(key);
          }
        }

        if (candidate.missingFile) {
          if (recoveredPath) recoveredFiles++;
          else fileIdsLeftInDbOnly.push(candidate.id);
        }

        if (candidate.missingThumb) {
          if (recoveredThumbPath) recoveredThumbs++;
          else unresolvedThumbs++;
        }

        if (pendingRelinks.length >= 250) await flushRelinks();

        if (index % 250 === 0)
          progress(
            `Storage scan: resolved ${(index + 1).toLocaleString()} / ${candidates.length.toLocaleString()} candidates; recovered ${recoveredFiles.toLocaleString()} media paths and ${recoveredThumbs.toLocaleString()} thumbnail paths.`,
          );
      }

      await flushRelinks();

      report(
        `Recovered ${recoveredFiles.toLocaleString()} media paths and ${recoveredThumbs.toLocaleString()} thumbnail paths. ${fileIdsLeftInDbOnly.length.toLocaleString()} media files and ${unresolvedThumbs.toLocaleString()} thumbnails remain unresolved.`,
        "success",
      );

      if (fileIdsLeftInDbOnly.length || unresolvedThumbs)
        report(
          "Unresolved paths were retained. Review missing records and untracked files in the Storage Reconciliation results below. Thumbnail repair can regenerate missing thumbnails from available originals.",
        );

      return {
        fileIdsLeftInDbOnly,
        filesLeftInStorageOnly: [...filesLeftInStorageOnly.values()],
        recoveredFiles,
        recoveredThumbs,
        unresolvedThumbs,
      };
    });
  } finally {
    isScanningStorage = false;
  }
});
