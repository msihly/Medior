import path from "path";
import * as models from "medior/_generated/server/models";
import { AnyBulkWriteOperation } from "mongodb";
import { FilterQuery } from "mongoose";
import { fileLog, makePerfLog } from "trabecula/utils/server";
import * as actions from "medior/server/database/actions";
import { makeRepairReporter } from "medior/server/database/repair-progress";
import { SortMenuProps } from "medior/components";
import { chunkArray, dayjs, PromiseQueue } from "medior/utils/common";
import { leanModelToJson, makeAction, objectIds, socket } from "medior/utils/server";

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
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

const deriveCommonFolderPath = (folderPaths: string[]) => {
  folderPaths = folderPaths.filter(Boolean);
  if (!folderPaths.length) return null;

  const root = path.win32.parse(folderPaths[0]).root;
  if (
    !folderPaths.every(
      (folderPath) => path.win32.parse(folderPath).root.toLowerCase() === root.toLowerCase(),
    )
  )
    return null;
  const splitPaths = folderPaths.map((folderPath) =>
    path.win32
      .relative(root, folderPath)
      .split(/[\\/]+/)
      .filter(Boolean),
  );

  const commonParts: string[] = [];
  const maxLength = Math.min(...splitPaths.map((parts) => parts.length));
  for (let index = 0; index < maxLength; index++) {
    const part = splitPaths[0][index];
    if (!splitPaths.every((parts) => parts[index].toLowerCase() === part.toLowerCase())) break;
    commonParts.push(part);
  }

  return commonParts.length ? path.win32.join(root, ...commonParts) : null;
};

const deriveCommonSourceFolderPath = (originalPaths: string[]) =>
  deriveCommonFolderPath(originalPaths.map((filePath) => path.win32.dirname(filePath)));

const deriveCollectionSourceFolderPath = async (collection: models.FileCollectionSchema) => {
  if (collection.sourceFolderPaths?.length) return collection.sourceFolderPaths[0];

  const fileIds = collection.fileIdIndexes.map(({ fileId }) => fileId).filter(Boolean);
  const files = await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ originalPath: 1 })
    .lean();
  const fromFiles = deriveCommonSourceFolderPath(files.map((file) => file.originalPath));
  if (fromFiles) return fromFiles;

  const batches = await models.FileImportBatchModel.find({ collectionId: collection.id })
    .select({ imports: 1 })
    .lean();
  return deriveCommonSourceFolderPath(
    batches.flatMap((batch) => batch.imports?.map((fileImport) => fileImport.path) ?? []),
  );
};

