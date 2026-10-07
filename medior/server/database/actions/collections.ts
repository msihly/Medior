import path from "path";
import * as models from "medior/_generated/server/models";
import mongoose, { FilterQuery, UpdateQuery } from "mongoose";
import * as actions from "medior/server/database/actions";
import {
  canRunBackgroundQueues,
  makeBackgroundOperationRunner,
} from "medior/server/database/actions/background-operations";
import { getImportSourceFolder } from "medior/server/database/import-entries";
import { assertImportEntriesReady } from "medior/server/database/import-entry-state";
import {
  getBackgroundSession,
  getMetadataCreateId,
  metadataWriteOptions,
  readMetadataSnapshot,
  registerMetadataWork,
  repairMetadata,
} from "medior/server/database/metadata-work";
import { makeRepairReporter } from "medior/server/database/repair-progress";
import { SortMenuProps } from "medior/components";
import { chunkArray, dayjs } from "medior/utils/common";
import { leanModelToJson, makeAction, objectId, objectIds, socket } from "medior/utils/server";
import { getCommonSourceFolder } from "medior/utils/server/source-folders";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const updateFileCollectionIds = async (
  filter: FilterQuery<models.FileSchema>,
  updates: UpdateQuery<models.FileSchema>,
) => {
  const files = await models.FileModel.find(filter).select({ _id: 1 }).lean();

  for (const batch of chunkArray(files, 1000)) {
    const fileIds = batch.map((file) => file._id);

    await models.FileModel.updateMany({ _id: { $in: fileIds } }, updates);

    const updatedFiles = await models.FileModel.find({ _id: { $in: fileIds } })
      .select({ collectionIds: 1 })
      .lean();

    const groups = new Map<string, { collectionIds: string[]; fileIds: string[] }>();

    for (const file of updatedFiles) {
      const collectionIds = file.collectionIds.map(String).sort();
      const key = collectionIds.join(",");

      if (!groups.has(key)) groups.set(key, { collectionIds, fileIds: [] });

      groups.get(key).fileIds.push(file._id.toString());
    }

    for (const { collectionIds, fileIds } of groups.values())
      socket.emit("onFilesUpdated", { fileIds, updates: { collectionIds } });
  }
};

// @generator-ignore-export
export const syncCollectionFileIds = async (collectionId: string, fileIds: string[]) => {
  await updateFileCollectionIds(
    { _id: { $nin: objectIds(fileIds) }, collectionIds: collectionId },
    { $pull: { collectionIds: collectionId } },
  );

  await updateFileCollectionIds(
    { _id: { $in: objectIds(fileIds) }, collectionIds: { $ne: collectionId } },
    { $addToSet: { collectionIds: collectionId } },
  );
};

// @generator-ignore-export
export const removeFileCollectionIds = async (collectionIds: string[]) => {
  await updateFileCollectionIds(
    { collectionIds: { $in: objectIds(collectionIds) } },
    { $pull: { collectionIds: { $in: objectIds(collectionIds) } } },
  );
};

const dedupeFileIdIndexes = (fileIdIndexes: { fileId: string; index: number }[]) => {
  const seenFileIds = new Set<string>();

  return fileIdIndexes
    .filter(({ fileId }) => {
      if (!fileId) return false;

      const id = fileId.toString();

      if (seenFileIds.has(id)) return false;

      seenFileIds.add(id);

      return true;
    })
    .sort((a, b) => a.index - b.index)
    .map((entry, index) => ({ ...entry, index }));
};

const getMergedFileIdIndexes = (
  collections: { fileIdIndexes: { fileId: string; index: number }[] }[],
) =>
  dedupeFileIdIndexes(
    collections.flatMap((collection, collectionIndex) =>
      [...collection.fileIdIndexes]
        .sort((a, b) => a.index - b.index)
        .map((entry, index) => ({
          fileId: entry.fileId,
          index: collectionIndex * 1_000_000_000 + index,
        })),
    ),
  );

const getMergeRatingSource = <T extends { rating: number; ratingIsManual?: boolean }>(
  collections: T[],
) =>
  collections.find(({ ratingIsManual }) => ratingIsManual) ??
  collections.find(({ rating }) => rating > 0);

const normalizeSourceFolderPath = (sourceFolderPath: string) =>
  path.win32
    .normalize(sourceFolderPath)
    .replace(/[\\/]+$/, "")
    .toLowerCase();

const deriveCollectionSourceFolderPath = async (collection: models.FileCollectionSchema) => {
  if (collection.sourceFolderPaths?.length) return collection.sourceFolderPaths[0];

  const fileIds = collection.fileIdIndexes.map(({ fileId }) => fileId).filter(Boolean);

  const files = await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ originalPath: 1 })
    .lean();

  const fromFiles = getCommonSourceFolder(files.map((file) => file.originalPath));

  if (fromFiles) return fromFiles;

  const batches = await models.FileImportBatchModel.find({ collectionId: collection.id })
    .select({ _id: 1 })
    .lean();

  return getImportSourceFolder(batches.map((batch) => String(batch._id)));
};

