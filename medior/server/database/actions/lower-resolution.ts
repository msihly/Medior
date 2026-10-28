import { FileModel, FileSchema, TagModel, TagSchema } from "medior/_generated/server/models";
import { setFileIsArchived } from "medior/server/database/actions/files";
import { runBackgroundExecution } from "medior/server/database/background-execution";
import { mergeDuplicateFile } from "medior/server/database/duplicate-merge";
import { findJob, startJob } from "medior/server/database/jobs";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { getJpegCompression, rankDuplicateQuality } from "medior/server/duplicate-quality";
import {
  dismissDuplicateFiles,
  DuplicateGroup,
  getDuplicateScanGroups,
  getDuplicateScanGroupsById,
  getDuplicateScanProgress,
  isDuplicateScanGrouping,
  listDuplicateScanGroups,
  listNearbyFiles,
  pauseDuplicateGrouping,
  pauseDuplicateScan,
  resumeDuplicateGrouping,
  setDuplicateReviewOptions,
  startDuplicateScan,
  updateDuplicateScanGroups,
  waitForDuplicateGroupingSteps,
} from "medior/server/lower-resolution";
import { chunkArray, makeTagSelector } from "medior/utils/common";
import {
  DuplicateSearchOptions,
  validateDuplicateTimeWindow,
} from "medior/utils/common/duplicate-search";
import { leanModelToJson, makeAction } from "medior/utils/server";

/**
 * Groups archived together. Every write is durable, so a batch shares one archive and one search
 * update, while other metadata changes still wait for at most one batch.
 */
const ARCHIVE_BATCH_SIZE = 10;

const countFiles = (groups: { fileIds: string[] }[]) =>
  groups.reduce((count, group) => count + group.fileIds.length, 0);

/**
 * Archives a batch of groups' selected files, returning why each skipped group was skipped. With
 * metadata merging, each archived file is first merged into its group's kept file exactly as the
 * media transformer merges duplicates.
 */
const archiveDuplicateGroups = (
  scanId: string,
  batch: {
    fileIds: string[];
    group: Awaited<ReturnType<typeof getDuplicateScanGroupsById>>[number];
  }[],
  mergeMetadata: boolean,
) =>
  withMetadataMutation(async () => {
    // Merging needs complete records; plain archiving only checks hashes and picks keepers.
    const files = await FileModel.find({
      _id: { $in: batch.flatMap(({ group }) => group.files.map((file) => file.id)) },
      isArchived: { $ne: true },
    })
      .select(
        mergeMetadata
          ? {}
          : {
              bitrate: 1,
              duration: 1,
              ext: 1,
              hash: 1,
              height: 1,
              path: 1,
              size: 1,
              videoCodec: 1,
              width: 1,
            },
      )
      .lean();
    const byId = new Map(
      files.map((file) => [String(file._id), leanModelToJson<FileSchema>(file)]),
    );
    const documentsById = new Map(files.map((file) => [String(file._id), file]));
    const archived: string[] = [];
    const failures = new Map<string, string>();
    const updates: Parameters<typeof updateDuplicateScanGroups>[1] = [];

    for (const { fileIds, group } of batch) {
      const available = group.files.filter((file) => byId.has(file.id));
      const remaining = available.filter((file) => !fileIds.includes(file.id));
      const archiving = fileIds.filter((id) => byId.has(id));
      let failure: string = null;

      if (fileIds.some((id) => !group.files.some((file) => file.id === id)))
        failure = "Only files from their own group can be archived.";
      else if (available.some((file) => byId.get(file.id).hash !== file.hash))
        failure = "A file changed after the search. Search again to review it.";
      else if (!remaining.length) failure = "Keep at least one file from each group.";
      else if (mergeMetadata) {
        try {
          // The kept file shown in the review stays kept; when it is archived too, the group is
          // re-scored around its best remaining file.
          const keeperId = remaining.some((file) => file.id === group.keeperId)
            ? group.keeperId
            : (await rankDuplicateQuality(remaining.map((file) => byId.get(file.id))))[0].id;

          // Each merge reads the keeper as the previous merge left it.
          for (const fileId of archiving) {
            const keeper = await FileModel.findById(keeperId).lean();
            await mergeDuplicateFile(documentsById.get(fileId), keeper);
          }
        } catch (error) {
          failure = `Could not merge into the kept file: ${error.message}`;
        }
      }

      if (failure) failures.set(group._id, failure);
      else {
        archived.push(...archiving);
        updates.push({ files: remaining, group });
      }
    }

    if (archived.length) {
      const result = await setFileIsArchived({ fileIds: archived, isArchived: true });
      if (!result.success) throw new Error(result.error);
    }

    await updateDuplicateScanGroups(scanId, updates);

    return failures;
  });

