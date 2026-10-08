import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { DuplicateGroup } from "medior/server/lower-resolution";
import { RootStore } from "medior/store";
import { asyncAction, toast } from "medior/utils/client";
import { chunkArray, sleep } from "medior/utils/common";
import {
  DEFAULT_DUPLICATE_SEARCH_OPTIONS,
  DUPLICATE_PAGE_SIZE,
  DuplicateSearchOptions,
  validateDuplicateSearchOptions,
} from "medior/utils/common/duplicate-search";
import { trpc } from "medior/utils/server";

const ARCHIVE_BATCH_SIZE = 25;

@model("medior/LowerResolutionStore")
export class LowerResolutionStore extends Model({
  archiveProcessed: prop<number>(0).withSetter(),
  archiveStopRequested: prop<boolean>(false).withSetter(),
  archiveTotal: prop<number>(0).withSetter(),
  cancelRequested: prop<boolean>(false).withSetter(),
  error: prop<string>("").withSetter(),
  found: prop<number>(0).withSetter(),
  groups: prop<DuplicateGroup[]>(() => []).withSetter(),
  hasSearchIndex: prop<boolean>(true).withSetter(),
  isArchiving: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPageLoading: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  isStarting: prop<boolean>(false).withSetter(),
  lastSelectedId: prop<string>(null).withSetter(),
  /** Merges archived files into each group's kept file the way the media transformer merges duplicates. */
  mergeMetadata: prop<boolean>(false).withSetter(),
  minSimilarity: prop<number>(DEFAULT_DUPLICATE_SEARCH_OPTIONS.minSimilarity).withSetter(),
  page: prop<number>(1).withSetter(),
  processed: prop<number>(0).withSetter(),
  rate: prop<number>(0).withSetter(),
  /** Groups with a duplicate at or above the review threshold. */
  reviewCount: prop<number>(0).withSetter(),
  reviewOptions: prop<DuplicateSearchOptions>(null).withSetter(),
  scanId: prop<string>(null).withSetter(),
  /** Selected file IDs mapped to their groups, so selections survive paging. */
  selection: prop<Record<string, string>>(() => ({})).withSetter(),
  skipped: prop<number>(0).withSetter(),
  sourceFileId: prop<string>(null).withSetter(),
  status: prop<"complete" | "error" | "idle" | "paused" | "running">("idle").withSetter(),
  total: prop<number>(0).withSetter(),
  unindexedCount: prop<number>(0).withSetter(),
}) {
  private pageAbortController: AbortController = null;
  private pollRevision = 0;

  onInit() {
    autoBind(this);
  }

  /** Stored groups only hold matches at or above the scan's threshold; lower ones need a rescan. */
  get needsRescan() {
    return !this.reviewOptions || this.minSimilarity < this.reviewOptions.minSimilarity;
  }

  /** Raising the threshold above the scan's own filters stored scores without rescanning. */
  get reviewThreshold() {
    return Math.max(this.minSimilarity, this.reviewOptions?.minSimilarity ?? 0);
  }

  get isScanning() {
    return this.status === "running";
  }

  get options(): DuplicateSearchOptions {
    return { minSimilarity: this.minSimilarity };
  }

  get pageCount() {
    return Math.ceil(this.reviewCount / DUPLICATE_PAGE_SIZE);
  }

  get selectedCount() {
    return Object.keys(this.selection).length;
  }

  @modelAction
  cancelPageLoad() {
    this.pageAbortController?.abort();
    this.pageAbortController = null;
    this.setIsPageLoading(false);
  }

  @modelAction
  close() {
    this.cancelPageLoad();
    this.setIsOpen(false);
  }

  /** Re-filters stored results after the threshold changes, unless a rescan is needed first. */
  @modelAction
  applyReviewThreshold() {
    if (this.scanId && !this.needsRescan) {
      this.clearSelection();
      this.loadPage(1);
    }
  }

  @modelAction
  clearSelection() {
    this.setSelection({});
    this.setLastSelectedId(null);
  }

  /** Shift-click selects every tile between the last clicked tile and this one on the page. */
  @modelAction
  toggleSelected(fileId: string, hasShift = false) {
    if (this.isArchiving) return;

    const tiles = this.groups.flatMap((group) =>
      group.files.map((file) => ({ fileId: file.id, group })),
    );
    const index = tiles.findIndex((tile) => tile.fileId === fileId);
    const anchorIndex = tiles.findIndex((tile) => tile.fileId === this.lastSelectedId);
    const { group } = tiles[index];
    const selection = { ...this.selection };

    if (hasShift && anchorIndex > -1) {
      const range = tiles.slice(Math.min(index, anchorIndex), Math.max(index, anchorIndex) + 1);

      for (const tile of range) selection[tile.fileId] = tile.group.id;

      // A range never archives a whole group; its best-quality file stays unselected.
      for (const rangeGroup of new Set(range.map((tile) => tile.group))) {
        if (rangeGroup.files.every((file) => selection[file.id]))
          delete selection[rangeGroup.files[0].id];
      }
    } else if (selection[fileId]) delete selection[fileId];
    else if (group.files.every((file) => file.id === fileId || selection[file.id]))
      toast.warn("Keep at least one file from each group.");
    else selection[fileId] = group.id;

    this.setSelection(selection);
    this.setLastSelectedId(fileId);
  }

  @modelFlow
  archive = asyncAction(async () => {
    if (this.isStarting || this.isArchiving || this.isPageLoading || !this.selectedCount) return;

    const stores = getRootStore<RootStore>(this);

    const fileIdsByGroup = new Map<string, string[]>();
    let archived = 0;
    let failed = 0;

    for (const [fileId, groupId] of Object.entries(this.selection)) {
      if (!fileIdsByGroup.has(groupId)) fileIdsByGroup.set(groupId, []);

      fileIdsByGroup.get(groupId).push(fileId);
    }

    this.setIsArchiving(true);
    this.setArchiveProcessed(0);
    this.setArchiveStopRequested(false);
    this.setArchiveTotal(this.selectedCount);
    this.setError("");

    try {
      const groups = [...fileIdsByGroup].map(([groupId, fileIds]) => ({ fileIds, groupId }));

      for (const batch of chunkArray(groups, ARCHIVE_BATCH_SIZE)) {
        if (this.archiveStopRequested) break;

        const result = await trpc.archiveLowerResolutionCopy.mutate({
          groups: batch,
          mergeMetadata: this.mergeMetadata,
          scanId: this.scanId,
        });

        if (!result.success) {
          failed += batch.length;
          this.setError(result.error);
        } else {
          const selection = { ...this.selection };

          archived += result.data.fileIds.length;
          failed += result.data.failures.length;
          stores.file.updateArchivedFileIds(result.data.fileIds, true);

          if (result.data.failures.length) this.setError(result.data.failures.join(" "));

          for (const fileId of batch.flatMap((group) => group.fileIds)) delete selection[fileId];

          this.setSelection(selection);
        }

        this.setArchiveProcessed(
          this.archiveProcessed + batch.reduce((count, group) => count + group.fileIds.length, 0),
        );
      }

      const loaded = await this.loadPage(this.page);

      if (!loaded.success) throw new Error(loaded.error);

      toast.info(
        `Archived ${archived} duplicates${failed ? `; ${failed} groups need attention` : ""}`,
      );
    } catch (error) {
      this.setError(`Archived ${archived} duplicates before stopping: ${error.message}`);
    } finally {
      this.setIsArchiving(false);
      this.setArchiveStopRequested(false);
    }
  });

  /** Selects every file except the best one in each group, across all pages. */
  @modelFlow
  selectAllDuplicates = asyncAction(async () => {
    this.setIsSelecting(true);

    try {
      const result = await trpc.listLowerResolutionDuplicateIds.mutate({
        minSimilarity: this.reviewThreshold,
        scanId: this.scanId,
      });
      if (!result.success) throw new Error(result.error);

      const selection = { ...this.selection };

      for (const group of result.data) {
        for (const fileId of group.fileIds) selection[fileId] = group.groupId;
      }

      this.setSelection(selection);
    } catch (error) {
      this.setError(error.message);
    } finally {
      this.setIsSelecting(false);
    }
  });

  /** Only library scans use the opt-in search index; single files are searched exactly. */
  @modelFlow
  loadSearchIndexStatus = asyncAction(async () => {
    const result = await trpc.getSimilaritySearchIndexStatus.mutate();

    if (!result.success) throw new Error(result.error);

    this.setHasSearchIndex(result.data.hasIndex);
    this.setUnindexedCount(result.data.unindexedRowCount);
  });

  @modelFlow
  loadPage = asyncAction(async (page: number) => {
    this.cancelPageLoad();

    const controller = new AbortController();

    this.pageAbortController = controller;
    this.setIsPageLoading(true);

    try {
      const result = await trpc.listLowerResolutionCopies.mutate(
        { minSimilarity: this.reviewThreshold, page, scanId: this.scanId },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return false;

      if (!result.success) throw new Error(result.error);

      this.setGroups(result.data.items);
      this.setPage(result.data.page);
      this.setReviewCount(result.data.total);

      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;

      this.setError(error.message);

      throw error;
    } finally {
      if (this.pageAbortController === controller) {
        this.pageAbortController = null;
        this.setIsPageLoading(false);
      }
    }
  });

  @modelFlow
  open = asyncAction(async (sourceFileId: string = null) => {
    this.setIsOpen(true);

    if (this.isScanning || this.isStarting || this.isArchiving) {
      if (sourceFileId !== this.sourceFileId)
        toast.info("Showing the current duplicate search. Pause it before switching scope.");

      if (this.scanId && !this.isPageLoading) await this.loadPage(this.page);
    } else {
      this.pollRevision++;
      this.cancelPageLoad();
      this.setSourceFileId(sourceFileId);
      this.clearSelection();
      this.setGroups([]);
      this.setScanId(null);
      this.setStatus("idle");
      this.setFound(0);
      this.setReviewCount(0);
      this.setPage(1);
      this.setProcessed(0);
      this.setRate(0);
      this.setSkipped(0);
      this.setTotal(0);
      this.setUnindexedCount(0);
      this.setHasSearchIndex(true);
      this.setReviewOptions(null);
      this.setError("");
      this.setIsStarting(true);

      try {
        const result = await trpc.getLowerResolutionScan.mutate({
          sourceFileId: sourceFileId || undefined,
        });

        if (!result.success) throw new Error(result.error);

        if (result.data) {
          this.setMinSimilarity(result.data.options.minSimilarity);
          this.setScanId(result.data._id);
        }

        if (!sourceFileId) {
          const indexStatus = await this.loadSearchIndexStatus();

          if (!indexStatus.success) throw new Error(indexStatus.error);
        }
      } catch (error) {
        this.setError(error.message);
      } finally {
        this.setIsStarting(false);
      }

      if (this.scanId) await this.watchScan();
    }
  });

  @modelFlow
  pause = asyncAction(async () => {
    this.setCancelRequested(true);

    try {
      if (this.isScanning && this.scanId) {
        const result = await trpc.pauseLowerResolutionScan.mutate({ scanId: this.scanId });

        if (!result.success) throw new Error(result.error);
      }
    } catch (error) {
      this.setError(error.message);
      this.setCancelRequested(false);
    }
  });

  @modelFlow
  scan = asyncAction(async () => {
    if (this.isScanning || this.isStarting || this.isArchiving || this.isPageLoading) return;

    validateDuplicateSearchOptions(this.options);
    this.setIsStarting(true);
    this.setCancelRequested(false);
    this.setError("");
    this.clearSelection();

    try {
      if (!this.sourceFileId) {
        const indexStatus = await this.loadSearchIndexStatus();

        if (!indexStatus.success) throw new Error(indexStatus.error);

        // The modal explains how to build the index when it is still missing.
        if (!this.hasSearchIndex) return;
      }

      // A raised threshold only filters results, so resuming keeps the scan's own threshold.
      const restart = this.needsRescan || this.status === "complete";
      const options = restart ? this.options : this.reviewOptions;

      const result = await trpc.startLowerResolutionScan.mutate({
        options,
        restart,
        sourceFileId: this.sourceFileId || undefined,
      });
      if (!result.success) throw new Error(result.error);

      this.setScanId(result.data.scanId);
      this.setStatus("running");
      this.setGroups([]);
      this.setPage(1);
      this.setReviewOptions(options);
    } catch (error) {
      this.setError(error.message);
    } finally {
      this.setIsStarting(false);
    }

    if (this.isScanning) await this.watchScan();
  });

  @modelFlow
  private watchScan = asyncAction(async () => {
    const revision = ++this.pollRevision;
    const scanId = this.scanId;
    let displayedCount = -1;
    // Measures throughput from this watch's first sample so earlier runs and startup don't skew it.
    let baseline: { processed: number; time: number } = null;

    try {
      while (revision === this.pollRevision) {
        const result = await trpc.getLowerResolutionScan.mutate({ scanId });

        if (revision !== this.pollRevision) return;

        if (!result.success || !result.data)
          throw new Error(result.error || "Duplicate search not found.");

        const progress = result.data;
        const now = Date.now();

        baseline ??= { processed: progress.processed, time: now };

        if (now > baseline.time)
          this.setRate(((progress.processed - baseline.processed) * 1000) / (now - baseline.time));

        this.setError(progress.error);
        this.setFound(progress.found);
        this.setProcessed(progress.processed);
        this.setReviewOptions(progress.options);
        this.setSkipped(progress.skipped);
        this.setStatus(progress.status);
        this.setTotal(progress.total);

        // Fill the first page as groups arrive without reshuffling a page under review.
        if (
          this.isOpen &&
          !this.isPageLoading &&
          !this.isArchiving &&
          (progress.status !== "running" ||
            (displayedCount !== progress.found && this.groups.length < DUPLICATE_PAGE_SIZE))
        ) {
          const loaded = await this.loadPage(this.page);

          if (loaded.success && loaded.data) displayedCount = progress.found;
        }

        if (progress.status !== "running") {
          this.setCancelRequested(false);

          break;
        }

        await sleep(1000);
      }
    } catch (error) {
      if (revision === this.pollRevision) {
        this.setError(error.message);
        this.setStatus("error");
        this.setCancelRequested(false);
      }
    }
  });
}
