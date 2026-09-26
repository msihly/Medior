import path from "path";
import { randomUUID } from "crypto";
import { FileTransformModel } from "medior/_generated/server/models";
import { runFileCleanupQueue } from "medior/server/database/actions/background-operations";
import { FileOperationModel } from "medior/server/database/file-operations";
import { getBackgroundSession, metadataWriteOptions } from "medior/server/database/metadata-work";
import { genFileInfo, isGeneratedMediaUnreadable } from "medior/utils/client/files";
import { chunkArray } from "medior/utils/common";
import { getNtfsFileIdentity } from "medior/utils/server";
import {
  hashMediaFile,
  publishMediaOutput,
  recoverMediaOutput,
  syncMediaFile,
} from "medior/utils/server/media-output";

export const prepareTransformMetadata = async (
  id: string,
  args: Omit<Parameters<typeof genFileInfo>[0], "file">,
) => {
  await syncMediaFile(args.filePath, args.hash);

  let operation = await FileOperationModel.findById(`transform:${id}`).lean();

  if (operation && (operation.sourcePath !== args.filePath || operation.sourceHash !== args.hash))
    throw new Error("Transform output changed; delete this transform to retire its preparation");

  if (!operation) {
    const thumbId = `${args.hash}-${randomUUID()}`;

    if (
      !(await FileTransformModel.exists({
        _id: id,
        afterHash: args.hash,
        afterPath: args.filePath,
      }))
    )
      throw new Error("Transform changed before metadata preparation");

    operation = (
      await FileOperationModel.create({
        _id: `transform:${id}`,
        cleanup: [],
        kind: "transform",
        outputPath: path.join(path.dirname(args.filePath), `${thumbId}-thumb.jpg`),
        sourceHash: args.hash,
        sourcePath: args.filePath,
        state: "PREPARED",
        tempPath: path.join(path.dirname(args.filePath), `${thumbId}-pending-thumb.jpg`),
      })
    ).toObject();
  }

  if (
    !(await recoverMediaOutput({
      hash: operation.outputHash,
      path: operation.outputPath,
      tempPath: operation.tempPath,
    }))
  ) {
    const info = await genFileInfo({
      ...args,
      thumbId: path.basename(operation.tempPath).replace(/-thumb\.jpg$/, ""),
    });
    if (isGeneratedMediaUnreadable(info))
      throw new Error("Transform output could not be read; preparation retained");

    operation.outputHash = await hashMediaFile(operation.tempPath);
    operation.outputMetadata = info;

    await FileOperationModel.updateOne(
      { _id: operation._id, state: "PREPARED" },
      { outputHash: operation.outputHash, outputMetadata: info },
    );

    await publishMediaOutput({
      hash: operation.outputHash,
      path: operation.outputPath,
      tempPath: operation.tempPath,
    });
  }

  if (!operation.outputMetadata?.thumb) throw new Error("Prepared transform metadata is missing");

  const identity = await getNtfsFileIdentity(operation.outputPath);

  return {
    ...operation.outputMetadata,
    thumb: {
      ...operation.outputMetadata.thumb,
      ntfsFileId: identity?.fileId,
      ntfsVolumeId: identity?.volumeId,
      path: operation.outputPath,
    },
  } as Awaited<ReturnType<typeof genFileInfo>>;
};

export const commitTransformMetadata = async (
  id: string,
  { retainOutput = false }: { retainOutput?: boolean } = {},
) => {
  const operation = await FileOperationModel.findById(`transform:${id}`).lean();
  if (operation?.state === "COMMITTED") return;
  if (!operation) throw new Error("Transform preparation missing");

  const cleanup = [...operation.cleanup];

  if (operation.outputHash && !retainOutput)
    cleanup.push({
      hash: operation.outputHash,
      path: operation.outputPath,
      pathKey: path.resolve(operation.outputPath).toLowerCase(),
    });

  await FileOperationModel.updateOne(
    { _id: operation._id, state: "PREPARED" },
    { cleanup, state: "COMMITTED" },
  );

  runFileCleanupQueue();
};

export const retireTransformPreparations = async (ids: string[]) => {
  const operations = await FileOperationModel.find({
    _id: { $in: ids.map((id) => `transform:${id}`) },
    state: "PREPARED",
  })
    .select({ cleanup: 1, outputHash: 1, outputPath: 1 })
    .lean();

  for (const batch of chunkArray(operations, 500))
    await FileOperationModel.bulkWrite(
      batch.map((operation) => ({
        updateOne: {
          filter: { _id: operation._id, state: "PREPARED" as const },
          update: {
            $set: {
              cleanup: [
                ...operation.cleanup,
                ...(operation.outputHash
                  ? [
                      {
                        hash: operation.outputHash,
                        path: operation.outputPath,
                        pathKey: path.resolve(operation.outputPath).toLowerCase(),
                      },
                    ]
                  : []),
              ],
              state: "COMMITTED" as const,
            },
          },
        },
      })),
      { ...metadataWriteOptions(), session: getBackgroundSession() },
    );
};
