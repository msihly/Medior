import { FileModel, FileSchema } from "medior/_generated/server/models";
import { setFileIsArchived } from "medior/server/database/actions/files";
import { mergeDuplicateFile } from "medior/server/database/duplicate-merge";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import {
  compareDuplicateQuality,
  DuplicateGroup,
  getDuplicateScanGroups,
  getDuplicateScanGroupsById,
  getDuplicateScanProgress,
  listDuplicateScanGroups,
  pauseDuplicateScan,
  startDuplicateScan,
  updateDuplicateScanGroups,
} from "medior/server/lower-resolution";
import { DuplicateSearchOptions } from "medior/utils/common/duplicate-search";
import { leanModelToJson, makeAction } from "medior/utils/server";

/**
 * Archives selected files group by group, skipping groups that changed or would be emptied.
 * With metadata merging, each archived file is first merged into the group's kept file exactly as
 * the media transformer merges duplicates.
 */
export const archiveLowerResolutionCopy = makeAction(
  async ({
    groups,
    mergeMetadata = false,
    scanId,
  }: {
    groups: { fileIds: string[]; groupId: string }[];
    mergeMetadata?: boolean;
    scanId: string;
  }) =>
    withMetadataMutation(async () => {
      const scanGroups = await getDuplicateScanGroupsById(
        scanId,
        groups.map((group) => group.groupId),
      );
      const scanGroupsById = new Map(scanGroups.map((group) => [group._id, group]));
      // Merging needs complete records; plain archiving only checks hashes and picks keepers.
      const files = await FileModel.find({
        _id: { $in: scanGroups.flatMap((group) => group.files.map((file) => file.id)) },
        isArchived: { $ne: true },
      })
        .select(mergeMetadata ? {} : { duration: 1, hash: 1, height: 1, size: 1, width: 1 })
        .lean();
      const byId = new Map(
        files.map((file) => [String(file._id), leanModelToJson<FileSchema>(file)]),
      );
      const documentsById = new Map(files.map((file) => [String(file._id), file]));
      const archivedIds: string[] = [];
      const failures: string[] = [];
      const updates: Parameters<typeof updateDuplicateScanGroups>[1] = [];

      for (const { fileIds, groupId } of groups) {
        const group = scanGroupsById.get(groupId);
        const available = group?.files.filter((file) => byId.has(file.id)) ?? [];
        const remaining = available.filter((file) => !fileIds.includes(file.id));
        const archiving = fileIds.filter((id) => byId.has(id));

        if (!group) failures.push("A selected group is no longer part of the search.");
        else if (fileIds.some((id) => !group.files.some((file) => file.id === id)))
          failures.push("Only files from their own group can be archived.");
        else if (available.some((file) => byId.get(file.id).hash !== file.hash))
          failures.push("A file changed after the search. Search again to review it.");
        else if (!remaining.length) failures.push("Keep at least one file from each group.");
        else {
          try {
            if (mergeMetadata) {
              // The keeper may itself be archived; the group is re-scored around its best remaining file.
              const keeperId = remaining
                .map((file) => byId.get(file.id))
                .sort(compareDuplicateQuality)[0].id;

              // Each merge reads the keeper as the previous merge left it.
              for (const fileId of archiving) {
                const keeper = await FileModel.findById(keeperId).lean();
                await mergeDuplicateFile(documentsById.get(fileId), keeper);
              }
            }

            archivedIds.push(...archiving);
            updates.push({ files: remaining, group });
          } catch (error) {
            failures.push(`Could not merge into the kept file: ${error.message}`);
          }
        }
      }

      if (archivedIds.length) {
        const result = await setFileIsArchived({ fileIds: archivedIds, isArchived: true });
        if (!result.success) throw new Error(result.error);
      }

      await updateDuplicateScanGroups(scanId, updates);

      return { failures, fileIds: archivedIds };
    }),
);

/** Every file at or above the threshold except each group's keeper, across all pages. */
export const listLowerResolutionDuplicateIds = makeAction(
  async ({ minSimilarity, scanId }: { minSimilarity: number; scanId: string }) => {
    const groups = await listDuplicateScanGroups(scanId, minSimilarity);
    const files = await FileModel.find({
      _id: { $in: [...new Set(groups.flatMap((group) => group.files.map((file) => file.id)))] },
      isArchived: { $ne: true },
    })
      .select({ _id: 1 })
      .lean();
    const availableIds = new Set(files.map((file) => String(file._id)));

    // A group whose keeper was archived elsewhere is re-scored when its page is listed.
    return groups.flatMap((group) => {
      const fileIds = group.files
        .filter(
          (file) =>
            file.id !== group.keeperId && file.score >= minSimilarity && availableIds.has(file.id),
        )
        .map((file) => file.id);

      return availableIds.has(group.keeperId) && fileIds.length
        ? [{ fileIds, groupId: group._id }]
        : [];
    });
  },
);

export const getLowerResolutionScan = makeAction(
  async (args: { scanId?: string; sourceFileId?: string }) => getDuplicateScanProgress(args),
);

export const listLowerResolutionCopies = makeAction(
  async ({
    minSimilarity,
    page = 1,
    scanId,
  }: {
    minSimilarity: number;
    page?: number;
    scanId: string;
  }) => {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid review page.");

    const {
      groups,
      page: currentPage,
      total,
    } = await getDuplicateScanGroups(scanId, page, minSimilarity);
    const fileIds = [...new Set(groups.flatMap((group) => group.files.map((file) => file.id)))];
    const files = await FileModel.find({ _id: { $in: fileIds }, isArchived: { $ne: true } }).lean();
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
    const items: DuplicateGroup[] = [];
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
            { id: current.keeperId, score: 100 },
            ...members.sort((a, b) => b.score - a.score),
          ].map((file) => ({ ...byId.get(file.id), similarity: file.score })),
          id: group._id,
          score: current.score,
        });
      }
    }

    return { items, page: currentPage, total: total - hiddenCount };
  },
);

export const pauseLowerResolutionScan = makeAction(async ({ scanId }: { scanId: string }) =>
  pauseDuplicateScan(scanId),
);

export const startLowerResolutionScan = makeAction(
  async ({
    options,
    restart,
    sourceFileId,
  }: {
    options: DuplicateSearchOptions;
    restart?: boolean;
    sourceFileId?: string;
  }) =>
    withMetadataMutation(async () => ({
      scanId: await startDuplicateScan(options, sourceFileId, restart),
    })),
);
