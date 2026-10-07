import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { LowerResolutionPair } from "medior/server/lower-resolution";
import { RootStore } from "medior/store";
import { asyncAction, toast } from "medior/utils/client";
import { sleep } from "medior/utils/common";
import {
  DEFAULT_IMAGE_COPY_OPTIONS,
  ImageCopyOptions,
  validateImageCopyOptions,
} from "medior/utils/common/image-copy-matching";
import { trpc } from "medior/utils/server";

@model("medior/LowerResolutionStore")
export class LowerResolutionStore extends Model({
  cancelRequested: prop<boolean>(false).withSetter(),
  compared: prop<number>(0).withSetter(),
  elapsedMs: prop<number>(0).withSetter(),
  error: prop<string>("").withSetter(),
  errors: prop<number>(0).withSetter(),
  found: prop<number>(0).withSetter(),
  isArchiving: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPageLoading: prop<boolean>(false).withSetter(),
  isPreparingIndex: prop<boolean>(false).withSetter(),
  isStarting: prop<boolean>(false).withSetter(),
  minSimilarity: prop<number>(DEFAULT_IMAGE_COPY_OPTIONS.minSimilarity).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(0).withSetter(),
  pairs: prop<LowerResolutionPair[]>(() => []).withSetter(),
  pixelTolerance: prop<number>(DEFAULT_IMAGE_COPY_OPTIONS.pixelTolerance).withSetter(),
  processed: prop<number>(0).withSetter(),
  reviewOptions: prop<ImageCopyOptions>(null).withSetter(),
  scanId: prop<string>(null).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  skipped: prop<number>(0).withSetter(),
  sourceFileId: prop<string>(null).withSetter(),
  status: prop<"complete" | "error" | "idle" | "paused" | "running">("idle").withSetter(),
  total: prop<number>(0).withSetter(),
}) {
  private pageAbortController: AbortController = null;
  private pollRevision = 0;

  onInit() {
    autoBind(this);
  }

  get hasChangedOptions() {
    return (
      !this.reviewOptions ||
      this.minSimilarity !== this.reviewOptions.minSimilarity ||
      this.pixelTolerance !== this.reviewOptions.pixelTolerance
    );
  }

  get isScanning() {
    return this.status === "running";
  }

  get options(): ImageCopyOptions {
    return { minSimilarity: this.minSimilarity, pixelTolerance: this.pixelTolerance };
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

  @modelAction
  selectSmallerCopies() {
    this.setSelectedIds([
      ...new Set([
        ...this.selectedIds,
        ...this.pairs
          .filter((pair) => pair.canArchive && pair.isLowerResolution)
          .map((pair) => pair.copy.id),
      ]),
    ]);
  }

  @modelAction
  toggleSelected(fileId: string) {
    if (this.pairs.some((pair) => pair.copy.id === fileId && pair.canArchive)) {
      this.setSelectedIds(
        this.selectedIds.includes(fileId)
          ? this.selectedIds.filter((id) => id !== fileId)
          : [...this.selectedIds, fileId],
      );
    }
  }

  @modelFlow
  archive = asyncAction(async () => {
    if (
      this.isScanning ||
      this.isStarting ||
      this.isArchiving ||
      this.isPageLoading ||
      this.hasChangedOptions ||
      !this.selectedIds.length
    )
      return;

    const stores = getRootStore<RootStore>(this);

    const fileIds = [...this.selectedIds];
    let archived = 0;
    let skipped = 0;

    this.setIsArchiving(true);
    this.setCancelRequested(false);
    this.setError("");

    try {
      for (const fileId of fileIds) {
        if (this.cancelRequested) break;

        const result = await trpc.archiveLowerResolutionCopy.mutate({
          fileId,
          scanId: this.scanId,
        });

        if (result.success) {
          archived++;
          this.setPairs(this.pairs.filter((pair) => pair.copy.id !== fileId));
          this.setSelectedIds(this.selectedIds.filter((id) => id !== fileId));
          stores.file.updateArchivedFileIds([fileId], true);
        } else {
          skipped++;
          this.setError(result.error);
        }
      }

      const loaded = await this.loadPage(this.page);

      if (!loaded.success) throw new Error(loaded.error);

      toast.info(`Archived ${archived} copies${skipped ? `; ${skipped} skipped` : ""}`);
    } catch (error) {
      this.setError(`Archived ${archived} copies before stopping: ${error.message}`);
    } finally {
      this.setIsArchiving(false);
      this.setCancelRequested(false);
    }
  });

  @modelFlow
  loadPage = asyncAction(async (page: number) => {
    this.cancelPageLoad();

    const controller = new AbortController();

    this.pageAbortController = controller;
    this.setIsPageLoading(true);

    try {
      const result = await trpc.listLowerResolutionCopies.mutate(
        { page, scanId: this.scanId },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return false;

      if (!result.success) throw new Error(result.error);

      this.setPairs(result.data.items);
      this.setPage(result.data.page);
      this.setPageCount(result.data.pageCount);
      this.setFound(result.data.total);

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
        toast.info("Showing the current copy search. Pause it before switching scope.");

      if (this.scanId && !this.isPageLoading) await this.loadPage(this.page);
    } else {
      this.pollRevision++;
      this.cancelPageLoad();
      this.setSourceFileId(sourceFileId);
      this.setSelectedIds([]);
      this.setPairs([]);
      this.setScanId(null);
      this.setStatus("idle");
      this.setFound(0);
      this.setPage(1);
      this.setPageCount(0);
      this.setProcessed(0);
      this.setCompared(0);
      this.setElapsedMs(0);
      this.setErrors(0);
      this.setSkipped(0);
      this.setTotal(0);
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
          this.setPixelTolerance(result.data.options.pixelTolerance);
          this.setScanId(result.data._id);
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
  scan = asyncAction(async (restart: boolean = false) => {
    if (this.isScanning || this.isStarting || this.isArchiving || this.isPageLoading) return;

    validateImageCopyOptions(this.options);
    this.setIsStarting(true);
    this.setCancelRequested(false);
    this.setError("");
    this.setSelectedIds([]);

    try {
      const result = await trpc.startLowerResolutionScan.mutate({
        options: this.options,
        restart: restart || this.hasChangedOptions || this.status === "complete",
        sourceFileId: this.sourceFileId || undefined,
      });

      if (!result.success) throw new Error(result.error);

      this.setScanId(result.data.scanId);
      this.setStatus("running");
      this.setIsPreparingIndex(true);
      this.setPairs([]);
      this.setPage(1);
      this.setReviewOptions(this.options);
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

    try {
      while (revision === this.pollRevision) {
        const result = await trpc.getLowerResolutionScan.mutate({ scanId });

        if (revision !== this.pollRevision) return;

        if (!result.success || !result.data)
          throw new Error(result.error || "Copy search not found.");

        const progress = result.data;

        this.setCompared(progress.compared);
        this.setElapsedMs(progress.elapsedMs);
        this.setError(progress.error);
        this.setErrors(progress.failureCount);
        this.setFound(progress.found);
        this.setIsPreparingIndex(progress.isPreparingIndex);
        this.setProcessed(progress.processed);
        this.setReviewOptions(progress.options);
        this.setSkipped(progress.skipped);
        this.setStatus(progress.status);
        this.setTotal(progress.total);

        if (
          this.isOpen &&
          !this.isPageLoading &&
          (displayedCount !== progress.found || progress.status !== "running")
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