const readCollectionAttributes = async (fileIds: string[]) => {
  let fileCount = 0;
  let ratedCount = 0;
  let ratingSum = 0;
  let size = 0;
  const tagIds = new Set<string>();

  for await (const file of models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ rating: 1, size: 1, tagIds: 1 })
    .readConcern("majority")
    .lean()
    .cursor({ batchSize: 500 })) {
    fileCount++;
    size += file.size;

    if (file.rating > 0) {
      ratedCount++;
      ratingSum += file.rating;
    }

    for (const id of file.tagIds) tagIds.add(String(id));
  }

  return {
    fileCount,
    rating: ratedCount ? ratingSum / ratedCount : 0,
    size,
    tagIds: [...tagIds].sort(),
    tagIdsWithAncestors: await actions.deriveAncestorTagIds([...tagIds]),
  };
};

const readCollectionMetadata = async (collIds: string[]) => {
  const collections = await models.FileCollectionModel.find({ _id: { $in: objectIds(collIds) } })
    .select({ __v: 1, fileIdIndexes: 1 })
    .readConcern("majority")
    .lean<Array<models.FileCollectionSchema & { __v?: number; _id: mongoose.Types.ObjectId }>>();

  const snapshots: {
    id: string;
    updates: Awaited<ReturnType<typeof readCollectionAttributes>>;
    version: number;
  }[] = [];

  for (const collection of collections) {
    snapshots.push({
      id: String(collection._id),
      updates: await readCollectionAttributes(
        collection.fileIdIndexes.map(({ fileId }) => String(fileId)),
      ),
      version: collection.__v ?? 0,
    });
  }

  return snapshots;
};

const writeCollectionMetadata = async (
  snapshots: Awaited<ReturnType<typeof readCollectionMetadata>>,
) => {
  const collections = await models.FileCollectionModel.find({
    _id: { $in: objectIds(snapshots.map(({ id }) => id)) },
  })
    .select({ __v: 1, rating: 1, ratingIsManual: 1 })
    .lean<Array<models.FileCollectionSchema & { __v?: number; _id: mongoose.Types.ObjectId }>>();

  const current = new Map(collections.map((collection) => [String(collection._id), collection]));

  if (
    snapshots.some(
      (snapshot) =>
        current.has(snapshot.id) && (current.get(snapshot.id).__v ?? 0) !== snapshot.version,
    )
  )
    return false;

  const updates = snapshots
    .filter(({ id }) => current.has(id))
    .map((snapshot) => ({
      id: snapshot.id,
      updates: {
        ...snapshot.updates,
        rating: current.get(snapshot.id).ratingIsManual
          ? current.get(snapshot.id).rating
          : snapshot.updates.rating,
      },
    }));

  if (updates.length) {
    const result = await models.FileCollectionModel.bulkWrite(
      updates.map(({ id, updates }) => ({
        updateOne: {
          filter: {
            _id: objectId(id),
            $expr: { $eq: [{ $ifNull: ["$__v", 0] }, current.get(id).__v ?? 0] },
          },
          update: { $inc: { __v: 1 }, $set: updates },
        },
      })),
      { ...metadataWriteOptions(), session: getBackgroundSession() },
    );

    if (result.matchedCount !== updates.length) return false;
  }

  for (const update of updates) socket.emit("onFileCollectionUpdated", update);

  return true;
};

const processCollectionMetadataRegenQueue = async () => {
  while (canRunBackgroundQueues()) {
    let operation: models.BackgroundOperationSchema;

    try {
      operation = leanModelToJson<models.BackgroundOperationSchema>(
        await models.BackgroundOperationModel.findOne({
          status: { $in: ["PENDING", "RUNNING"] },
          type: "collectionMetadata",
        })
          .sort({ dateCreated: 1 })
          .lean(),
      );

      if (operation?.status === "PENDING")
        await actions.setBackgroundOperationStatus(operation.id, "RUNNING");

      if (!operation) return;

      const collectionIds = operation.targetIds.slice(0, 100);
      const snapshots = await readCollectionMetadata(collectionIds);

      await (async () => {
        const current = await models.BackgroundOperationModel.findById(operation.id).lean();

        if (
          !current ||
          !["PENDING", "RUNNING"].includes(current.status) ||
          current.targetIds.slice(0, collectionIds.length).join() !== collectionIds.join()
        )
          return;

        if (!collectionIds.length) {
          if (current.targetIds.length) return;

          await actions.completeEmptyBackgroundOperation(
            operation.id,
            "Collection metadata regeneration completed.",
          );

          return;
        }

        if (!(await writeCollectionMetadata(snapshots))) return;

        await actions.completeBackgroundOperationTargets(
          operation.id,
          collectionIds,
          `Collection metadata: processed ${current.processedCount + collectionIds.length} of ${current.totalCount}.`,
          operation.targetVersions ?? {},
        );
      })();
    } catch (error) {
      if (!canRunBackgroundQueues()) return;

      if (!operation) throw error;

      await actions.setBackgroundOperationStatus(operation.id, "ERROR", {
        error: error?.message ?? String(error),
      });
    }
  }
};

