import fs from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { extendFileName, fileLog } from "trabecula/utils/server";
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
import { isServerStopping, serverShutdownSignal } from "medior/server/process-lifecycle";
import { genFileInfo, isGeneratedMediaUnreadable } from "medior/utils/client/files";
import {
  dayjs,
  FileImportSidecar,
  hasTranscription,
  normalizeTimestampPairs,
} from "medior/utils/common";
import {
  getAvailableFileStorage,
  getConfig,
  getIsVideo,
  leanModelToJson,
  socket,
} from "medior/utils/server";
import {
  copyMediaFile,
  hashMediaFile,
  publishMediaOutput,
  recoverMediaOutput,
  syncMediaFile,
} from "medior/utils/server/media-output";
import { waitForWork, workSignal } from "medior/utils/server/work-signal";

export interface MediaImportInput {
  batchId?: string;
  dateCreated?: string;
  deleteOnImport: boolean;
  diffusionParams?: string;
  ext: string;
  ignorePrevDeleted: boolean;
  originalName: string;
  originalPath: string;
  /** Batch root, within which folders emptied by deleting this source are removed. */
  rootFolderPath?: string;
  sidecar?: FileImportSidecar;
  size: number;
  tagIds: string[];
}

const activeImportHashes = new Map<string, Promise<void>>();
const activeImports = new Set<string>();
let importStorage: { bytesLeft: number; location: string };
let importStorageCheck: Promise<{ bytesLeft: number; location: string }>;

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

const getImportOperationId = (args: MediaImportInput) =>
  args.batchId
    ? createHash("sha256").update(`${args.batchId}\0${args.originalPath}`).digest("hex")
    : randomUUID();

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
  while (true) {
    if (
      importStorage &&
      getConfig().db.fileStorage.locations.includes(importStorage.location) &&
      importStorage.bytesLeft - 500000 > size
    ) {
      importStorage.bytesLeft -= size;

      return importStorage.location;
    }

    importStorage = null;

    const storage = await (importStorageCheck ??= getAvailableFileStorage(size)
      .then((result) => {
        if (!result.success) throw new Error(result.error);

        importStorage = result.data;

        return importStorage;
      })
      .finally(() => {
        importStorageCheck = null;
      }));

    if (!getConfig().db.fileStorage.locations.includes(storage.location)) continue;

    if (storage.bytesLeft <= size) continue;

    storage.bytesLeft -= size;

    return storage.location;
  }
};

