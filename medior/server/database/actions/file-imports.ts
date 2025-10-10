import * as models from "medior/_generated/models";
import { ModelCreationData } from "mobx-keystone";
import * as actions from "medior/server/database/actions";
import * as Types from "medior/server/database/types";
import { makeAction } from "medior/server/database/utils";
import { ImportStatus } from "medior/components";
import { FileImport, ImportBatchInput } from "medior/store";
import { dayjs, jstr } from "medior/utils/common";
import { objectId, socket } from "medior/utils/server";

export const checkFileImportHashes = makeAction(async (args: { hash: string }) => {
  const [deletedFileRes, fileRes] = await Promise.all([
    actions.getDeletedFile({ hash: args.hash }),
    actions.getFileByHash({ hash: args.hash }),
  ]);
  if (!fileRes.success) throw new Error(fileRes.error);
  return {
    file: fileRes.data,
    isDuplicate: !!fileRes.data,
    isPrevDeleted: !!deletedFileRes.data,
  };
});

export const completeImportBatch = makeAction(
  async (args: { collectionId?: string; fileIds: string[]; id: string; tagIds: string[] }) => {
    const completedAt = dayjs().toISOString();
    await Promise.all([
      models.FileImportBatchModel.updateOne(
        { _id: args.id },
        { collectionId: args.collectionId, completedAt },
      ),
      args.tagIds.length && actions.regenFileTagAncestors({ fileIds: args.fileIds }),
      args.tagIds.length && actions.recalculateTagCounts({ tagIds: args.tagIds }),
      ...args.tagIds.map((tagId) => actions.regenTagThumbPaths({ tagId })),
    ]);

    socket.emit("onImportBatchCompleted", { id: args.id });
    return completedAt;
  },
);

export const createImportBatches = makeAction(
  async (
    batches: {
      collectionTitle?: string;
      deleteOnImport: boolean;
      ignorePrevDeleted: boolean;
      imports: ModelCreationData<FileImport>[];
      remux: boolean;
      rootFolderPath: string;
      tagIds?: string[];
    }[],
  ) => {
    const res = await models.FileImportBatchModel.insertMany(
      batches.map((batch) => ({
        ...batch,
        completedAt: null,
        dateCreated: dayjs().toISOString(),
        startedAt: null,
        tagIds: batch.tagIds ? [...new Set(batch.tagIds)].flat() : [],
      })),
    );

    if (res.length !== batches.length) throw new Error("Failed to create import batches");
    return res;
  },
);

export const deleteImportBatches = makeAction(
  async (args: { ids: string[] }) =>
    await models.FileImportBatchModel.deleteMany({ _id: { $in: args.ids } }),
);

export const emitImportStatsUpdated = makeAction(
  async ({ importStats }: { importStats: Types.ImportStats }) => {
    socket.emit("onImportStatsUpdated", { importStats });
  },
);

export const listImportBatches = makeAction(async () =>
  (await models.FileImportBatchModel.find().lean()).map(
    (b) =>
      ({
        ...b,
        id: b._id.toString(),
        imports: b.imports.map((i) => ({ ...i, _id: undefined })),
        _id: undefined,
        __v: undefined,
      }) as ImportBatchInput,
  ),
);

export const reingestFolder = makeAction(
  async (args: {
    collectionTitle?: string;
    fileTagIds: { fileId: string; tagIds: string[] }[];
  }) => {
    if (!args.fileTagIds.length) throw new Error("No fileTagIds passed");
    const dateModified = dayjs().toISOString();

    const bulkRes = await models.FileModel.bulkWrite(
      args.fileTagIds.map((f) => ({
        updateMany: {
          filter: { _id: objectId(f.fileId) },
          update: { $addToSet: { tagIds: { $each: f.tagIds } }, dateModified },
        },
      })),
    );
    if (!bulkRes.matchedCount || bulkRes.matchedCount !== bulkRes.modifiedCount)
      throw new Error(`Failed to update file tagIds: ${jstr({ args, bulkRes })}`);

    const tagIds = [...new Set(args.fileTagIds.flatMap((f) => f.tagIds))];
    if (tagIds.length) {
      const fileIds = args.fileTagIds.flatMap((f) => f.fileId);
      await actions.regenFileTagAncestors({ fileIds });
      await actions.recalculateTagCounts({ tagIds });
      await Promise.all(tagIds.map((tagId) => actions.regenTagThumbPaths({ tagId })));
    }

    if (args.collectionTitle) {
      const collRes = await actions.createCollection({
        fileIdIndexes: args.fileTagIds.map((f, i) => ({ fileId: f.fileId, index: i })),
        title: args.collectionTitle,
        withSub: false,
      });
      if (!collRes.success) throw new Error(collRes.error);
    }

    socket.emit("onReloadFiles");
  },
);

export const startImportBatch = makeAction(async (args: { id: string }) => {
  const startedAt = dayjs().toISOString();
  await models.FileImportBatchModel.updateOne({ _id: args.id }, { startedAt });
  return startedAt;
});

export const updateFileImportByPath = makeAction(
  async (args: {
    batchId: string;
    errorMsg?: string;
    fileId: string;
    filePath?: string;
    status?: ImportStatus;
    thumb?: models.FileImportBatchSchema["imports"][number]["thumb"];
  }) => {
    const res = await models.FileImportBatchModel.updateOne(
      { _id: args.batchId },
      {
        $set: {
          "imports.$[fileImport].errorMsg": args.errorMsg,
          "imports.$[fileImport].fileId": args.fileId,
          "imports.$[fileImport].status": args.status,
          "imports.$[fileImport].thumb": args.thumb,
        },
      },
      { arrayFilters: [{ "fileImport.path": args.filePath }] },
    );

    if (res?.matchedCount !== res?.modifiedCount)
      throw new Error("Failed to update file import by path");
  },
);