const runCollectionMetadataRegenQueue = makeBackgroundOperationRunner(
  "collection metadata regeneration",
  processCollectionMetadataRegenQueue,
  false,
);

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const addFilesToCollection = makeAction(
  registerMetadataWork(
    "addFilesToCollection",
    async (args: { collId: string; fileIds: string[] }) => {
      const collRes = await models.FileCollectionModel.findById(args.collId).lean();

      if (!collRes) throw new Error("Collection not found");

      const existingFileIds = collRes.fileIdIndexes.map((f) => String(f.fileId));
      const existingIds = new Set(existingFileIds);
      const fileIdsToAdd = args.fileIds.filter((id) => !existingIds.has(id));

      const newFileIdIndexes = [...new Set([...fileIdsToAdd, ...existingFileIds])].map(
        (fileId, index) => ({ fileId, index }),
      );

      const updateRes = await updateCollection({
        id: args.collId,
        fileIdIndexes: newFileIdIndexes,
      });

      if (!updateRes.success) throw new Error(updateRes.error);

      return updateRes.data;
    },
  ),
);

export const createCollection = makeAction(
  registerMetadataWork(
    "createCollection",
    async (args: {
      fileIdIndexes: { fileId: string; index: number }[];
      id?: string;
      sourceFolderPath?: string;
      title: string;
      withSub?: boolean;
    }) => {
      const deduped = dedupeFileIdIndexes(args.fileIdIndexes);

      const attributes = await readCollectionAttributes(deduped.map(({ fileId }) => fileId));

      if (attributes.fileCount !== deduped.length)
        throw new Error(`Some files not found (${deduped.length} != ${attributes.fileCount})`);

      const dateCreated = dayjs().toISOString();

      const collection = {
        ...attributes,
        dateCreated,
        dateModified: dateCreated,
        fileIdIndexes: deduped,
        sourceFolderKeys: args.sourceFolderPath
          ? [normalizeSourceFolderPath(args.sourceFolderPath)]
          : [],
        sourceFolderPaths: args.sourceFolderPath ? [args.sourceFolderPath] : [],
        title: args.title,
      };

      const res = await models.FileCollectionModel.findOneAndUpdate(
        { _id: args.id ?? getMetadataCreateId(`collection:${args.title}`) },
        { $setOnInsert: collection },
        { ...metadataWriteOptions(), new: true, upsert: true },
      );

      await syncCollectionFileIds(
        res._id.toString(),
        deduped.map(({ fileId }) => fileId),
      );

      if (args.withSub) socket.emit("onFileCollectionCreated", res);

      return { ...collection, id: res._id.toString() };
    },
  ),
);

export const upsertImportedCollection = makeAction(
  registerMetadataWork(
    "upsertImportedCollection",
    async (args: {
      fileIdIndexes: { fileId: string; index: number }[];
      sourceFolderPath: string;
      title: string;
    }) => {
      const sourceFolderKey = normalizeSourceFolderPath(args.sourceFolderPath);
      const incomingFileIds = args.fileIdIndexes.map(({ fileId }) => fileId);

      let candidates = (
        await models.FileCollectionModel.find({ sourceFolderKeys: sourceFolderKey }).lean()
      ).map((collection) => leanModelToJson<models.FileCollectionSchema>(collection));

      if (!candidates.length && incomingFileIds.length) {
        const overlapping = (
          await models.FileCollectionModel.find({
            "fileIdIndexes.fileId": { $in: objectIds(incomingFileIds) },
          }).lean()
        ).map((collection) => leanModelToJson<models.FileCollectionSchema>(collection));

        const matching: models.FileCollectionSchema[] = [];

        for (const collection of overlapping) {
          const derivedPath = await deriveCollectionSourceFolderPath(collection);

          if (derivedPath && normalizeSourceFolderPath(derivedPath) === sourceFolderKey)
            matching.push(collection);
        }

        candidates = matching;
      }

      if (candidates.length === 1) {
        const collection = candidates[0];

        const fileIdIndexes = dedupeFileIdIndexes([
          ...collection.fileIdIndexes,
          ...args.fileIdIndexes.map((entry, index) => ({
            ...entry,
            index: collection.fileIdIndexes.length + index,
          })),
        ]);

        const sourceFolderPathByKey = new Map(
          [...(collection.sourceFolderPaths ?? []), args.sourceFolderPath].map(
            (sourceFolderPath) => [normalizeSourceFolderPath(sourceFolderPath), sourceFolderPath],
          ),
        );

        const sourceFolderKeys = [...sourceFolderPathByKey.keys()];
        const sourceFolderPaths = [...sourceFolderPathByKey.values()];

        const updateRes = await updateCollection({
          id: collection.id,
          fileIdIndexes,
          sourceFolderKeys,
          sourceFolderPaths,
        });

        if (!updateRes.success) throw new Error(updateRes.error);

        return { fileIdIndexes, id: collection.id };
      }

      const createRes = await createCollection({
        ...args,
        sourceFolderPath: args.sourceFolderPath,
        withSub: true,
      });

      if (!createRes.success) throw new Error(createRes.error);

      return createRes.data;
    },
  ),
);

