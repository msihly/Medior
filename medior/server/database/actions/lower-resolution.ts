import { FileModel, FileSchema } from "medior/_generated/server/models";
import { setFileIsArchived } from "medior/server/database/actions/files";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import {
  getCopyScanOptions,
  getCopyScanPair,
  getCopyScanPairs,
  getCopyScanProgress,
  LowerResolutionPair,
  pauseCopyScan,
  removeCopyScanPair,
  startCopyScan,
  verifyLowerResolutionCopy,
} from "medior/server/lower-resolution";
import { ImageCopyOptions } from "medior/utils/common/image-copy-matching";
import { leanModelToJson, makeAction } from "medior/utils/server";
import { hashMediaFile } from "medior/utils/server/media-output";

export const archiveLowerResolutionCopy = makeAction(
  async ({ fileId, scanId }: { fileId: string; scanId: string }) =>
    withMetadataMutation(async () => {
      const options = await getCopyScanOptions(scanId);
      const pair = await getCopyScanPair(scanId, fileId);

      if (!pair) throw new Error("Copy is not eligible for archiving in this reviewed scan.");

      const files = await FileModel.find({
        _id: { $in: [pair.copy.id, pair.retained.id] },
        isArchived: { $ne: true },
        isCorrupted: { $ne: true },
      }).lean();
      const copy = files.find((file) => String(file._id) === pair.copy.id);
      const retained = files.find((file) => String(file._id) === pair.retained.id);

      if (
        !copy ||
        !retained ||
        copy.hash !== pair.copy.hash ||
        retained.hash !== pair.retained.hash
      )
        throw new Error("A reviewed image changed or is no longer available. Scan again.");

      if (
        (await hashMediaFile(copy.path)) !== pair.copy.hash ||
        (await hashMediaFile(retained.path)) !== pair.retained.hash ||
        !(await verifyLowerResolutionCopy(
          leanModelToJson<FileSchema>(copy),
          leanModelToJson<FileSchema>(retained),
          options,
        ))
      )
        throw new Error("The images no longer pass the reviewed threshold. Nothing was archived.");

      const result = await setFileIsArchived({ fileIds: [fileId], isArchived: true });

      if (!result.success) throw new Error(result.error);

      await removeCopyScanPair(scanId, fileId);

      return { fileId };
    }),
);

export const getLowerResolutionScan = makeAction(
  async (args: { scanId?: string; sourceFileId?: string }) => getCopyScanProgress(args),
);

export const listLowerResolutionCopies = makeAction(
  async ({ page = 1, scanId }: { page?: number; scanId: string }) => {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid review page.");

    const {
      page: currentPage,
      pageCount,
      pairs: visiblePairs,
      total,
    } = await getCopyScanPairs(scanId, page);
    const fileIds = [...new Set(visiblePairs.flatMap((pair) => [pair.copy.id, pair.retained.id]))];
    const files = await FileModel.find({ _id: { $in: fileIds }, isArchived: { $ne: true } }).lean();
    const byId = new Map(
      files.map((file) => [String(file._id), leanModelToJson<FileSchema>(file)]),
    );

    return {
      items: visiblePairs
        .filter((pair) => byId.has(pair.copy.id) && byId.has(pair.retained.id))
        .map(
          (pair): LowerResolutionPair => ({
            canArchive: pair.canArchive,
            copy: { ...byId.get(pair.copy.id), height: pair.copy.height, width: pair.copy.width },
            isLowerResolution: pair.isLowerResolution,
            retained: {
              ...byId.get(pair.retained.id),
              height: pair.retained.height,
              width: pair.retained.width,
            },
            score: pair.score,
          }),
        ),
      page: currentPage,
      pageCount,
      total,
    };
  },
);

export const pauseLowerResolutionScan = makeAction(async ({ scanId }: { scanId: string }) =>
  pauseCopyScan(scanId),
);

export const startLowerResolutionScan = makeAction(
  async ({
    options,
    restart,
    sourceFileId,
  }: {
    options: ImageCopyOptions;
    restart?: boolean;
    sourceFileId?: string;
  }) =>
    withMetadataMutation(async () => ({
      scanId: await startCopyScan(options, sourceFileId, restart),
    })),
);