export const importMedia = async (args: MediaImportInput, operationId?: string) => {
  if (isServerStopping()) throw new Error("Importer is shutting down");

  await assertMediaPathIndexesReady();

  socket.emitReliable("onFileImportStarted", { filePath: args.originalPath });

  const id = operationId ?? getImportOperationId(args);

  if (activeImports.has(id)) throw new Error("This file import is already active");

  activeImports.add(id);

  let releaseHash: () => void;
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
    socket.emit("onFileImportProgress", {
      batchId: args.batchId,
      elapsed: Math.floor((performance.now() - startedAt) / 1000),
      filePath: args.originalPath,
      message,
      progress,
    });

  const progressTimer = getIsVideo(args.ext) ? setInterval(emitProgress, 1000) : null;

  if (progressTimer) emitProgress();

  const recordTiming = (stage: string) => {
    const now = performance.now();

    timings.push(`${stage}: ${Math.round(now - stageStartedAt)}ms`);
    stageStartedAt = now;
  };

  try {
    let operation: FileOperation = await FileOperationModel.findById(id).lean();

    recordTiming("recovery lookup");

    if (operation?.outputHash) {
      releaseHash = await acquireImportHash(operation.outputHash);
      checkBackgroundExecution();
    }

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

    reportProgress("Calculating checksum.", 0);

    const hash = await hashMediaFile(args.originalPath, workSignal.getStore(), (bytes) =>
      reportProgress(
        "Calculating checksum.",
        args.size > 0 ? Math.min(100, (bytes / args.size) * 100) : undefined,
      ),
    );

    reportProgress("Checking for duplicates.");
    recordTiming("source checksum");

    if (!releaseHash) releaseHash = await acquireImportHash(hash);

    checkBackgroundExecution();

    const duplicate = await models.FileModel.findOne({ hash })
      .select("-tagIdsWithAncestors")
      .lean();

    const ignored =
      !duplicate && args.ignorePrevDeleted && !!(await models.DeletedFileModel.exists({ hash }));

    recordTiming("duplicate lookup");

    if (operation?.outputHash && operation.outputHash !== hash)
      throw new Error("Import source changed; the prepared output has been retained");

    if (!operation?.outputHash) {
      const storage = duplicate || ignored ? null : await reserveImportStorage(args.size);

      const outputPath =
        duplicate || ignored
          ? null
          : path.join(
              storage,
              hash.slice(0, 2),
              hash.slice(2, 4),
              `${hash}-${randomUUID()}.${args.ext}`,
            );

      const tempPath = outputPath ? `${outputPath}.${id}.tmp` : null;

      const thumbPath =
        outputPath && !duplicate
          ? path.join(path.dirname(outputPath), `${path.parse(outputPath).name}-thumb.jpg`)
          : null;

      operation = {
        _id: id,
        batchId: args.batchId,
        cleanup: [],
        importInput: args,
        kind: "import",
        outputHash: hash,
        outputPath,
        sourcePath: args.originalPath,
        state: "PREPARED",
        tempPath,
        thumbPath,
      };

      await prepareMediaImport(operation);
    }

    recordTiming("durable intent");

    if (!ignored && !duplicate) {
      if (!operation.outputPath)
        throw new Error("Import eligibility changed; cancel and requeue this import");

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
        await fs.mkdir(path.dirname(operation.outputPath), { recursive: true });
        reportProgress("Copying media.", 0);
        await copyMediaFile(args.originalPath, operation.tempPath, true, (bytes) =>
          reportProgress(
            "Copying media.",
            args.size > 0 ? Math.min(100, (bytes / args.size) * 100) : undefined,
          ),
        );

        reportProgress("Verifying and saving media.");

        await publishMediaOutput({
          hash,
          path: operation.outputPath,
          tempPath: operation.tempPath,
        });
      }
    }

    recordTiming("publish media");

    const outputPaths = [operation.outputPath, operation.thumbPath];

    if (!duplicate && !ignored) {
      const thumbPath =
        operation.thumbPath ??
        path.join(path.dirname(operation.outputPath), `${hash}-${id}-thumb.jpg`);

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
            onProgress: reportProgress,
            thumbId: path.basename(operation.thumbPath).replace(/-thumb\.jpg$/, ""),
            signal: workSignal.getStore(),
            skipAudio: true,
          })
        : null;

    if (info && isGeneratedMediaUnreadable(info))
      throw new Error("Imported media could not be read; source retained");

    if (info?.thumb?.path) await syncMediaFile(info.thumb.path);

    if (info?.thumb?.path && info.thumb.path !== operation.thumbPath)
      await FileOperationModel.updateOne({ _id: id }, { thumbPath: info.thumb.path });

    recordTiming("metadata and thumbnail");

    reportProgress("Preparing source cleanup.");

    const cleanup = [];

    if (args.deleteOnImport) {
      for (const sourcePath of [
        args.originalPath,
        extendFileName(args.originalPath, "json"),
        ...(args.diffusionParams ? [extendFileName(args.originalPath, "txt")] : []),
      ]) {
        // Persist the expected source checksum; cleanup verifies it and that the retained copy exists.
        const file =
          sourcePath === args.originalPath
            ? makeFileCleanup(hash, sourcePath)
            : await describeFileCleanup(sourcePath);

        if (file) cleanup.push(file);
      }
    }

    const unusedOutput = [];

    for (const outputPath of new Set([...outputPaths, info?.thumb?.path])) {
      if (!outputPath || mediaPathKey(outputPath) === mediaPathKey(args.originalPath)) continue;

      const entry =
        outputPath === operation.outputPath
          ? makeFileCleanup(hash, outputPath)
          : await describeFileCleanup(outputPath);

      if (entry) unusedOutput.push(entry);
    }

    recordTiming("prepare cleanup");

    const importResult = { cleanup, ignored, info, unusedOutput };

    reportProgress("Saving file and tag metadata.");

    return await commitMediaImport(args, operation, importResult, recordTiming);
  } finally {
    if (progressTimer) clearInterval(progressTimer);

    releaseHash?.();
    activeImports.delete(id);

    if (performance.now() - startedAt >= 250)
      fileLog(
        `[Import ${id}] ${Math.round(performance.now() - startedAt)}ms; ${timings.join("; ")}`,
      );
  }
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

  if (!(prepared ?? operation.importResult))
    throw new Error("Import output is not ready to commit");

  const hash = operation.outputHash;
  const { audio, cleanup, ignored, info, unusedOutput } = prepared ?? operation.importResult;

  let file = leanModelToJson<models.FileSchema>(await models.FileModel.findOne({ hash }).lean());

  recordTiming("file lookup");

  const status: "COMPLETE" | "DELETED" | "DUPLICATE" =
    file && file.path !== operation.outputPath ? "DUPLICATE" : ignored ? "DELETED" : "COMPLETE";

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
      rating: args.sidecar?.rating,
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
      socket.emit("onFilesUpdated", { fileIds: [file.id], updates: { isArchived: true } });
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
  }

  if (file && audio) {
    await models.FileModel.updateOne(
      { _id: file.id, hash },
      { peakDecibels: audio.peakDecibels, waveformPeaks: audio.waveformPeaks },
    );

    socket.emit("onFilesUpdated", {
      fileIds: [file.id],
      updates: { peakDecibels: audio.peakDecibels, waveformPeaks: audio.waveformPeaks },
    });
  }

  if (
    file &&
    getIsVideo(file.ext) &&
    file.audioCodec &&
    file.audioCodec !== "None" &&
    (!file.waveformPeaks?.length || file.peakDecibels == null) &&
    !audio
  ) {
    const { queueImportedAudio } = await import("medior/server/database/import-audio");

    await queueImportedAudio(file.id);
  }

  recordTiming("file metadata");

  await updateBatchImport(args, { file, hash, status });
  recordTiming("import progress");

  const retainedPaths = [file?.path, file?.thumb?.path].filter(Boolean).map(mediaPathKey);

  const committedCleanup = [...cleanup, ...operation.cleanup, ...unusedOutput]
    .filter((entry) => !retainedPaths.includes(entry.pathKey))
    .map((entry) =>
      file && (entry.path === args.originalPath || entry.path === operation.outputPath)
        ? { ...entry, retainedPath: file.path }
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
        const cleanup = [...operation.cleanup];

        for (const outputPath of [operation.outputPath, operation.thumbPath]) {
          if (!outputPath || mediaPathKey(outputPath) === mediaPathKey(operation.sourcePath))
            continue;

          const file = await describeFileCleanup(outputPath);

          if (file) cleanup.push(file);
        }

        await FileOperationModel.updateOne(
          { _id: operation._id, state: "PREPARED" },
          { cleanup, state: "COMMITTED" },
        );

        await finishFileOperation(operation._id);
      }
    } catch (error) {
      await FileOperationModel.updateOne({ _id: operation._id }, { error: error.message });
      console.error("Direct import retained for recovery:", error);
    }
  }
};