/**
 * Archives the selected files in batches of groups on the server, skipping groups that changed or
 * would be emptied. Every file of a group may become its kept file, so each batch's groups stay
 * locked until the batch is done.
 */
export const startLowerResolutionArchive = makeAction(
  async ({
    groups,
    mergeMetadata = false,
    scanId,
  }: {
    groups: { fileIds: string[]; groupId: string }[];
    mergeMetadata?: boolean;
    scanId: string;
  }) => {
    const scanGroups = await getDuplicateScanGroupsById(
      scanId,
      groups.map((group) => group.groupId),
    );
    const scanGroupsById = new Map(scanGroups.map((group) => [group._id, group]));

    // Checked right before starting, so a second request sent meanwhile can't start another job.
    if (findJob("mergeDuplicates", scanId))
      throw new Error("Duplicates from this search are already being archived.");

    if (isDuplicateScanGrouping(scanId))
      throw new Error("Wait for the search's groups to be built before archiving.");

    return startJob({
      fileIds: scanGroups.flatMap((group) => group.files.map((file) => file.id)),
      label: mergeMetadata ? "Merge and Archive" : "Archive Duplicates",
      run: async (job) => {
        for (const selected of chunkArray(groups, ARCHIVE_BATCH_SIZE)) {
          job.signal.throwIfAborted();

          const batch = selected.map(({ fileIds, groupId }) => ({
            fileIds,
            group: scanGroupsById.get(groupId),
          }));
          const found = batch.filter(({ group }) => group);

          for (const { fileIds } of batch.filter(({ group }) => !group))
            job.addFailure("A selected group is no longer part of the search.", fileIds.length);

          try {
            // As background work, the batch's linked writes apply directly instead of each being
            // saved as its own request first. Without the job's signal, a started batch finishes.
            const failures = await runBackgroundExecution(
              () => archiveDuplicateGroups(scanId, found, mergeMetadata),
              undefined,
              false,
            );

            for (const { fileIds, group } of found) {
              if (failures.has(group._id)) job.addFailure(failures.get(group._id), fileIds.length);
            }
          } catch (error) {
            job.addFailure(error.message, countFiles(found));
          }

          job.complete(
            found.flatMap(({ group }) => group.files.map((file) => file.id)),
            countFiles(batch),
          );
        }
      },
      scope: scanId,
      total: countFiles(groups),
      type: "mergeDuplicates",
    });
  },
);

/** Marks the selected files as not duplicates, such as confirmed variations, so they stop appearing. */
export const dismissLowerResolutionDuplicates = makeAction(
  async ({
    groups,
    scanId,
  }: {
    groups: { fileIds: string[]; groupId: string }[];
    scanId: string;
  }) => {
    if (findJob("mergeDuplicates", scanId))
      throw new Error("Wait for the selected duplicates to be archived first.");

    if (isDuplicateScanGrouping(scanId))
      throw new Error("Wait for the search's groups to be built before marking files.");

    return dismissDuplicateFiles(scanId, groups);
  },
);

/**
 * Every file at or above the threshold except each group's keeper and its variations, across all
 * pages. Variations are only archived when picked one by one.
 */
export const listLowerResolutionDuplicateIds = makeAction(
  async ({ minSimilarity, scanId }: { minSimilarity: number; scanId: string }) => {
    const groups = await listDuplicateScanGroups(scanId, minSimilarity);
    const files = await FileModel.find({
      _id: { $in: [...new Set(groups.flatMap((group) => group.files.map((file) => file.id)))] },
      isArchived: { $ne: true },
      isCorrupted: { $ne: true },
    })
      .select({ _id: 1 })
      .lean();
    const availableIds = new Set(files.map((file) => String(file._id)));

    // A group whose keeper was archived elsewhere is re-scored when its page is listed.
    return groups.flatMap((group) => {
      const fileIds = group.files
        .filter(
          (file) =>
            file.id !== group.keeperId &&
            !file.isVariation &&
            file.score >= minSimilarity &&
            availableIds.has(file.id),
        )
        .map((file) => file.id);

      return availableIds.has(group.keeperId) && fileIds.length
        ? [{ fileIds, groupId: group._id }]
        : [];
    });
  },
);

export const getLowerResolutionScan = makeAction(async (args: { scanId?: string }) =>
  getDuplicateScanProgress(args),
);

/**
 * A page of groups at or above the threshold. With a date window, each group also lists the files
 * created within it.
 */
