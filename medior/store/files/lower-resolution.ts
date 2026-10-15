import autoBind from "auto-bind";
import { reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { JobState } from "medior/server/database";
import type { DuplicateGroup } from "medior/server/lower-resolution";
import { RootStore } from "medior/store";
import { asyncAction, derefMobx, toast } from "medior/utils/client";
import { debounce, Fmt, sleep } from "medior/utils/common";
import {
  DEFAULT_DUPLICATE_SEARCH_OPTIONS,
  DUPLICATE_PAGE_SIZE,
  DuplicateSearchOptions,
  getVariationSettings,
  MIN_DUPLICATE_SIMILARITY,
  validateDuplicateSearchOptions,
} from "medior/utils/common/duplicate-search";
import { trpc } from "medior/utils/server";
import { DuplicateFileSearch } from "./search";

const DEFAULT_TIME_WINDOW = 60;

/**
 * The filter as JSON, alike for edits that choose the same files: sorting is dropped, and cleared
 * text fields and conditions without an operator count as unset.
 */
const getFilterJson = (filterProps: object) =>
  JSON.stringify(derefMobx(filterProps), (key, value) => {
    if (key === "sortValue") return undefined;
    else if (value === "" || value?.logOp === "") return null;
    else return value;
  });

@model("medior/LowerResolutionStore")
export class LowerResolutionStore extends Model({
  /** Why archiving or selecting skipped files or failed, kept apart from the search's own error. */
  actionError: prop<string>("").withSetter(),
  /** JSON of the filter last searched in the menu, which the groups are built with. */
  appliedFilter: prop<string>(null).withSetter(),
  /** The menu's settings when its filter was searched, restoring the menu on reopening. */
  appliedSearchProps: prop<string>(null).withSetter(),
  /** The server job archiving this search's selected duplicates. */
  archiveJobId: prop<string>(null).withSetter(),
  cancelRequested: prop<boolean>(false).withSetter(),
  error: prop<string>("").withSetter(),
  found: prop<number>(0).withSetter(),
  /** Searched files with matches that have been grouped with the current settings. */
  grouped: prop<number>(0).withSetter(),
  groups: prop<DuplicateGroup[]>(() => []).withSetter(),
  hasSearchIndex: prop<boolean>(true).withSetter(),
  /** Changed settings are being saved, after which their groups may be rebuilt. */
  isApplyingOptions: prop<boolean>(false).withSetter(),
  isGrouping: prop<boolean>(false).withSetter(),
  /** Grouping was paused, keeping the groups built so far, until it is resumed. */
  isGroupingPaused: prop<boolean>(false).withSetter(),
  /** The modal is hidden while its archiving runs in the background. */
  isMinimized: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPageLoading: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  isStarting: prop<boolean>(false).withSetter(),
  isStartingArchive: prop<boolean>(false).withSetter(),
  /** Lists the files created within the time window beside each group, apart from its duplicates. */
  isTimeGrouped: prop<boolean>(false).withSetter(),
  lastSelectedId: prop<string>(null).withSetter(),
  /** Searched files with at least one stored match. */
  matched: prop<number>(0).withSetter(),
  /** Merges archived files into each group's kept file the way the media transformer merges duplicates. */
  mergeMetadata: prop<boolean>(false).withSetter(),
  minSimilarity: prop<number>(DEFAULT_DUPLICATE_SEARCH_OPTIONS.minSimilarity).withSetter(),
  /** Why the review settings weren't applied, kept apart from the search's own error. */
  optionsError: prop<string>("").withSetter(),
  page: prop<number>(1).withSetter(),
  processed: prop<number>(0).withSetter(),
  rate: prop<number>(0).withSetter(),
  /** Groups with a duplicate at or above the review threshold. */
  reviewCount: prop<number>(0).withSetter(),
  reviewOptions: prop<DuplicateSearchOptions>(null).withSetter(),
  scanId: prop<string>(null).withSetter(),
  /** Chooses which files a library search's groups are built from. */
  search: prop<DuplicateFileSearch>(() => new DuplicateFileSearch({})),
  /** Selected file IDs mapped to their groups, so selections survive paging. */
  selection: prop<Record<string, string>>(() => ({})).withSetter(),
  skipped: prop<number>(0).withSetter(),
  sourceFileId: prop<string>(null).withSetter(),
  status: prop<"complete" | "error" | "idle" | "paused" | "running">("idle").withSetter(),
  timeWindowMinutes: prop<number>(DEFAULT_TIME_WINDOW).withSetter(),
  total: prop<number>(0).withSetter(),
  unindexedCount: prop<number>(0).withSetter(),
  /** Side of the areas, in compared thumbnail pixels, that variations are measured in. */
  variationBlockSize: prop<number>(
    DEFAULT_DUPLICATE_SEARCH_OPTIONS.variationBlockSize,
  ).withSetter(),
  /** How far an area's brightness must change, out of 255, to mark a variation. */
  variationThreshold: prop<number>(
    DEFAULT_DUPLICATE_SEARCH_OPTIONS.variationThreshold,
  ).withSetter(),
}) {
  private applyReviewOptionsLater: { (): void; cancel: () => void } = null;
  /** The groups sent to the archive job, in the order it archives them. */
  private archiveGroups: { fileIds: string[]; groupId: string }[] = [];
  private hasQueuedReviewOptions = false;
  private pageAbortController: AbortController = null;
  private pollRevision = 0;

  onInit() {
    autoBind(this);

    // Settings only regroup the stored matches, so they apply once they stop changing.
    this.applyReviewOptionsLater = debounce(this.applyReviewOptions, 1000);

    reaction(
      () => this.scanId && JSON.stringify(this.options),
      (key) => {
        if (key) this.queueReviewOptions();
      },
    );

    // The menu shows changes only while it differs from the filter the groups are built with,
    // whatever else marks it.
    reaction(
      () => this.search.hasChanges !== this.hasFilterChanges,
      (isOutOfSync) => {
        if (isOutOfSync) this.search.setHasChanges(this.hasFilterChanges);
      },
      { fireImmediately: true },
    );

    // Archiving started from this search, including before a reload, is followed until it ends.
    reaction(
      () =>
        this.scanId &&
        getRootStore<RootStore>(this)?.home.getJob("mergeDuplicates", this.scanId)?.id,
      (jobId) => {
        if (jobId) this.followArchive(jobId);
      },
      { fireImmediately: true },
    );
  }

  get archiveJob() {
    return getRootStore<RootStore>(this).home.jobs.find((job) => job.id === this.archiveJobId);
  }

  /**
   * Grouping only shows as the activity while it rebuilds groups between searches, or while it is
   * paused with matches left to group.
   */
  get displayStatus() {
    if (!this.isScanning && this.isGrouping) return "grouping";
    else if (!this.isScanning && this.isGroupingPaused && this.grouped < this.matched)
      return "groupingPaused";
    else return this.status;
  }

  /** The filter menu differs from the filter the groups are built with. */
  get hasFilterChanges() {
    return (
      !this.sourceFileId &&
      this.appliedFilter !== null &&
      getFilterJson(this.search.getFilterProps()) !== this.appliedFilter
    );
  }

  get isArchiving() {
    return this.isStartingArchive || !!this.archiveJobId;
  }

  get isScanning() {
    return this.status === "running";
  }

  get options(): DuplicateSearchOptions {
    return {
      filter: this.sourceFileId ? null : this.appliedFilter,
      minSimilarity: this.minSimilarity,
      searchProps: this.sourceFileId ? null : this.appliedSearchProps,
      // An empty window is invalid rather than turning date grouping off.
      timeWindow: this.isTimeGrouped ? (this.timeWindowMinutes ?? 0) : null,
      variationBlockSize: this.variationBlockSize,
      variationThreshold: this.variationThreshold,
    };
  }

  get pageCount() {
    return Math.ceil(this.reviewCount / DUPLICATE_PAGE_SIZE);
  }

  get selectedCount() {
    return Object.keys(this.selection).length;
  }

  private followArchive(jobId: string) {
    const stores = getRootStore<RootStore>(this);

    if (stores.home.isFollowingJob(jobId)) return;

    this.setArchiveJobId(jobId);
    stores.home.followJob(jobId, this.finishArchive);
  }

  private queueReviewOptions() {
    this.hasQueuedReviewOptions = true;
    this.applyReviewOptionsLater();
  }

  /**
   * Builds the groups with the filter menu's current filter, saving the menu's settings to restore
   * it. Searching the menu, resetting it, and choosing a saved search apply it.
   */
  @modelAction
  applyMenuFilter() {
    this.setAppliedFilter(getFilterJson(this.search.getFilterProps()));
    this.setAppliedSearchProps(JSON.stringify(this.search.getSearchProps()));
  }

  @modelAction
  cancelPageLoad() {
    this.pageAbortController?.abort();
    this.pageAbortController = null;
    this.setIsPageLoading(false);
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

  /** Regroups the stored matches with the current settings, then follows the regrouping. */
  @modelFlow
  applyReviewOptions = asyncAction(async () => {
    const saved = await this.saveReviewOptions();

    if (saved.data) await this.watchScan();
  });

  /**
   * Saves the review settings to the search without searching again, reporting whether its groups
   * are being rebuilt. Archiving and starting a search reapply the settings when they end, so
   * groups aren't rebuilt under them.
   */
  @modelFlow
  saveReviewOptions = asyncAction(async () => {
    if (!this.scanId || this.isArchiving || this.isStarting) return false;

    const options = this.options;
    const scanId = this.scanId;
    let isGrouping = false;

    this.hasQueuedReviewOptions = false;
    this.setIsApplyingOptions(true);

    try {
      validateDuplicateSearchOptions(options);

      const result = await trpc.setLowerResolutionReviewOptions.mutate({ options, scanId });
      if (!result.success) throw new Error(result.error);

      // Settings saved as another search loaded belong to the search they were made for.
      if (scanId !== this.scanId) return false;

      const isWindowChanged =
        (this.reviewOptions?.timeWindow ?? null) !== (options.timeWindow ?? null);

      isGrouping = result.data.isGrouping;
      this.setOptionsError("");
      this.setReviewOptions(options);

      if (result.data.isRegrouping) {
        this.cancelPageLoad();
        this.clearSelection();
        this.setGroups([]);
        this.setPage(1);
        this.setReviewCount(0);
      } else if (isWindowChanged && this.isOpen && this.groups.length)
        // A new date window only changes the files listed beside each group.
        await this.loadPage(this.page);

      // A running search defers grouping until it stops.
      if (isGrouping && !this.isScanning) this.setIsGrouping(true);
    } catch (error) {
      this.setOptionsError(error.message);
    } finally {
      this.setIsApplyingOptions(false);
    }

    return isGrouping;
  });

  @modelFlow
  archive = asyncAction(async () => {
    if (
      this.isApplyingOptions ||
      this.isArchiving ||
      this.isGrouping ||
      this.isPageLoading ||
      this.isStarting ||
      !this.selectedCount
    )
      return;

    const fileIdsByGroup = new Map<string, string[]>();

    for (const [fileId, groupId] of Object.entries(this.selection)) {
      if (!fileIdsByGroup.has(groupId)) fileIdsByGroup.set(groupId, []);
      fileIdsByGroup.get(groupId).push(fileId);
    }

    this.archiveGroups = [...fileIdsByGroup].map(([groupId, fileIds]) => ({ fileIds, groupId }));
    this.setIsStartingArchive(true);
    this.setActionError("");

    try {
      const result = await trpc.startLowerResolutionArchive.mutate({
        groups: this.archiveGroups,
        mergeMetadata: this.mergeMetadata,
        scanId: this.scanId,
      });
      if (!result.success) throw new Error(result.error);

      this.followArchive(result.data);
    } catch (error) {
      this.archiveGroups = [];
      this.setActionError(error.message);
      this.queueReviewOptions();
    } finally {
      this.setIsStartingArchive(false);
    }
  });

  /**
   * Takes in the archive job's results once it ends: archived files leave the selection, the page
   * reloads without them, and the review settings saved meanwhile are applied.
   */
  @modelFlow
  private finishArchive = asyncAction(async (job: JobState) => {
    const failedCount = job.failures.reduce((count, failure) => count + failure.count, 0);
    // Other windows following the same search only stop showing it as archiving.
    const isReported = this.archiveGroups.length > 0 || this.isOpen;
    const selection = { ...this.selection };
    let processed = 0;

    // Groups are archived in the order they were sent, so the processed count covers the first.
    for (const group of this.archiveGroups) {
      if (processed + group.fileIds.length > job.processed) break;

      processed += group.fileIds.length;

      for (const fileId of group.fileIds) delete selection[fileId];
    }

    this.archiveGroups = [];
    this.setSelection(selection);

    if (this.archiveJobId === job.id) this.setArchiveJobId(null);

    if (isReported) {
      this.setActionError(
        [
          job.error,
          ...job.failures.map(
            ({ count, message }) =>
              `${Fmt.commas(count)} ${count === 1 ? "file was" : "files were"} skipped: ${message}`,
          ),
        ]
          .filter(Boolean)
          .join(" "),
      );

      toast.info(
        `Archived ${Fmt.commas(job.processed - failedCount)} duplicates${failedCount ? `; ${Fmt.commas(failedCount)} need attention` : ""}`,
      );
    }

    this.queueReviewOptions();

    // A minimized modal closes once its archiving ends, rather than covering the window again.
    if (this.isMinimized) await this.close();
    else if (this.isOpen) await this.loadPage(this.page);
    else await this.returnToLibrary();
  });

  @modelFlow
  close = asyncAction(async () => {
    this.cancelPageLoad();
    this.setIsMinimized(false);
    this.setIsOpen(false);

    await this.returnToLibrary();
  });

  /**
   * Creates a collection from a group's files and those listed as created nearby, in the order
   * they were created, then opens it.
   */
  @modelFlow
  createGroupCollection = asyncAction(async (groupId: string) => {
    const stores = getRootStore<RootStore>(this);

    const group = this.groups.find((current) => current.id === groupId);
    const fileIds = [...group.files, ...group.nearby]
      .map((file) => ({ dateCreated: file.dateCreated ?? "", id: file.id }))
      .sort((a, b) => a.dateCreated.localeCompare(b.dateCreated))
      .map((file) => file.id);

    const res = await stores.collection.createCollection({
      fileIdIndexes: fileIds.map((fileId, index) => ({ fileId, index })),
      title: "Untitled Collection",
    });
    if (!res.success) throw new Error(res.error);

    stores.collection.editor.setIsOpen(true);
    await stores.collection.editor.loadCollection(res.data.id);
  });

  /** Opens the file tag editor on a group's files or the current selection. */
  editTags(fileIds: string[]) {
    const stores = getRootStore<RootStore>(this);

    stores.file.tagsEditor.setBatchId(null);
    stores.file.tagsEditor.setFileIds(fileIds);
    stores.file.tagsEditor.setIsOpen(true);
  }

  /** Selects every file except the best one in each group, across all pages. */
  @modelFlow
  selectAllDuplicates = asyncAction(async () => {
    this.setActionError("");
    this.setIsSelecting(true);

    try {
      const result = await trpc.listLowerResolutionDuplicateIds.mutate({
        minSimilarity: this.minSimilarity,
        scanId: this.scanId,
      });
      if (!result.success) throw new Error(result.error);

      const selection = { ...this.selection };

      for (const group of result.data) {
        for (const fileId of group.fileIds) selection[fileId] = group.groupId;
      }

      this.setSelection(selection);
    } catch (error) {
      this.setActionError(error.message);
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
        {
          minSimilarity: this.minSimilarity,
          page,
          scanId: this.scanId,
          // Pages list nearby files with the saved window, never one still being typed or invalid.
          timeWindow: this.reviewOptions?.timeWindow ?? null,
        },
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

  /** Loads the saved search for a scope with its settings, then follows its progress. */
  @modelFlow
  loadScan = asyncAction(async (sourceFileId: string = null) => {
    // A settings change still waiting is saved to the search it was made for before it reloads.
    if (this.hasQueuedReviewOptions) {
      this.applyReviewOptionsLater.cancel();
      await this.saveReviewOptions();
    }

    const isNewScope = sourceFileId !== this.sourceFileId;

    this.pollRevision++;
    this.cancelPageLoad();
    this.setSourceFileId(sourceFileId);
    this.clearSelection();
    this.setGroups([]);
    this.setScanId(null);
    this.setStatus("idle");
    this.setFound(0);
    this.setGrouped(0);
    this.setIsGrouping(false);
    this.setIsGroupingPaused(false);
    this.setMatched(0);
    this.setReviewCount(0);
    this.setPage(1);
    this.setProcessed(0);
    this.setRate(0);
    this.setSkipped(0);
    this.setTotal(0);
    this.setUnindexedCount(0);
    this.setHasSearchIndex(true);
    this.setReviewOptions(null);
    this.setActionError("");
    this.setError("");
    this.setOptionsError("");
    this.setIsStarting(true);

    try {
      const result = await trpc.getLowerResolutionScan.mutate({
        sourceFileId: sourceFileId || undefined,
      });

      if (!result.success) throw new Error(result.error);

      if (result.data) {
        const { filter, minSimilarity, searchProps, timeWindow } = result.data.options;
        const { blockSize, threshold } = getVariationSettings(result.data.options);

        // Searches saved before the lowest stored similarity was raised review from it instead.
        this.setMinSimilarity(Math.max(minSimilarity, MIN_DUPLICATE_SIMILARITY));
        this.setIsTimeGrouped(!!timeWindow);
        this.setTimeWindowMinutes(timeWindow || DEFAULT_TIME_WINDOW);
        this.setVariationBlockSize(blockSize);
        this.setVariationThreshold(threshold);

        if (!sourceFileId) {
          // A search saved without the menu's settings was made with the menu untouched.
          if (searchProps) this.search.applySearchProps(JSON.parse(searchProps));
          else this.search._reset();

          if (filter) {
            this.setAppliedFilter(getFilterJson(JSON.parse(filter)));
            this.setAppliedSearchProps(searchProps);
          } else this.applyMenuFilter();
        }

        this.setScanId(result.data._id);
      } else {
        // A scope without a saved search starts from the default settings.
        if (isNewScope) {
          this.setMinSimilarity(DEFAULT_DUPLICATE_SEARCH_OPTIONS.minSimilarity);
          this.setIsTimeGrouped(false);
          this.setTimeWindowMinutes(DEFAULT_TIME_WINDOW);
          this.setVariationBlockSize(DEFAULT_DUPLICATE_SEARCH_OPTIONS.variationBlockSize);
          this.setVariationThreshold(DEFAULT_DUPLICATE_SEARCH_OPTIONS.variationThreshold);
        }

        if (!sourceFileId && this.appliedFilter === null) this.applyMenuFilter();
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
    else await this.returnToLibrary();
  });

  /** Shows the library search's activity before the modal is first opened. */
  @modelFlow
  loadStatus = asyncAction(async () => {
    if (!this.isOpen && !this.scanId) await this.loadScan();
  });

  @modelFlow
  open = asyncAction(async (sourceFileId: string = null) => {
    this.setIsMinimized(false);
    this.setIsOpen(true);

    if (this.isScanning || this.isStarting || this.isArchiving) {
      if (sourceFileId !== this.sourceFileId)
        toast.info("Showing the current duplicate search. Pause it before switching scope.");

      if (this.scanId && !this.isPageLoading) await this.loadPage(this.page);
    } else await this.loadScan(sourceFileId);
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

  /** Pauses grouping after its current step; the groups built so far stay reviewable. */
  @modelFlow
  pauseGrouping = asyncAction(async () => {
    const result = await trpc.pauseLowerResolutionGrouping.mutate({ scanId: this.scanId });
    if (!result.success) throw new Error(result.error);

    this.setIsGroupingPaused(true);
    this.setIsGrouping(false);
  });

  /** Resumes grouping from where it paused, then follows it; a running search groups afterwards. */
  @modelFlow
  resumeGrouping = asyncAction(async () => {
    const result = await trpc.resumeLowerResolutionGrouping.mutate({ scanId: this.scanId });
    if (!result.success) throw new Error(result.error);

    this.setIsGroupingPaused(false);

    if (!this.isScanning) {
      this.setIsGrouping(true);
      await this.watchScan();
    }
  });

  /**
   * The badge follows the library search, so a closed single file's search hands the store back to
   * it once nothing still uses that search's state; the server finishes the search on its own.
   */
  @modelFlow
  returnToLibrary = asyncAction(async () => {
    if (!this.isOpen && this.sourceFileId && !this.isArchiving && !this.isStarting)
      await this.loadScan();
  });

  @modelFlow
  scan = asyncAction(async () => {
    if (
      this.isApplyingOptions ||
      this.isArchiving ||
      this.isPageLoading ||
      this.isScanning ||
      this.isStarting
    )
      return;

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

      // A library search always saves the filter its groups are built with; with none applied
      // yet, it starts from the default menu rather than edits that were never searched.
      if (!this.sourceFileId && this.appliedFilter === null) {
        this.search._reset();
        this.applyMenuFilter();
      }

      // An invalid date window never blocks the search; it is saved without one until corrected.
      let options = this.options;

      try {
        validateDuplicateSearchOptions(options);
      } catch (error) {
        this.setOptionsError(error.message);
        options = { ...options, timeWindow: null };
      }

      // Paused or stopped searches resume; completed ones search again from the start.
      const result = await trpc.startLowerResolutionScan.mutate({
        options,
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
      this.queueReviewOptions();
    }

    if (this.isScanning) await this.watchScan();
    else await this.returnToLibrary();
  });

  @modelFlow
  private watchScan = asyncAction(async () => {
    const revision = ++this.pollRevision;
    const scanId = this.scanId;
    let displayedCount = -1;
    let isWatching = true;
    // Measures throughput from this watch's first sample so earlier runs and startup don't skew it.
    let baseline: { processed: number; time: number } = null;

    while (isWatching && revision === this.pollRevision) {
      try {
        const result = await trpc.getLowerResolutionScan.mutate({ scanId });

        if (revision !== this.pollRevision) return;

        if (!result.success) throw new Error(result.error);

        if (!result.data) {
          this.setError("Duplicate search not found.");
          this.setStatus("error");
          this.setCancelRequested(false);
          isWatching = false;
        } else {
          const progress = result.data;
          const now = Date.now();

          baseline ??= { processed: progress.processed, time: now };

          if (now > baseline.time)
            this.setRate(
              ((progress.processed - baseline.processed) * 1000) / (now - baseline.time),
            );

          const isActive = progress.status === "running" || progress.isGrouping;

          this.setError(progress.error);
          this.setFound(progress.found);
          this.setGrouped(progress.grouped);
          this.setIsGrouping(progress.isGrouping);
          this.setIsGroupingPaused(progress.isGroupingPaused);
          this.setMatched(progress.matched);
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
            (!isActive ||
              (displayedCount !== progress.found && this.groups.length < DUPLICATE_PAGE_SIZE))
          ) {
            const loaded = await this.loadPage(this.page);

            if (loaded.success && loaded.data) displayedCount = progress.found;
          }

          if (!isActive) {
            this.setCancelRequested(false);
            isWatching = false;
          }
        }
      } catch (error) {
        // A failed check keeps watching, since the search carries on without it.
        if (revision === this.pollRevision) this.setError(error.message);
      }

      if (isWatching) await sleep(1000);
    }

    // A single file's search ending after its modal closed gives the badge back to the library.
    if (revision === this.pollRevision) await this.returnToLibrary();
  });
}
