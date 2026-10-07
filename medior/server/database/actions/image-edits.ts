import fs from "fs/promises";
import path from "path";
import { FileCollectionModel, FileModel, FileSchema } from "medior/_generated/server/models";
import type { FormatEnum, Region } from "sharp";
import * as actions from "medior/server/database/actions";
import { runFileCleanupQueue } from "medior/server/database/actions/background-operations";
import {
  assertMediaPathsAvailable,
  describeFileCleanup,
  FileOperationModel,
} from "medior/server/database/file-operations";
import {
  getMetadataCreateId,
  metadataWriteOptions,
  readMetadataSnapshot,
  registerMetadataWork,
} from "medior/server/database/metadata-work";
import { genFileInfo, isGeneratedMediaUnreadable } from "medior/utils/client/files";
import { dayjs } from "medior/utils/common";
import {
  getIsAnimated,
  getIsImage,
  leanModelToJson,
  makeAction,
  socket,
} from "medior/utils/server";
import { runImageTask } from "medior/utils/server/image-task";
import { hashMediaFile, publishMediaOutput, syncMediaFile } from "medior/utils/server/media-output";

export interface ImageEditInput {
  crop?: Region;
  expectedHash: string;
  fileId: string;
  rotation?: -90 | 90;
  saveCopy?: boolean;
}

const loadEditableImage = async (fileId: string, expectedHash: string) => {
  const model = await FileModel.findById(fileId).lean();

  if (!model) throw new Error("Image not found.");

  const file = leanModelToJson<FileSchema>(model);

  if (!getIsImage(file.ext) || getIsAnimated(file.ext))
    throw new Error("Only still images can be edited.");

  if (file.hash !== expectedHash)
    throw new Error("Image changed. Reopen the editor and try again.");

  await syncMediaFile(file.path, expectedHash);

  return file;
};

export const loadImageEditPreview = makeAction(
  async ({ expectedHash, fileId }: { expectedHash: string; fileId: string }) => {
    const file = await loadEditableImage(fileId, expectedHash);
    const { metadata, preview } = await runImageTask({ input: file.path, preview: true });

    if ((metadata.pages ?? 1) > 1) throw new Error("Multi-page images cannot be edited.");

    return {
      height: metadata.height,
      src: `data:image/png;base64,${preview.toString("base64")}`,
      width: metadata.width,
    };
  },
);