export const listLowerResolutionCopies = makeAction(
  async ({
    minSimilarity,
    page = 1,
    scanId,
    timeWindow = null,
  }: {
    minSimilarity: number;
    page?: number;
    scanId: string;
    timeWindow?: number | null;
  }) => {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid review page.");

    // An unbounded window would make every page scan the whole library for nearby files.
    validateDuplicateTimeWindow(timeWindow);

    const {
      groups,
      page: currentPage,
      total,
    } = await getDuplicateScanGroups(scanId, page, minSimilarity);
    const fileIds = [...new Set(groups.flatMap((group) => group.files.map((file) => file.id)))];
    // Files archived or found corrupted since grouping can no longer be kept or listed.
    const files = await FileModel.find({
      _id: { $in: fileIds },
      isArchived: { $ne: true },
      isCorrupted: { $ne: true },
    }).lean();
    const byId = new Map(
      files.map((file) => [String(file._id), leanModelToJson<FileSchema>(file)]),
    );
    // Archiving outside this search can remove a keeper or leave a group without duplicates.
    const updated = await updateDuplicateScanGroups(
      scanId,
      groups
        .filter((group) => !byId.has(group.keeperId))
        .map((group) => ({ files: group.files.filter((file) => byId.has(file.id)), group })),
    );
    const items: (Omit<DuplicateGroup, "files" | "nearby" | "nearbyCount"> & {
      files: (FileSchema & {
        difference: number | null;
        isVariation: boolean;
        similarity: number;
      })[];
    })[] = [];
    let hiddenCount = 0;

    for (const group of groups) {
      const current = byId.has(group.keeperId) ? group : updated.get(group._id);
      const members =
        current?.files.filter(
          (file) =>
            file.id !== current.keeperId && file.score >= minSimilarity && byId.has(file.id),
        ) ?? [];

      if (!members.length) hiddenCount++;
      else {
        items.push({
          files: [
            { difference: null, id: current.keeperId, isVariation: false, score: 100 },
            ...members.sort((a, b) => b.score - a.score),
          ].map((file) => ({
            ...byId.get(file.id),
            difference: file.difference ?? null,
            isVariation: !!file.isVariation,
            similarity: file.score,
          })),
          id: group._id,
          score: current.score,
        });
      }
    }

    const listedFiles = items.flatMap((item) => item.files);
    const [jpegs, nearby] = await Promise.all([
      Promise.all(listedFiles.map((file) => getJpegCompression(file.path))),
      timeWindow
        ? listNearbyFiles(
            scanId,
            items.map((item) => item.files),
            timeWindow,
          )
        : [],
    ]);
    const jpegById = new Map(listedFiles.map((file, index) => [file.id, jpegs[index]]));

    // The page's cards show their tags, loaded together for every listed and nearby file. Stored
    // tag IDs are database IDs, compared as text.
    const tags = await TagModel.find({
      _id: {
        $in: [
          ...new Set(
            [...listedFiles, ...nearby.flatMap((group) => group.files)].flatMap((file) =>
              file.tagIds.map(String),
            ),
          ),
        ],
      },
    }).lean();
    const selectTags = makeTagSelector(tags.map((tag) => leanModelToJson<TagSchema>(tag)));

    return {
      items: items.map((item, index): DuplicateGroup => ({
        ...item,
        files: item.files.map((file) => ({
          ...file,
          jpeg: jpegById.get(file.id),
          tags: selectTags(file.tagIds.map(String)),
        })),
        nearby: (nearby[index]?.files ?? []).map((file) => ({
          ...file,
          tags: selectTags(file.tagIds.map(String)),
        })),
        nearbyCount: nearby[index]?.count ?? 0,
      })),
      page: currentPage,
      total: total - hiddenCount,
    };
  },
);

export const pauseLowerResolutionGrouping = makeAction(async ({ scanId }: { scanId: string }) =>
  pauseDuplicateGrouping(scanId),
);

export const pauseLowerResolutionScan = makeAction(async ({ scanId }: { scanId: string }) =>
  pauseDuplicateScan(scanId),
);

export const resumeLowerResolutionGrouping = makeAction(async ({ scanId }: { scanId: string }) =>
  resumeDuplicateGrouping(scanId),
);

export const setLowerResolutionReviewOptions = makeAction(
  async ({ options, scanId }: { options: DuplicateSearchOptions; scanId: string }) =>
    setDuplicateReviewOptions(scanId, options),
);

export const startLowerResolutionScan = makeAction(
  async ({ options }: { options: DuplicateSearchOptions }) => {
    // Grouping finishes its current step first, which must not hold up other metadata writes.
    await waitForDuplicateGroupingSteps();

    return withMetadataMutation(async () => ({ scanId: await startDuplicateScan(options) }));
  },
);
