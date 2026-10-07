import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import * as actions from "medior/server/database/actions";
import {
  assertMediaPathIndexesReady,
  assertMediaPathsAvailable,
  describeFileCleanup,
  FileOperationModel,
  finishFileOperation,
} from "medior/server/database/file-operations";
import { metadataWriteOptions } from "medior/server/database/metadata-work";
import { genFileInfo, isGeneratedMediaUnreadable } from "medior/utils/client/files";
import { dayjs } from "medior/utils/common";
import { getNtfsFileIdentity, leanModelToJson, socket } from "medior/utils/server";
import {
  copyMediaFile,
  hashMediaFile,
  publishMediaOutput,
  recoverMediaOutput,
  syncMediaFile,
} from "medior/utils/server/media-output";

const activeRepairs = new Set<string>();

export const repairThumbnail = async (
  file: models.FileSchema,
  skipThumbs = false,
  legacyPaths: string[] = [],
  refresh?: Pick<
    Parameters<typeof genFileInfo>[0],
    "onProgress" | "signal" | "withTranscription" | "withWaveform"
  >,
) => {
  if (activeRepairs.has(file.id)) throw new Error("This thumbnail is already being repaired");

  activeRepairs.add(file.id);

  try {
    await assertMediaPathIndexesReady();

    let operation = await FileOperationModel.findOne({ fileId: file.id, kind: "thumbnail" }).lean();

    if (operation?.thumbnailInput) {
      legacyPaths = [...new Set([...operation.thumbnailInput.legacyPaths, ...legacyPaths])];

      if (operation.thumbnailInput.refresh)
        refresh = {
          withTranscription: operation.thumbnailInput.withTranscription,
          withWaveform: operation.thumbnailInput.withWaveform,
          ...refresh,
        };
    }

    if (operation?.state === "COMMITTED") {
      await finishFileOperation(operation._id);

      const current = await models.FileModel.findById(file.id).lean();

      if (!current) throw new Error("Repaired file no longer exists");

      return leanModelToJson<models.FileSchema>(current);
    }

    if (
      operation &&
      (operation.sourcePath !== file.path ||
        operation.sourceHash !== file.hash ||
        (operation.sourceModified !== file.dateModified &&
          file.thumb?.path !== operation.outputPath))
    ) {
      const cleanup = [];

      if (operation.tempPath) {
        for (const ownedPath of [operation.outputPath, operation.tempPath]) {
          const entry = await describeFileCleanup(ownedPath);

          if (entry) cleanup.push(entry);
        }
      }

      await FileOperationModel.updateOne(
        { _id: operation._id, state: "PREPARED" },
        { cleanup, state: "COMMITTED" },
      );

      await finishFileOperation(operation._id);
      operation = null;
    }

    if (!operation) {
      const id = randomUUID();

      operation = (
        await FileOperationModel.create({
          _id: id,
          cleanup: [],
          fileId: file.id,
          kind: "thumbnail",
          outputPath: path.join(
            path.dirname(file.path),
            `${skipThumbs ? file.hash : `${file.hash}-${id}`}-thumb.jpg`,
          ),
          sourceHash: file.hash,
          sourceModified: file.dateModified,
          sourcePath: file.path,
          state: "PREPARED",
          tempPath: skipThumbs
            ? null
            : path.join(path.dirname(file.path), `${file.hash}-${id}-pending-thumb.jpg`),
          thumbnailInput: {
            legacyPaths,
            refresh: !!refresh,
            withTranscription: refresh?.withTranscription,
            withWaveform: refresh?.withWaveform,
          },
        })
      ).toObject();
    }

    refresh?.signal?.throwIfAborted();

    const recovered = await recoverMediaOutput({
      hash: operation.outputHash,
      path: operation.outputPath,
      tempPath: operation.tempPath,
    });

    if (!recovered || (refresh && operation.outputMetadata?.size == null)) {
      if (
        !refresh &&
        legacyPaths.length === 1 &&
        operation.tempPath &&
        (await fs
          .stat(legacyPaths[0])
          .then(() => true)
          .catch((error) => {
            if (error.code !== "ENOENT") throw error;

            return false;
          }))
      ) {
        await copyMediaFile(legacyPaths[0], operation.tempPath);

        operation.outputMetadata = {
          thumb: {
            ...file.thumb,
            frameHeight: file.thumb?.frameHeight ?? (file.duration > 0 ? file.height : null),
            frameWidth: file.thumb?.frameWidth ?? (file.duration > 0 ? file.width : null),
            path: operation.tempPath,
          },
        };
      } else {
        const info = await genFileInfo({
          file,
          filePath: file.path,
          hash: file.hash,
          skipThumbs: !!recovered || !operation.tempPath,
          thumbId: recovered
            ? path.basename(operation.outputPath).replace(/-thumb\.jpg$/, "")
            : operation.tempPath
              ? `${file.hash}-${operation._id}-pending`
              : undefined,
          withTranscription: false,
          withWaveform: false,
          ...refresh,
        });

        if (isGeneratedMediaUnreadable(info))
          throw new Error(
            "Thumbnail generation could not read the source; original thumbnails retained",
          );

        operation.outputMetadata = refresh ? info : { thumb: info.thumb };
      }

      operation.outputHash = await hashMediaFile(
        recovered ? operation.outputPath : (operation.tempPath ?? operation.outputPath),
      );

      await FileOperationModel.updateOne(
        { _id: operation._id, state: "PREPARED" },
        { outputHash: operation.outputHash, outputMetadata: operation.outputMetadata },
      );

      if (operation.tempPath && !recovered)
        await publishMediaOutput({
          hash: operation.outputHash,
          path: operation.outputPath,
          tempPath: operation.tempPath,
        });
      else await syncMediaFile(operation.outputPath, operation.outputHash);
    }

    if (!operation.outputMetadata?.thumb)
      throw new Error("Prepared thumbnail metadata is missing; files retained");

    const identity = await getNtfsFileIdentity(operation.outputPath);
    const cleanup = [...operation.cleanup];

    for (const oldPath of [...new Set([file.thumb?.path, ...legacyPaths].filter(Boolean))]) {
      const entry = await describeFileCleanup(oldPath, operation.outputPath);

      if (entry) cleanup.push(entry);
    }

    await FileOperationModel.updateOne(
      { _id: operation._id, state: "PREPARED" },
      { $set: { cleanup } },
      metadataWriteOptions(),
    );

    refresh?.signal?.throwIfAborted();

    const current = await models.FileModel.findById(file.id).lean();

    if (
      !current ||
      current.hash !== file.hash ||
      current.dateModified !== file.dateModified ||
      current.path !== file.path ||
      current.thumb?.path !== file.thumb?.path
    )
      throw new Error("File changed during thumbnail repair; output retained for retry");

    await assertMediaPathsAvailable([operation.outputPath]);

    const updates = {
      ...operation.outputMetadata,
      dateModified: dayjs().toISOString(),
      thumb: {
        ...operation.outputMetadata.thumb,
        ntfsFileId: identity?.fileId,
        ntfsVolumeId: identity?.volumeId,
        path: operation.outputPath,
      },
    };

    const updated = await models.FileModel.findOneAndUpdate(
      {
        _id: file.id,
        dateModified: current.dateModified,
        hash: current.hash,
        path: current.path,
        "thumb.path": current.thumb?.path ?? null,
      },
      { $set: updates },
      { ...metadataWriteOptions(), new: true },
    ).lean();

    if (!updated)
      throw new Error("File changed during thumbnail repair; output retained for retry");

    socket.emit("onFileUpdated", { id: file.id, updates });

    if (legacyPaths.length || Object.prototype.hasOwnProperty.call(file, "thumbPaths"))
      await models.FileModel.updateOne(
        { _id: file.id },
        { $unset: { thumbPaths: 1 } },
        { strict: false },
      );

    await actions.queueTagMetadataRegen(current.tagIds.map(String));

    const collections = await actions.regenCollAttrs({ fileIds: [file.id] });

    if (!collections.success) throw new Error(collections.error);

    await FileOperationModel.updateOne(
      { _id: operation._id, state: "PREPARED" },
      { cleanup, state: "COMMITTED" },
    );

    const result = leanModelToJson<models.FileSchema>(updated);

    await finishFileOperation(operation._id);

    return result;
  } finally {
    activeRepairs.delete(file.id);
  }
};