export const editImage = makeAction(
  registerMetadataWork("editImage", async (args: ImageEditInput) => {
    if (Boolean(args.crop) === Boolean(args.rotation))
      throw new Error("Choose either a crop or a rotation.");

    if (args.rotation && ![-90, 90].includes(args.rotation))
      throw new Error("Rotation must be 90 degrees left or right.");

    const source = await readMetadataSnapshot("image-edit-source", async () => {
      const file = await loadEditableImage(args.fileId, args.expectedHash);
      const collections = await FileCollectionModel.find({ "fileIdIndexes.fileId": file.id })
        .select({ _id: 1 })
        .lean();

      return { ...file, collectionIds: collections.map(({ _id }) => String(_id)) };
    });
    const editId = getMetadataCreateId("image-edit").toString();
    const operationId = `image-edit:${editId}`;
    const ext = ["avif", "jpeg", "jpg", "png", "tif", "tiff", "webp"].includes(source.ext)
      ? source.ext
      : "png";

    const outputPath = path.join(path.dirname(source.path), `${editId}.${ext}`);
    const tempPath = path.join(path.dirname(source.path), `${editId}-pending.${ext}`);
    const thumbPath = path.join(path.dirname(source.path), `${editId}-thumb.jpg`);

    await FileOperationModel.updateOne(
      { _id: operationId },
      {
        $setOnInsert: {
          cleanup: [],
          kind: "transform",
          outputPath,
          sourceHash: source.hash,
          sourcePath: source.path,
          state: "PREPARED",
          tempPath,
          thumbPath,
        },
      },
      { ...metadataWriteOptions(), upsert: true },
    );

    const prepared = await readMetadataSnapshot("image-edit-output", async () => {
      await loadEditableImage(source.id, source.hash);

      const { metadata } = await runImageTask({ input: source.path });

      if ((metadata.pages ?? 1) > 1) throw new Error("Multi-page images cannot be edited.");

      if (args.crop) {
        const { height, left, top, width } = args.crop;
        const rotated = [5, 6, 7, 8].includes(metadata.orientation);
        const imageHeight = rotated ? metadata.width : metadata.height;
        const imageWidth = rotated ? metadata.height : metadata.width;

        if (
          ![height, left, top, width].every(Number.isSafeInteger) ||
          height < 1 ||
          width < 1 ||
          left < 0 ||
          top < 0 ||
          left + width > imageWidth ||
          top + height > imageHeight
        )
          throw new Error("Crop must stay within the image bounds.");
      }

      await runImageTask({
        edit: { crop: args.crop, rotation: args.rotation },
        format: (ext === "tif" ? "tiff" : ext) as keyof FormatEnum,
        input: source.path,
        outputPath: tempPath,
        quality: 95,
      });
      const hash = await hashMediaFile(tempPath);
      const fileId = args.saveCopy ? editId : source.id;
      const duplicate = await FileModel.exists({ _id: { $ne: fileId }, hash });

      if (duplicate) {
        await fs.rm(tempPath, { force: true });

        throw new Error("The edited image already exists. The original has been preserved.");
      }

      await syncMediaFile(source.path, source.hash);
      await publishMediaOutput({ hash, path: outputPath, tempPath });

      const info = await genFileInfo({
        filePath: outputPath,
        hash,
        skipAudio: true,
        thumbId: editId,
      });

      if (isGeneratedMediaUnreadable(info))
        throw new Error("Edited thumbnail could not be generated.");

      await syncMediaFile(info.thumb.path);

      const cleanup = args.saveCopy
        ? []
        : await Promise.all([
            describeFileCleanup(source.path, outputPath),
            describeFileCleanup(source.thumb?.path, info.thumb.path),
          ]);

      return { cleanup: cleanup.filter(Boolean), info };
    });

    await syncMediaFile(outputPath, prepared.info.hash);
    await assertMediaPathsAvailable([outputPath, prepared.info.thumb.path]);

    let file: FileSchema;

    if (args.saveCopy) {
      const model = await FileModel.findOneAndUpdate(
        { _id: editId },
        {
          $setOnInsert: {
            ...source,
            ...prepared.info,
            collectionIds: [],
            dateCreated: source.dateCreated,
            dateImported: dayjs().toISOString(),
            faceModels: [],
            originalHash: source.originalHash,
            path: outputPath,
            rating: source.rating,
          },
        },
        { ...metadataWriteOptions(), new: true, upsert: true },
      ).lean();

      file = leanModelToJson<FileSchema>(model);

      for (const collId of source.collectionIds) {
        const result = await actions.addFilesToCollection({ collId, fileIds: [file.id] });

        if (!result.success) throw new Error(result.error);
      }

      file.collectionIds = source.collectionIds;
      socket.emit("onFileCreated", file);
    } else {
      const updates = { ...prepared.info, faceModels: [], path: outputPath };
      const model = await FileModel.findOneAndUpdate(
        {
          _id: source.id,
          $or: [
            { hash: source.hash, path: source.path },
            { hash: prepared.info.hash, path: outputPath },
          ],
        },
        { $set: updates },
        { ...metadataWriteOptions(), new: true },
      ).lean();

      if (!model) throw new Error("Image changed during editing. The original has been preserved.");

      file = leanModelToJson<FileSchema>(model);
      socket.emitReliable("onFileUpdated", { id: file.id, updates });
    }

    await actions.queueTagMetadataRegen(file.tagIds.map(String));

    if (file.collectionIds.length) {
      const result = await actions.regenCollAttrs({ collIds: file.collectionIds.map(String) });

      if (!result.success) throw new Error(result.error);
    }

    await FileOperationModel.updateOne(
      { _id: operationId },
      { cleanup: prepared.cleanup, state: "COMMITTED", tempPath: null },
      metadataWriteOptions(),
    );

    runFileCleanupQueue();

    return file;
  }),
);