export const previewCollectionMerge = makeAction(async (args: { ids: string[] }) => {
  if (args.ids.length < 2 || new Set(args.ids).size !== args.ids.length)
    throw new Error("At least two unique collections are required to merge");

  const collections = (
    await models.FileCollectionModel.find({ _id: { $in: objectIds(args.ids) } }).lean()
  ).map((collection) => leanModelToJson<models.FileCollectionSchema>(collection));

  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const ordered = args.ids.map((id) => byId.get(id)).filter(Boolean);

  if (ordered.length !== args.ids.length) throw new Error("One or more collections were not found");

  const fileIdIndexes = getMergedFileIdIndexes(ordered);
  const ratingSource = getMergeRatingSource(ordered);

  return {
    collection: {
      ...ordered[0],
      fileCount: fileIdIndexes.length,
      fileIdIndexes,
      rating: ratingSource?.rating ?? ordered[0].rating,
      ratingIsManual: ratingSource?.ratingIsManual ?? false,
    },
  };
});

export const mergeCollections = makeAction(
  registerMetadataWork(
    "mergeCollections",
    async (args: {
      fileIdIndexes: { fileId: string; index: number }[];
      ids: string[];
      title: string;
    }) => {
      if (args.ids.length < 2 || new Set(args.ids).size !== args.ids.length)
        throw new Error("At least two unique collections are required to merge");

      if (!args.title.trim()) throw new Error("A collection title is required");

      await assertImportEntriesReady();

      const collections = await readMetadataSnapshot(
        `mergeCollections:${args.ids.join()}`,
        async () =>
          (await models.FileCollectionModel.find({ _id: { $in: objectIds(args.ids) } }).lean()).map(
            (collection) => leanModelToJson<models.FileCollectionSchema>(collection),
          ),
      );

      const byId = new Map(collections.map((collection) => [collection.id, collection]));
      const ordered = args.ids.map((id) => byId.get(id)).filter(Boolean);

      if (ordered.length !== args.ids.length)
        throw new Error("One or more collections were not found");

      const expectedFileIds = new Set(
        getMergedFileIdIndexes(ordered).map(({ fileId }) => fileId.toString()),
      );

      const submittedFileIds = new Set(args.fileIdIndexes.map(({ fileId }) => fileId.toString()));

      if (
        submittedFileIds.size !== args.fileIdIndexes.length ||
        submittedFileIds.size !== expectedFileIds.size ||
        [...submittedFileIds].some((fileId) => !expectedFileIds.has(fileId))
      )
        throw new Error("The merged collection files do not match the selected collections");

      const fileIdIndexes = dedupeFileIdIndexes(args.fileIdIndexes);
      const sourceFolderPathByKey = new Map<string, string>();

      for (const collection of ordered) {
        for (const sourceFolderPath of collection.sourceFolderPaths ?? [])
          sourceFolderPathByKey.set(normalizeSourceFolderPath(sourceFolderPath), sourceFolderPath);

        const derivedPath = await deriveCollectionSourceFolderPath(collection);

        if (derivedPath)
          sourceFolderPathByKey.set(normalizeSourceFolderPath(derivedPath), derivedPath);
      }

      const ratingSource = getMergeRatingSource(ordered);
      const target = ordered[0];
      const sourceIds = ordered.slice(1).map((collection) => collection.id);

      const updateRes = await updateCollection({
        fileIdIndexes,
        id: target.id,
        rating: ratingSource?.rating,
        ratingIsManual: ratingSource?.ratingIsManual ?? false,
        sourceFolderKeys: [...sourceFolderPathByKey.keys()],
        sourceFolderPaths: [...sourceFolderPathByKey.values()],
        title: args.title.trim(),
      });

      if (!updateRes.success) throw new Error(updateRes.error);

      await models.FileImportBatchModel.updateMany(
        { collectionId: { $in: args.ids } },
        { $set: { collectionId: target.id } },
      );

      const deleteRes = await deleteCollections({ ids: sourceIds });

      if (!deleteRes.success) throw new Error(deleteRes.error);

      return {
        id: target.id,
        mergedCollectionCount: ordered.length,
        uniqueFileCount: fileIdIndexes.length,
      };
    },
    true,
  ),
);