const makeCollAttrs = async (
  files: models.FileSchema[],
  fileIdIndexes: { fileId: string; index: number }[],
): Promise<{
  fileCount: number;
  rating: number;
  size: number;
  tagIds: string[];
  tagIdsWithAncestors: string[];
}> => {
  const indexMap = new Map(fileIdIndexes.map((f) => [f.fileId, f.index]));
  const sortedFiles = [...files].sort((a, b) => indexMap.get(a.id) - indexMap.get(b.id));
  const ratedFiles = sortedFiles.filter((f) => f.rating > 0);
  const tagIds = [
    ...new Set([...sortedFiles.map((f) => f.tagIds.map((id) => id.toString())).flat()]),
  ];

  return {
    fileCount: sortedFiles.length,
    rating:
      ratedFiles.length > 0
        ? ratedFiles.reduce((acc, f) => acc + f.rating, 0) / ratedFiles.length
        : 0,
    size: sortedFiles.reduce((acc, f) => acc + f.size, 0),
    tagIds,
    tagIdsWithAncestors: await actions.deriveAncestorTagIds(tagIds),
  };
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const addFilesToCollection = makeAction(
  async (args: { collId: string; fileIds: string[] }) => {
    const collRes = await models.FileCollectionModel.findById(args.collId).lean();
    if (!collRes) throw new Error("Collection not found");

    const existingFileIds = collRes.fileIdIndexes.map((f) => f.fileId);
    const fileIdsToAdd = args.fileIds.filter((id) => !existingFileIds.includes(id));

    const newFileIdIndexes = [...new Set([...fileIdsToAdd, ...existingFileIds])].map(
      (fileId, index) => ({ fileId, index }),
    );

    const updateRes = await updateCollection({ id: args.collId, fileIdIndexes: newFileIdIndexes });
    if (!updateRes.success) throw new Error(updateRes.error);
    return updateRes.data;
  },
);

export const createCollection = makeAction(
  async (args: {
    fileIdIndexes: { fileId: string; index: number }[];
    sourceFolderPath?: string;
    title: string;
    withSub?: boolean;
  }) => {
    const deduped = dedupeFileIdIndexes(args.fileIdIndexes);
    const filesRes = await actions.listFile({
      args: { filter: { id: deduped.map((f) => f.fileId) } },
    });
    if (!filesRes.success) throw new Error(filesRes.error);
    if (filesRes.data.items?.length !== deduped.length) {
      fileLog({ deduped, resFileIds: filesRes.data.items.map((f) => f.id) });
      throw new Error(`Some files not found (${deduped.length} != ${filesRes.data.items?.length})`);
    }

    const dateCreated = dayjs().toISOString();
    const collection = {
      ...(await makeCollAttrs(filesRes.data.items, deduped)),
      dateCreated,
      dateModified: dateCreated,
      fileIdIndexes: deduped,
      sourceFolderKeys: args.sourceFolderPath
        ? [normalizeSourceFolderPath(args.sourceFolderPath)]
        : [],
      sourceFolderPaths: args.sourceFolderPath ? [args.sourceFolderPath] : [],
      title: args.title,
    };

    const res = await models.FileCollectionModel.create(collection);
    if (args.withSub) socket.emit("onFileCollectionCreated", res);
    return { ...collection, id: res._id.toString() };
  },
);

export const upsertImportedCollection = makeAction(
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
        [...(collection.sourceFolderPaths ?? []), args.sourceFolderPath].map((sourceFolderPath) => [
          normalizeSourceFolderPath(sourceFolderPath),
          sourceFolderPath,
        ]),
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
  async (args: {
    fileIdIndexes: { fileId: string; index: number }[];
    ids: string[];
    title: string;
  }) => {
    if (args.ids.length < 2 || new Set(args.ids).size !== args.ids.length)
      throw new Error("At least two unique collections are required to merge");
    if (!args.title.trim()) throw new Error("A collection title is required");

    const collections = (
      await models.FileCollectionModel.find({ _id: { $in: objectIds(args.ids) } }).lean()
    ).map((collection) => leanModelToJson<models.FileCollectionSchema>(collection));
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
);

export const deleteCollections = makeAction(async (args: { ids: string[] }) => {
  const res = await models.FileCollectionModel.deleteMany({ _id: { $in: objectIds(args.ids) } });
  if (res.deletedCount) socket.emit("onFileCollectionsDeleted", args);
  return res;
});

export const listAllCollectionIds = makeAction(async () => {
  return (await models.FileCollectionModel.find().select({ _id: 1 }).lean()).map((c) =>
    c._id.toString(),
  );
});

export const findRelatedCollectionGroups = makeAction(
  async (args: {
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
      await models.FileCollectionModel.find({})
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
                  : deriveCommonFolderPath([currentPath, folderPath]);
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
          .select({ collectionId: 1, imports: 1 })
          .lean();
        const importPathsByCollectionId = new Map<string, string[]>();
        for (const batch of batches) {
          const collectionId = batch.collectionId?.toString();
          if (!collectionId) continue;
          const importPaths = importPathsByCollectionId.get(collectionId) ?? [];
          importPaths.push(...(batch.imports?.map((fileImport) => fileImport.path) ?? []));
          importPathsByCollectionId.set(collectionId, importPaths);
        }
        for (const [collectionId, importPaths] of importPathsByCollectionId) {
          const collectionIndex = collectionIndexById.get(collectionId);
          const derived = deriveCommonSourceFolderPath(importPaths);
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

export const regenCollAttrs = makeAction(
  async (
    args: {
      collFilter?: FilterQuery<models.FileCollectionSchema>;
      collIds?: string[];
      fileIds?: string[];
    } = {},
  ) => {
    const { perfLog, perfLogTotal } = makePerfLog("[regenCollAttrs]");

    const collections = (
      await models.FileCollectionModel.find(
        {
          ...(args.collFilter ??
            (args.collIds?.length
              ? { _id: { $in: objectIds(args.collIds) } }
              : args.fileIds?.length
                ? { fileIdIndexes: { $elemMatch: { fileId: { $in: args.fileIds } } } }
                : {})),
        },
        null,
        { strict: false },
      )
        .select({ _id: 1, fileIdIndexes: 1, rating: 1, ratingIsManual: 1 })
        .allowDiskUse(true)
        .lean()
    ).map((r) => leanModelToJson<models.FileCollectionSchema>(r));

    perfLog(`Found ${collections.length} to regen.`);

    const queue = new PromiseQueue({ concurrency: 10 });

    const errors: { collId: string; error: string }[] = [];
    collections.forEach((c) => {
      queue.add(async () => {
        try {
          const fileIds = c.fileIdIndexes.map((f) => f.fileId);
          const filesRes = await actions.listFile({ args: { filter: { id: fileIds } } });
          if (!filesRes.success) throw new Error(filesRes.error);

          const newAttrs = await makeCollAttrs(filesRes.data.items, c.fileIdIndexes);
          const updates = {
            ...newAttrs,
            rating: c.ratingIsManual ? c.rating : newAttrs.rating,
          };
          await models.FileCollectionModel.updateOne({ _id: c.id }, updates);
          socket.emit("onFileCollectionUpdated", { id: c.id, updates });
        } catch (err) {
          errors.push({ collId: c.id, error: err.message });
          perfLog(`[ERROR] ${err.message}`);
        }
      });
    });

    await queue.resolve();
    if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
    perfLogTotal("Regenerated collections.");
  },
);

export const regenCollTagAncestors = makeAction(
  async (
    args: (
      | { collectionIds: string[]; tagIds?: never }
      | { collectionIds?: never; tagIds: string[] }
    ) & { repairId?: string },
  ) => {
    const batchSize = 1000;
    let processedCount = 0;
    let updatedCount = 0;
    let collections: models.FileCollectionSchema[] = [];
    const reporter = args.repairId ? makeRepairReporter(args.repairId, "repairTags") : undefined;
    const report = reporter?.report;

    const processBatch = async () => {
      reporter?.checkCancelled();
      if (!collections.length) return;

      const tagIds = new Set<string>();
      for (const collection of collections) {
        for (const tagId of collection.tagIds) tagIds.add(tagId);
      }

      const ancestorsMap = await actions.makeAncestorIdsMap([...tagIds]);
      const bulkWriteOps: AnyBulkWriteOperation[] = [];

      for (const collection of collections) {
        const { hasUpdates, tagIdsWithAncestors } = actions.makeUniqueAncestorUpdates({
          ancestorsMap,
          oldTagIdsWithAncestors: collection.tagIdsWithAncestors,
          tagIds: collection.tagIds,
        });

        if (!hasUpdates) continue;
        bulkWriteOps.push({
          updateOne: {
            filter: { _id: collection.id },
            update: { $set: { tagIdsWithAncestors } },
          },
        });
      }

      if (bulkWriteOps.length > 0) {
        await models.FileCollectionModel.bulkWrite(bulkWriteOps, { ordered: false });
      }
      processedCount += collections.length;
      updatedCount += bulkWriteOps.length;
      collections = [];
      report?.(
        `Processed ${processedCount} collections; repaired cached tag ancestors on ${updatedCount}.`,
        "progress",
      );
    };

    const cursor = models.FileCollectionModel.find({
      ...(args.collectionIds ? { _id: { $in: objectIds(args.collectionIds) } } : {}),
      ...(args.tagIds
        ? {
            $or: [
              { tagIds: { $in: objectIds(args.tagIds) } },
              { tagIdsWithAncestors: { $in: objectIds(args.tagIds) } },
            ],
          }
        : {}),
    })
      .select({ _id: 1, tagIds: 1, tagIdsWithAncestors: 1 })
      .lean()
      .cursor({ batchSize });

    for await (const collection of cursor) {
      reporter?.checkCancelled();
      collections.push(leanModelToJson<models.FileCollectionSchema>(collection));
      if (collections.length >= batchSize) await processBatch();
    }
    await processBatch();

    return { processedCount, updatedCount };
  },
);

export const repairCollections = makeAction(
  async ({
    deleteExactDuplicates = true,
    deleteSubsetCollections = true,
    repairId,
  }: {
    deleteExactDuplicates?: boolean;
    deleteSubsetCollections?: boolean;
    repairId: string;
  }) => {
    const { checkCancelled, report, run } = makeRepairReporter(repairId, "repairCollections");
    return run(async () => {
      const deletedIds: string[] = [];

      /* -------------------- Deduplicate collections by fileId ------------------- */
      report("Loading collections to identify duplicates.");
      const collections = await models.FileCollectionModel.find({});
      const seen = new Set<string>();
      const duplicateIds: string[] = [];

      report(`Loaded ${collections.length} collections.`, "progress");
      for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex++) {
        checkCancelled();
        const collection = collections[collectionIndex];
        const key = [...collection.fileIdIndexes]
          .filter((f) => f.fileId)
          .map((f) => f.fileId.toString())
          .sort()
          .join(",");
        if (deleteExactDuplicates && seen.has(key)) duplicateIds.push(collection._id.toString());
        else seen.add(key);
        if ((collectionIndex + 1) % 1000 === 0 || collectionIndex + 1 === collections.length)
          report(
            `Checked ${collectionIndex + 1} / ${collections.length} collections for duplicates.`,
            "progress",
          );
      }

      report(
        deleteExactDuplicates
          ? `Found ${duplicateIds.length} duplicate collections.`
          : "Exact duplicate deletion is disabled.",
        "progress",
      );
      if (duplicateIds.length) {
        report(`Deleting ${duplicateIds.length} duplicate collections.`);
        await models.FileCollectionModel.deleteMany({ _id: { $in: duplicateIds } });
        deletedIds.push(...duplicateIds);
      }

      /* ------------------------ Delete empty collections ------------------------ */
      report("Searching for empty collections.");
      checkCancelled();
      const emptyCollections = await models.FileCollectionModel.find({ fileCount: 0 }, { _id: 1 });
      const emptyIds = emptyCollections.map((c) => c._id.toString());

      report(`Found ${emptyIds.length} empty collections.`, "progress");
      if (emptyIds.length) {
        report(`Deleting ${emptyIds.length} empty collections.`);
        await models.FileCollectionModel.deleteMany({ _id: { $in: emptyIds } });
        deletedIds.push(...emptyIds);
      }

      /* -------- Remove duplicate and invalid fileIds, collapse index gaps ------- */
      report("Checking remaining collections for invalid IDs, duplicate IDs, and index gaps.");
      const remaining = await models.FileCollectionModel.find({});
      const bulkOps = [];

      report(`Checking ${remaining.length} remaining collections.`, "progress");
      for (let collectionIndex = 0; collectionIndex < remaining.length; collectionIndex++) {
        checkCancelled();
        const collection = remaining[collectionIndex];
        const cleaned = dedupeFileIdIndexes(collection.fileIdIndexes);

        const hasChanges =
          cleaned.length !== collection.fileIdIndexes.length ||
          cleaned.some((entry, i) => entry.index !== collection.fileIdIndexes[i]?.index);

        if (hasChanges)
          bulkOps.push({
            updateOne: {
              filter: { _id: collection._id },
              update: { $set: { fileIdIndexes: cleaned, fileCount: cleaned.length } },
            },
          });
        if ((collectionIndex + 1) % 1000 === 0 || collectionIndex + 1 === remaining.length)
          report(
            `Checked ${collectionIndex + 1} / ${remaining.length} collection file indexes.`,
            "progress",
          );
      }

      report(`Found ${bulkOps.length} collections with file-index problems.`, "progress");
      if (bulkOps.length) {
        report(`Repairing file indexes on ${bulkOps.length} collections.`);
        const res = await models.FileCollectionModel.bulkWrite(bulkOps);
        if (res.modifiedCount !== bulkOps.length) {
          throw new Error("Deduplication of fileIdIndexes failed!");
        }
      }

      /* --------------- Delete collections that are subsets of others ------------ */
      report("Loading repaired collections for subset detection.");
      const remaining1 = await models.FileCollectionModel.find({});
      const fileIdSets = remaining1.map((collection) => ({
        id: collection._id.toString(),
        fileIds: new Set(
          collection.fileIdIndexes.filter((f) => f.fileId).map((f) => f.fileId.toString()),
        ),
      }));
      fileIdSets.sort((a, b) => a.fileIds.size - b.fileIds.size);
      report(`Loaded ${fileIdSets.length} collections for subset detection.`, "progress");

      report("Searching for collections whose files are entirely contained by another collection.");
      const subsetIds: string[] = [];
      if (deleteSubsetCollections) {
        for (let i = 0; i < fileIdSets.length; i++) {
          checkCancelled();
          if (!subsetIds.includes(fileIdSets[i].id)) {
            for (let j = i + 1; j < fileIdSets.length; j++) {
              if (fileIdSets[i].fileIds.size === fileIdSets[j].fileIds.size) continue;
              if ([...fileIdSets[i].fileIds].every((id) => fileIdSets[j].fileIds.has(id))) {
                subsetIds.push(fileIdSets[i].id);
                break;
              }
            }
          }
          if ((i + 1) % 100 === 0 || i + 1 === fileIdSets.length)
            report(
              `Checked ${i + 1} / ${fileIdSets.length} collections for subset relationships.`,
              "progress",
            );
        }
      }

      report(
        deleteSubsetCollections
          ? `Found ${subsetIds.length} subset collections.`
          : "Subset collection deletion is disabled.",
        "progress",
      );
      if (subsetIds.length) {
        checkCancelled();
        report(`Deleting ${subsetIds.length} subset collections.`);
        await models.FileCollectionModel.deleteMany({ _id: { $in: subsetIds } });
        deletedIds.push(...subsetIds);
      }

      if (deletedIds.length) socket.emit("onFileCollectionsDeleted", { ids: deletedIds });
      report(
        `Collection repair completed successfully: deleted ${deletedIds.length} collections and repaired ${bulkOps.length}.`,
        "success",
      );
      return { deletedCount: deletedIds.length, repairedCount: bulkOps.length };
    });
  },
);

export const updateCollection = makeAction(
  async (updates: Omit<Partial<models.FileCollectionSchema>, "tagIds"> & { id: string }) => {
    const coll = await models.FileCollectionModel.findOne({ _id: updates.id });
    updates.dateModified = dayjs().toISOString();

    if (updates.fileIdIndexes) {
      const fileIds = updates.fileIdIndexes.map((f) => f.fileId);
      const filesRes = await actions.listFile({ args: { filter: { id: fileIds } } });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data.items;
      const fileMap = new Map(files.map((file) => [String(file.id), file]));

      const newFileIndexes = updates.fileIdIndexes
        .filter((f) => fileMap.has(String(f.fileId)))
        .map((f, i) => ({ fileId: f.fileId, index: i }));

      const newAttrs = await makeCollAttrs(files, newFileIndexes);
      updates = {
        ...updates,
        ...newAttrs,
        fileIdIndexes: newFileIndexes,
        rating: updates.ratingIsManual
          ? (updates.rating ?? coll.rating)
          : coll.ratingIsManual
            ? coll.rating
            : newAttrs.rating,
      };
    } else if (updates.ratingIsManual === false && coll.ratingIsManual) {
      const fileIds = coll.fileIdIndexes.map((f) => f.fileId);
      const filesRes = await actions.listFile({ args: { filter: { id: fileIds } } });
      if (!filesRes.success) throw new Error(filesRes.error);
      const files = filesRes.data.items;

      const newAttrs = await makeCollAttrs(files, coll.fileIdIndexes);
      updates = { ...updates, ...newAttrs };
    }

    const res = await models.FileCollectionModel.updateOne({ _id: updates.id }, updates, {
      new: true,
    });
    socket.emit("onFileCollectionUpdated", { id: updates.id, updates });
    return res;
  },
);