export const deleteCollections = makeAction(
  registerMetadataWork("deleteCollections", async (args: { ids: string[] }) => {
    const res = await models.FileCollectionModel.deleteMany({ _id: { $in: objectIds(args.ids) } });

    await removeFileCollectionIds(args.ids);

    if (res.deletedCount) socket.emit("onFileCollectionsDeleted", args);

    return res;
  }),
);

export const listAllCollectionIds = makeAction(async () => {
  return (await models.FileCollectionModel.find().select({ _id: 1 }).lean()).map((c) =>
    c._id.toString(),
  );
});

export const findRelatedCollectionGroups = makeAction(
  async (args: {
    ids?: string[];
    includeFileOverlap?: boolean;
    includeOriginalFolder?: boolean;
    includeTitle?: boolean;
    minCommonPercentage?: number;
    sortValue: SortMenuProps["value"];
  }) => {
    const includeFileOverlap = args.includeFileOverlap ?? true;
    const includeOriginalFolder = args.includeOriginalFolder ?? false;
    const includeTitle = args.includeTitle ?? false;
    const minCommonPercentage = Math.min(100, Math.max(0, args.minCommonPercentage ?? 50));
    const sortDirection = args.sortValue.isDesc ? -1 : 1;
    const sortKey = args.sortValue.key === "custom" ? "dateCreated" : args.sortValue.key;

    const collections = (
      await models.FileCollectionModel.find(
        args.ids?.length ? { _id: { $in: objectIds(args.ids) } } : {},
      )
        .sort({ [sortKey]: sortDirection, _id: sortDirection })
        .lean()
    ).map((collection) => leanModelToJson<models.FileCollectionSchema>(collection));

    if (collections.length < 2) return [];

    const collectionIndexById = new Map(
      collections.map((collection, index) => [collection.id, index]),
    );

    const collectionIndexesByFileId = new Map<string, number[]>();

    const collectionFileCounts = collections.map(
      (collection) =>
        new Set(collection.fileIdIndexes.map((entry) => entry.fileId.toString())).size,
    );

    collections.forEach((collection, collectionIndex) => {
      for (const fileId of new Set(
        collection.fileIdIndexes.map((entry) => entry.fileId.toString()),
      )) {
        const indexes = collectionIndexesByFileId.get(fileId) ?? [];

        indexes.push(collectionIndex);
        collectionIndexesByFileId.set(fileId, indexes);
      }
    });

    const sourcePathsByCollection = collections.map(() => [] as string[]);

    if (includeOriginalFolder) {
      collections.forEach((collection, index) => {
        sourcePathsByCollection[index] = collection.sourceFolderPaths ?? [];
      });

      const derivedSourceFolderPaths: Array<null | string | undefined> = collections.map(
        () => undefined,
      );

      for (const fileIds of chunkArray([...collectionIndexesByFileId.keys()], 5000)) {
        const files = await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
          .select({ originalPath: 1 })
          .lean();

        for (const file of files) {
          const folderPath = path.win32.dirname(file.originalPath);

          for (const collectionIndex of collectionIndexesByFileId.get(file._id.toString()) ?? []) {
            if (sourcePathsByCollection[collectionIndex].length) continue;

            const currentPath = derivedSourceFolderPaths[collectionIndex];
            derivedSourceFolderPaths[collectionIndex] =
              currentPath === undefined
                ? folderPath
                : currentPath === null
                  ? null
                  : getCommonSourceFolder([currentPath, folderPath], true);
          }
        }
      }

      derivedSourceFolderPaths.forEach((sourceFolderPath, collectionIndex) => {
        if (sourceFolderPath) sourcePathsByCollection[collectionIndex] = [sourceFolderPath];
      });

      const missingSourceIds = collections
        .filter((_, index) => !sourcePathsByCollection[index].length)
        .map((collection) => collection.id);

      for (const collectionIds of chunkArray(missingSourceIds, 5000)) {
        const batches = await models.FileImportBatchModel.find({
          collectionId: { $in: collectionIds },
        })
          .select({ collectionId: 1 })
          .lean();

        const batchIdsByCollectionId = new Map<string, string[]>();

        for (const batch of batches) {
          const collectionId = batch.collectionId?.toString();

          if (!collectionId) continue;

          const batchIds = batchIdsByCollectionId.get(collectionId) ?? [];

          batchIds.push(String(batch._id));
          batchIdsByCollectionId.set(collectionId, batchIds);
        }

        for (const [collectionId, batchIds] of batchIdsByCollectionId) {
          const collectionIndex = collectionIndexById.get(collectionId);
          const derived = await getImportSourceFolder(batchIds);

          if (collectionIndex !== undefined && derived)
            sourcePathsByCollection[collectionIndex] = [derived];
        }
      }
    }

    const parentIndexes = collections.map((_, index) => index);

    const find = (index: number): number => {
      while (parentIndexes[index] !== index) {
        parentIndexes[index] = parentIndexes[parentIndexes[index]];
        index = parentIndexes[index];
      }

      return index;
    };

    const union = (left: number, right: number) => {
      const leftRoot = find(left);
      const rightRoot = find(right);

      if (leftRoot !== rightRoot) parentIndexes[rightRoot] = leftRoot;
    };

    const pairCounts = new Map<string, number>();

    for (const indexes of collectionIndexesByFileId.values()) {
      for (let left = 0; left < indexes.length; left++) {
        for (let right = left + 1; right < indexes.length; right++) {
          const key = `${indexes[left]}:${indexes[right]}`;

          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    const relatedPairKeys = new Set<string>();

    const addRelatedPair = (leftIndex: number, rightIndex: number) => {
      if (leftIndex === rightIndex) return;

      const normalizedLeft = Math.min(leftIndex, rightIndex);
      const normalizedRight = Math.max(leftIndex, rightIndex);
      const pairKey = `${normalizedLeft}:${normalizedRight}`;

      if (relatedPairKeys.has(pairKey)) return;

      relatedPairKeys.add(pairKey);
      union(leftIndex, rightIndex);
    };

    if (includeFileOverlap) {
      for (const [pairKey, commonFileCount] of pairCounts) {
        const [leftIndex, rightIndex] = pairKey.split(":").map(Number);
        const leftPercentage = (commonFileCount / collectionFileCounts[leftIndex]) * 100;
        const rightPercentage = (commonFileCount / collectionFileCounts[rightIndex]) * 100;

        if (leftPercentage < minCommonPercentage || rightPercentage < minCommonPercentage) continue;

        addRelatedPair(leftIndex, rightIndex);
      }
    }

    if (includeOriginalFolder) {
      const sourceIndexes = new Map<string, number[]>();

      sourcePathsByCollection.forEach((sourceFolderPaths, index) => {
        for (const sourceFolderPath of sourceFolderPaths) {
          const key = normalizeSourceFolderPath(sourceFolderPath);

          sourceIndexes.set(key, [...(sourceIndexes.get(key) ?? []), index]);
        }
      });

      for (const indexes of sourceIndexes.values()) {
        for (let left = 0; left < indexes.length; left++) {
          for (let right = left + 1; right < indexes.length; right++) {
            addRelatedPair(indexes[left], indexes[right]);
          }
        }
      }
    }

    if (includeTitle) {
      const titleIndexes = new Map<string, number[]>();

      collections.forEach((collection, index) => {
        const key = collection.title.trim().toLowerCase();

        if (key) titleIndexes.set(key, [...(titleIndexes.get(key) ?? []), index]);
      });

      for (const indexes of titleIndexes.values()) {
        for (let left = 0; left < indexes.length; left++) {
          for (let right = left + 1; right < indexes.length; right++) {
            const leftIndex = indexes[left];
            const rightIndex = indexes[right];
            const pairKey = `${Math.min(leftIndex, rightIndex)}:${Math.max(leftIndex, rightIndex)}`;

            if (relatedPairKeys.has(pairKey)) continue;

            addRelatedPair(leftIndex, rightIndex);
          }
        }
      }
    }

    const indexesByRoot = new Map<number, number[]>();

    collections.forEach((_, index) => {
      const root = find(index);

      indexesByRoot.set(root, [...(indexesByRoot.get(root) ?? []), index]);
    });

    return [...indexesByRoot.values()]
      .filter((indexes) => indexes.length > 1)
      .map((indexes) => {
        const baseIndex = Math.min(...indexes);

        const getCommonFileCount = (leftIndex: number, rightIndex: number) =>
          leftIndex === rightIndex
            ? collectionFileCounts[leftIndex]
            : (pairCounts.get(
                `${Math.min(leftIndex, rightIndex)}:${Math.max(leftIndex, rightIndex)}`,
              ) ?? 0);

        const getSimilarityPercentage = (index: number, comparisonIndex: number) =>
          collectionFileCounts[index]
            ? (getCommonFileCount(index, comparisonIndex) / collectionFileCounts[index]) * 100
            : 0;
        indexes.sort(
          (left, right) =>
            Number(right === baseIndex) - Number(left === baseIndex) ||
            getSimilarityPercentage(right, baseIndex) - getSimilarityPercentage(left, baseIndex) ||
            left - right,
        );

        return {
          collections: indexes.map((index) => ({
            id: collections[index].id,
            searchIndex: index,
            similarityPercentage: Math.round(getSimilarityPercentage(index, baseIndex)),
            similarityPercentageById: Object.fromEntries(
              indexes.map((comparisonIndex) => [
                collections[comparisonIndex].id,
                Math.round(getSimilarityPercentage(index, comparisonIndex)),
              ]),
            ),
          })),
        };
      });
  },
);

export const listCollectionsByFileIds = makeAction(async (args: { fileIds: string[] }) => {
  const collections = (
    await models.FileCollectionModel.find({
      fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } },
    }).lean()
  ).map((f) => leanModelToJson<models.FileCollectionSchema>(f));

  const tagIds = [...new Set(collections.flatMap((c) => c.tagIds.map((id) => id.toString())))];
  const res = await actions.listTag({ filter: { id: tagIds } });

  if (!res.success) throw new Error(res.error);

  const tagsMap = new Map(res.data.map((t) => [t.id, t]));

  return collections.map((c) => ({
    ...c,
    tags: c.tagIds.map((id) => tagsMap.get(id.toString())).filter(Boolean),
  }));
});

export const listCollectionIdsByTagIds = makeAction(async (args: { tagIds: string[] }) => {
  return (
    await models.FileCollectionModel.find({ tagIds: { $in: objectIds(args.tagIds) } })
      .select({ _id: 1 })
      .lean()
  ).map((f) => f._id.toString());
});

export const listFileSelectionCollections = makeAction(
  async ({ fileIds, page }: { fileIds: string[]; page: number }) => {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid collection page.");

    const filter = { "fileIdIndexes.fileId": { $in: objectIds(fileIds) } };
    const items = await models.FileCollectionModel.find(filter)
      .sort({ dateCreated: -1, _id: -1 })
      .skip(page - 1)
      .limit(1)
      .lean();

    const count = await models.FileCollectionModel.countDocuments(filter);

    return { items: items.map(leanModelToJson<models.FileCollectionSchema>), pageCount: count };
  },
);

export const regenCollAttrs = makeAction(
  registerMetadataWork(
    "regenCollAttrs",
    async (
      args: {
        collFilter?: FilterQuery<models.FileCollectionSchema>;
        collIds?: string[];
        fileIds?: string[];
      } = {},
    ) => {
      if (
        !args.collFilter &&
        (args.collIds !== undefined || args.fileIds !== undefined) &&
        !args.collIds?.length &&
        !args.fileIds?.length
      )
        return { queuedCount: 0 };

      const collectionIds = (
        await models.FileCollectionModel.find(
          {
            ...(args.collFilter ??
              (args.collIds?.length
                ? { _id: { $in: objectIds(args.collIds) } }
                : args.fileIds?.length
                  ? { fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } } }
                  : {})),
          },
          { _id: 1 },
          { strict: false },
        ).lean()
      ).map(({ _id }) => _id.toString());

      await models.FileCollectionModel.updateMany(
        { _id: { $in: objectIds(collectionIds) } },
        { $inc: { __v: 1 } },
      );

      await actions.queueBackgroundOperation({
        label: "Collection metadata regeneration",
        targetIds: collectionIds,
        type: "collectionMetadata",
      });

      runCollectionMetadataRegenQueue();

      return { queuedCount: collectionIds.length };
    },
  ),
);

export const repairCollections = makeAction(
  async ({
    deleteEmptyCollections = true,
    deleteExactDuplicates = true,
    deleteSubsetCollections = true,
    repairFileIndexes = true,
    repairId,
    syncFileMembership = true,
  }: {
    deleteEmptyCollections?: boolean;
    deleteExactDuplicates?: boolean;
    deleteSubsetCollections?: boolean;
    repairFileIndexes?: boolean;
    repairId: string;
    syncFileMembership?: boolean;
  }) => {
    const { checkCancelled, report, run } = makeRepairReporter(repairId, "repairCollections");

    return run(async () => {
      let deletedCount = 0;
      let repairedCount = 0;

      report("Checking collections in bounded metadata batches.");

      await repairMetadata(
        models.FileCollectionModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean().cursor(),
        async (candidate) => {
          checkCancelled();

          const collection = await models.FileCollectionModel.findById(candidate._id).lean();

          if (!collection) return { deleted: 0, repaired: 0 };

          let repaired = 0;

          if (repairFileIndexes) {
            const existingIds = new Set(
              (
                await models.FileModel.find({
                  _id: {
                    $in: collection.fileIdIndexes.map(({ fileId }) => fileId).filter(Boolean),
                  },
                })
                  .select({ _id: 1 })
                  .lean()
              ).map(({ _id }) => String(_id)),
            );

            const fileIdIndexes = dedupeFileIdIndexes(
              collection.fileIdIndexes.filter(({ fileId }) => existingIds.has(String(fileId))),
            );

            if (
              fileIdIndexes.length !== collection.fileIdIndexes.length ||
              fileIdIndexes.some(
                (entry, index) =>
                  String(entry.fileId) !== String(collection.fileIdIndexes[index].fileId) ||
                  entry.index !== collection.fileIdIndexes[index].index,
              )
            ) {
              const result = await updateCollection({ fileIdIndexes, id: String(collection._id) });

              if (!result.success) throw new Error(result.error);

              collection.fileIdIndexes = fileIdIndexes;
              repaired = 1;
            }
          }

          const fileIds = new Set(
            collection.fileIdIndexes
              .filter(({ fileId }) => fileId)
              .map(({ fileId }) => String(fileId)),
          );

          if (!fileIds.size) {
            if (!deleteEmptyCollections) return { deleted: 0, repaired };

            const result = await deleteCollections({ ids: [String(collection._id)] });

            if (!result.success) throw new Error(result.error);

            return { deleted: result.data.deletedCount, repaired };
          }

          if (deleteExactDuplicates || deleteSubsetCollections) {
            for await (const keeper of models.FileCollectionModel.find({
              _id: { $ne: collection._id },
              "fileIdIndexes.fileId": { $all: objectIds([...fileIds]) },
            })
              .select({ fileIdIndexes: 1 })
              .sort({ _id: 1 })
              .lean()
              .cursor()) {
              checkCancelled();

              const retainedIds = new Set(
                keeper.fileIdIndexes
                  .filter(({ fileId }) => fileId)
                  .map(({ fileId }) => String(fileId)),
              );

              if (![...fileIds].every((id) => retainedIds.has(id))) continue;

              if (fileIds.size === retainedIds.size) {
                if (!deleteExactDuplicates || String(collection._id) < String(keeper._id)) continue;
              } else if (!deleteSubsetCollections) continue;

              const result = await deleteCollections({ ids: [String(collection._id)] });

              if (!result.success) throw new Error(result.error);

              return { deleted: result.data.deletedCount, repaired };
            }
          }

          return { deleted: 0, repaired };
        },
        async ({ result }) => {
          deletedCount += result.deleted;
          repairedCount += result.repaired;
        },
      );

      if (syncFileMembership) {
        report("Synchronizing each file's collection membership from current collections.");

        await repairMetadata(
          models.FileModel.find().select({ _id: 1 }).sort({ _id: 1 }).lean().cursor(),
          async (candidate) => {
            checkCancelled();

            const file = await models.FileModel.findById(candidate._id)
              .select({ collectionIds: 1 })
              .lean();

            if (!file) return;

            const collectionIds = (
              await models.FileCollectionModel.find({ "fileIdIndexes.fileId": file._id })
                .select({ _id: 1 })
                .lean()
            )
              .map(({ _id }) => String(_id))
              .sort();

            if (
              file.collectionIds &&
              [...file.collectionIds].map(String).sort().join(",") === collectionIds.join(",")
            )
              return;

            await models.FileModel.updateOne(
              { _id: file._id },
              { $set: { collectionIds: objectIds(collectionIds) } },
            );

            socket.emit("onFilesUpdated", {
              fileIds: [String(file._id)],
              updates: { collectionIds },
            });

            checkCancelled();
          },
        );
      }

      report(
        `Collection repair completed successfully: deleted ${deletedCount} collections and repaired ${repairedCount}.`,
        "success",
      );

      return { deletedCount, repairedCount };
    });
  },
);

export const updateCollection = makeAction(
  registerMetadataWork(
    "updateCollection",
    async (updates: Omit<Partial<models.FileCollectionSchema>, "tagIds"> & { id: string }) => {
      const coll = await models.FileCollectionModel.findOne({ _id: updates.id });

      if (!coll) throw new Error("Collection not found");

      updates.dateModified = dayjs().toISOString();

      if (updates.fileIdIndexes) {
        const files = await models.FileModel.find({
          _id: { $in: objectIds(updates.fileIdIndexes.map(({ fileId }) => fileId)) },
        })
          .select({ _id: 1 })
          .lean();

        const fileIds = new Set(files.map((file) => String(file._id)));

        updates.fileIdIndexes = dedupeFileIdIndexes(
          updates.fileIdIndexes.filter(({ fileId }) => fileIds.has(String(fileId))),
        );

        updates.fileCount = updates.fileIdIndexes.length;
      }

      const res = await models.FileCollectionModel.updateOne(
        { _id: updates.id },
        { $inc: { __v: 1 }, $set: updates },
        {
          ...metadataWriteOptions(),
          new: true,
        },
      );

      if (updates.fileIdIndexes)
        await syncCollectionFileIds(
          updates.id,
          updates.fileIdIndexes.map(({ fileId }) => String(fileId)),
        );

      if (updates.fileIdIndexes || (updates.ratingIsManual === false && coll.ratingIsManual)) {
        const queued = await regenCollAttrs({ collIds: [updates.id] });

        if (!queued.success) throw new Error(queued.error);
      }

      socket.emit("onFileCollectionUpdated", { id: updates.id, updates });

      return res;
    },
  ),
);
