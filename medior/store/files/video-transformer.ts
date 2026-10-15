import autoBind from "auto-bind";
import { FileSchema, FileTransformSchema } from "medior/_generated/server";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { SortValue } from "medior/store/_generated";
import type { SpliceMode } from "medior/server/database";
import { asyncAction, derefMobx, openCarouselWindow, toast } from "medior/utils/client";
import { dayjs } from "medior/utils/common";
import { ReencodeCandidateType, trpc } from "medior/utils/server";
import { File, FileTransform, FileTransformSearch } from ".";

export type FileTransformType = "reencode" | "remux" | "splice";

export interface FileTransformSizeBucket {
  compressedSize: number;
  date: string;
  originalSize: number;
}

export type SizeHistoryRange = "24h" | "30d" | "7d" | "all";

const SIZE_HISTORY_RANGE_DAYS: Record<SizeHistoryRange, number> = {
  "24h": 1,
  "30d": 30,
  "7d": 7,
  all: null,
};

@model("medior/VideoTransformerStore")
export class VideoTransformerStore extends Model({
  activeFile: prop<File>(null).withSetter(),
  activeTransform: prop<FileTransform>(null).withSetter(),
  activeType: prop<FileTransformType>(null).withSetter(),
  fileIds: prop<string[]>(() => []).withSetter(),
  fnType: prop<FileTransformType>(null).withSetter(),
  focusedTransformId: prop<string>(null).withSetter(),
  isAuto: prop<boolean>(false).withSetter(),
  isConfigOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isMinimized: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isQueueRefreshing: prop<boolean>(false).withSetter(),
  isSizeHistoryLoading: prop<boolean>(false).withSetter(),
  isTransforming: prop<boolean>(false).withSetter(),
  isUpdating: prop<boolean>(false).withSetter(),
  pausedTypes: prop<FileTransformType[]>(() => []).withSetter(),
  pendingCount: prop<number>(0).withSetter(),
  queueType: prop<FileTransformType>("reencode").withSetter(),
  search: prop<FileTransformSearch>(() => new FileTransformSearch({})),
  sizeHistory: prop<FileTransformSizeBucket[]>(() => []).withSetter(),
  sizeHistoryRange: prop<SizeHistoryRange>("7d").withSetter(),
  sourceSortValue: prop<SortValue>(null).withSetter(),
  spliceMode: prop<SpliceMode>("replace").withSetter(),
  timestampPairs: prop<Array<[number, number]>>(() => []).withSetter(),
}) {
  private activeTransformLoadId = 0;
  private activeTransformUpdates = new Map<string, Partial<FileTransformSchema>>();
  private isActiveTransformLoading = false;
  private queueCountLoadId = 0;
  private sizeHistoryLoadId = 0;
  private sizeHistoryTimer: ReturnType<typeof setTimeout> = null;
  private transformerStatusLoadId = 0;

  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => {
        if (!this.isOpen) this.reset();
        else {
          this.getTransformerStatus();

          // Requested before the slower totals so they claim the first of the limited connections.
          if (!this.fileIds.length || !this.fnType) {
            this.loadActiveTransform();
            this.loadQueue({ page: 1 });
          }

          this.loadQueueCount();
          this.loadSizeHistory();
        }
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.activeTransformLoadId++;
    this.activeTransformUpdates.clear();
    this.isActiveTransformLoading = false;
    this.setIsLoading(false);
  }

  /** Reloads the newest size buckets at most every 2 seconds while transforms complete. */
  queueSizeHistoryRefresh() {
    if (this.sizeHistoryTimer) return;

    this.sizeHistoryTimer = setTimeout(() => {
      this.sizeHistoryTimer = null;
      this.loadSizeHistory(true);
    }, 2000);
  }

  @modelAction
  receiveActiveTransform({
    file,
    transform,
  }: {
    file: FileSchema;
    transform: FileTransformSchema;
  }) {
    if (transform.type !== this.queueType) return;

    this.cancelLoad();
    this.setFocusedTransformId(transform.id);
    this.setActiveFile(new File(file));
    this.setActiveTransform(new FileTransform(transform));
  }

  @modelAction
  receiveTransformUpdate(id: string, updates: Partial<FileTransformSchema>) {
    if (this.isActiveTransformLoading)
      this.activeTransformUpdates.set(id, { ...this.activeTransformUpdates.get(id), ...updates });

    if (this.activeTransform?.id === id) {
      this.activeTransform.update(updates);

      if (
        ["MERGED", "REPLACED"].includes(updates.status) ||
        (updates.status === "SAVED" && this.activeTransform.type !== "splice")
      )
        this.setFocusedTransformId(null);
    }

    const transform = this.search.getResult(id);

    if (!transform) return;

    transform.update(updates);

    if (
      transform.isCompleted !== this.search.isCompleted ||
      (this.search.status && transform.status !== this.search.status)
    )
      this.removeQueueFiles([], [id]);
  }

  @modelAction
  removeQueueFiles(fileIds: string[], transformIds: string[] = []) {
    const fileIdSet = new Set(fileIds);
    const ids = new Set(transformIds);

    for (const transform of this.search.results) {
      if (fileIdSet.has(transform.fileId)) ids.add(transform.id);
    }

    this.search.setResults(this.search.results.filter((transform) => !ids.has(transform.id)));
    this.search.setSelectedIds(this.search.selectedIds.filter((id) => !ids.has(id)));
    this.search.setIds(this.search.ids.filter((id) => !ids.has(id)));

    const retainedFileIds = new Set(this.search.results.map((transform) => transform.fileId));

    this.search.setFiles(
      new Map([...this.search.files].filter(([fileId]) => retainedFileIds.has(fileId))),
    );
  }

  @modelAction
  reset() {
    this.cancelLoad();
    this.queueCountLoadId++;
    this.sizeHistoryLoadId++;
    this.transformerStatusLoadId++;
    clearTimeout(this.sizeHistoryTimer);
    this.sizeHistoryTimer = null;
    this.setActiveTransform(null);
    this.setActiveFile(null);
    this.setFileIds([]);
    this.setFocusedTransformId(null);
    this.setFnType(null);
    this.setIsMinimized(false);
    this.setIsQueueRefreshing(false);
    this.setIsSizeHistoryLoading(false);
    this.setPendingCount(0);
    this.setSizeHistory([]);
    this.setSourceSortValue(null);
    this.setSpliceMode("replace");
    this.setTimestampPairs([]);
    this.search.reset();
  }

  @modelAction
  resetEmptyConstrainedQueue() {
    if (!this.search.forcePages || this.search.ids.length) return false;

    this.search.setPage(1);
    this.search.setPageCount(1);
    this.search.setSelectedIds([]);

    return true;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  changeQueueType = asyncAction(async (type: FileTransformType) => {
    this.setQueueType(type);
    this.setFocusedTransformId(null);
    this.search.setForcePages(false);
    this.search.setIds([]);
    this.search.setSelectedIds([]);

    const results = await Promise.all([
      this.loadActiveTransform(),
      this.loadQueue({ noCache: true, page: 1 }),
      this.loadQueueCount(),
      this.loadSizeHistory(),
    ]);

    for (const result of results) {
      if (!result.success) throw new Error(result.error);
    }
  });

  @modelFlow
  createTransforms = asyncAction(async () => {
    if (!this.fileIds.length || !this.fnType || this.isUpdating) return;

    const isSplice = this.fnType === "splice";
    let transformIds: string[];

    this.setIsUpdating(true);

    try {
      const res = await trpc.createFileTransforms.mutate({
        fileIds: this.fileIds,
        sortValue: this.sourceSortValue,
        spliceMode: isSplice ? this.spliceMode : undefined,
        timestampPairs: this.timestampPairs.map(([start, end]) => ({ end, start })),
        type: this.fnType,
      });

      if (!res.success) throw new Error(res.error);

      transformIds = res.data.ids;

      if (res.data.skippedCount)
        toast.warn(
          `Skipped ${res.data.skippedCount} files without exactly one valid timeline to splice`,
        );

      this.setFocusedTransformId(transformIds[0]);
      this.setFileIds([]);
      this.search.setIds(transformIds);
      this.search.setForcePages(true);

      await this.loadQueue({ noCache: true, page: 1 });
      await this.loadQueueCount();
      await this.loadActiveTransform({ id: transformIds[0] });
    } finally {
      this.setIsUpdating(false);
    }

    if (isSplice) {
      const res = await this.runTransform({ id: transformIds[0], withAuto: false });
      if (!res.success) throw new Error(res.error);
    }
  });

  @modelFlow
  deleteTransforms = asyncAction(async (ids: string[]) => {
    if (!ids.length) return 0;

    const deletedActiveTransform = Boolean(
      this.activeTransform && ids.includes(this.activeTransform.id),
    );

    const res = await trpc.deleteFileTransforms.mutate({ ids });

    if (!res.success) throw new Error(res.error);

    this.removeQueueFiles([], ids);

    if (deletedActiveTransform) this.setFocusedTransformId(null);

    // The deletion socket event reloads the active transform and queue count.
    this.loadPreviousQueuePageIfEmpty();

    return res.data.deletedCount;
  });

  @modelFlow
  getTransformerStatus = asyncAction(async () => {
    const loadId = ++this.transformerStatusLoadId;
    const res = await trpc.getFileTransformerStatus.mutate();

    if (loadId !== this.transformerStatusLoadId) return;

    if (!res.success) throw new Error(res.error);

    this.setActiveType(res.data.activeType);
    this.setIsAuto(res.data.isAuto);
    this.setIsTransforming(res.data.isTransforming);
    this.setPausedTypes(res.data.pausedTypes);

    return res.data;
  });

  /** Background loads refresh the active transform without covering its controls. */
  @modelFlow
  loadActiveTransform = asyncAction(
    async ({ id, isBackground = false }: { id?: string; isBackground?: boolean } = {}) => {
      const loadId = ++this.activeTransformLoadId;

      this.activeTransformUpdates.clear();
      this.isActiveTransformLoading = true;

      if (!isBackground) this.setIsLoading(true);

      try {
        const res = await trpc.getActiveFileTransform.mutate({ id, type: this.queueType });
        if (!res.success) throw new Error(res.error);
        if (loadId !== this.activeTransformLoadId) return;

        if (!res.data) {
          this.setActiveTransform(null);
          this.setActiveFile(null);
        } else {
          const { file, transform } = res.data;

          this.setActiveFile(new File(file));
          this.setActiveTransform(
            new FileTransform({ ...transform, ...this.activeTransformUpdates.get(transform.id) }),
          );
        }
      } finally {
        if (loadId === this.activeTransformLoadId) {
          this.activeTransformUpdates.clear();
          this.isActiveTransformLoading = false;
          this.setIsLoading(false);
        }
      }
    },
  );

  @modelFlow
  loadPreviousQueuePageIfEmpty = asyncAction(async () => {
    if (
      this.resetEmptyConstrainedQueue() ||
      this.search.results.length ||
      this.search.pageCount <= 1
    )
      return;

    await this.loadQueue({ noCache: true, page: Math.max(1, this.search.page - 1) });
  });

  /** Background loads refresh the queue without covering it with the search overlay. */
  @modelFlow
  loadQueue = asyncAction(
    async ({
      isBackground = false,
      ...args
    }: {
      isBackground?: boolean;
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      this.search.setType(this.queueType);
      this.setIsQueueRefreshing(isBackground);

      try {
        const search = await this.search.loadFiltered(args);

        if (!search.success) throw new Error(search.error);
      } finally {
        if (isBackground) this.setIsQueueRefreshing(false);
      }
    },
  );

  @modelFlow
  loadQueueCount = asyncAction(async () => {
    const loadId = ++this.queueCountLoadId;
    const res = await trpc.getFileTransformQueueCount.mutate({ type: this.queueType });

    if (!res.success) throw new Error(res.error);

    if (loadId !== this.queueCountLoadId) return;

    this.setPendingCount(res.data.pendingCount);

    return res.data;
  });

  /** Loads the selected range's size buckets, or only those from the newest loaded bucket onward. */
  @modelFlow
  loadSizeHistory = asyncAction(async (isIncremental = false) => {
    const loadId = ++this.sizeHistoryLoadId;
    const lastDate = isIncremental ? this.sizeHistory.at(-1)?.date : undefined;
    const rangeDays = SIZE_HISTORY_RANGE_DAYS[this.sizeHistoryRange];

    // Clearing stale buckets makes refreshes during a full load reload in full too.
    if (!lastDate) {
      this.setIsSizeHistoryLoading(true);
      this.setSizeHistory([]);
    }

    try {
      const res = await trpc.listFileTransformSizeHistory.mutate({
        since:
          lastDate ?? (rangeDays ? dayjs().subtract(rangeDays, "day").toISOString() : undefined),
        type: this.queueType,
      });

      if (!res.success) throw new Error(res.error);
      if (loadId !== this.sizeHistoryLoadId) return;

      this.setSizeHistory(
        lastDate
          ? [
              ...derefMobx(this.sizeHistory).filter(
                (bucket: FileTransformSizeBucket) => bucket.date < lastDate,
              ),
              ...res.data,
            ]
          : res.data,
      );
    } finally {
      if (loadId === this.sizeHistoryLoadId) this.setIsSizeHistoryLoading(false);
    }
  });

  @modelFlow
  queueReencodeCandidates = asyncAction(async (types: ReencodeCandidateType[]) => {
    const res = await trpc.listReencodeCandidateIds.mutate({ types });
    if (!res.success) throw new Error(res.error);
    if (!res.data.length) throw new Error("No qualifying files to add");

    // Creating transforms is skipped while another transformer update runs.
    if (this.isUpdating) throw new Error("Wait for the current transformer action to finish");

    // The server returns queue order, so no source sort may reorder it.
    this.setQueueType("reencode");
    this.setFileIds(res.data);
    this.setFnType("reencode");
    this.setSourceSortValue(null);

    const created = await this.createTransforms();
    if (!created.success) throw new Error(created.error);

    return res.data.length;
  });

  @modelFlow
  removeFilesFromQueue = asyncAction(async (fileIds: string[]) => {
    const fileIdSet = new Set(fileIds);
    const res = await trpc.deleteFileTransformsByFileIds.mutate({ fileIds });

    if (!res.success) throw new Error(res.error);

    this.removeQueueFiles(fileIds);

    if (this.activeTransform && fileIdSet.has(this.activeTransform.fileId))
      await this.loadActiveTransform();

    await this.loadQueueCount();
    await this.loadPreviousQueuePageIfEmpty();
  });

  @modelFlow
  replaceOutput = asyncAction(async () => {
    if (!this.activeTransform?.id || this.isUpdating) return;

    const id = this.activeTransform.id;

    this.setIsUpdating(true);

    try {
      const res = await trpc.replaceFileTransformOutput.mutate({ id });

      if (!res.success) throw new Error(res.error);

      if (res.data.status === "DUPLICATE") {
        const mergeRes = await trpc.mergeFileTransformDuplicate.mutate({ id });

        if (!mergeRes.success) throw new Error(mergeRes.error);

        toast.success("Duplicate merged; original archived");
      } else toast.success("Media replaced");

      this.setFocusedTransformId(null);
      this.receiveTransformUpdate(id, {
        status: res.data.status === "DUPLICATE" ? "MERGED" : "REPLACED",
      });
    } finally {
      this.setIsUpdating(false);
    }

    const results = await Promise.all([
      this.loadQueueCount(),
      this.isAuto ? this.runTransformer() : this.loadActiveTransform(),
    ]);

    for (const result of results) {
      if (result && !result.success) throw new Error(result.error);
    }
  });

  @modelAction
  runActiveTransform() {
    if (!this.activeTransform?.id) return this.runTransformer();
    else if (this.isAuto && ["COMPLETE", "COMPRESSED"].includes(this.activeTransform.status))
      return this.finalizeActiveTransform();
    else return this.runTransform({ id: this.activeTransform.id, withAuto: true });
  }

  /** Applies the active output by its job: splice copies are saved, everything else replaces. */
  finalizeActiveTransform() {
    return this.activeTransform.isSpliceCopy ? this.saveCopy() : this.replaceOutput();
  }

  /** Splices pass `withAuto` false: auto-replace never applies to them, so the global flag is left alone. */
  @modelFlow
  runTransform = asyncAction(async ({ id, withAuto }: { id: string; withAuto: boolean }) => {
    if (this.isUpdating) return;

    const loadId = this.activeTransformLoadId;

    this.setFocusedTransformId(id);
    this.setIsUpdating(true);

    try {
      const res = await trpc.runFileTransform.mutate({
        id,
        isAuto: withAuto ? this.isAuto : undefined,
      });

      if (!res.success) throw new Error(res.error);

      await this.getTransformerStatus();

      if (!res.data.started) throw new Error("File transform did not start");

      if (
        loadId === this.activeTransformLoadId ||
        (!this.isTransforming && !this.focusedTransformId)
      )
        await this.loadActiveTransform({ id: this.focusedTransformId ?? undefined });

      return res.data;
    } finally {
      this.setIsUpdating(false);
    }
  });

  @modelFlow
  runTransformer = asyncAction(async () => {
    if (this.isUpdating) return;

    const loadId = this.activeTransformLoadId;

    this.setIsUpdating(true);

    try {
      const res = await trpc.runFileTransformer.mutate({
        isAuto: this.isAuto,
        type: this.queueType,
      });

      if (!res.success) throw new Error(res.error);

      await this.getTransformerStatus();

      if (
        loadId === this.activeTransformLoadId ||
        (!this.isTransforming && !this.focusedTransformId)
      )
        await this.loadActiveTransform({ id: this.focusedTransformId ?? undefined });

      return res.data;
    } finally {
      this.setIsUpdating(false);
    }
  });

  @modelFlow
  saveCopy = asyncAction(async () => {
    if (!this.activeTransform?.id || this.isUpdating) return;

    const id = this.activeTransform.id;

    this.setIsUpdating(true);

    try {
      const res = await trpc.saveFileTransformCopy.mutate({ id });

      if (!res.success) throw new Error(res.error);

      toast.success("Media rendered");

      await openCarouselWindow({ file: res.data, selectedFileIds: [res.data.id] });
      await this.loadQueueCount();
      await this.loadActiveTransform({ id });
    } finally {
      this.setIsUpdating(false);
    }
  });

  @modelFlow
  setAutoReplace = asyncAction(async (isAuto: boolean) => {
    this.transformerStatusLoadId++;
    this.setIsAuto(isAuto);

    const res = await trpc.setFileTransformerAuto.mutate({ isAuto });

    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  togglePaused = asyncAction(async () => {
    if (this.isUpdating) return;

    if (this.isPaused) {
      const res = await this.runActiveTransform();

      if (!res.success) throw new Error(res.error);
    } else {
      this.setIsUpdating(true);

      try {
        const res = await trpc.pauseFileTransformer.mutate();

        if (!res.success) throw new Error(res.error);

        await this.getTransformerStatus();
      } finally {
        this.setIsUpdating(false);
      }
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  /** Any queue left with pending work while the transformer is paused. */
  @computed
  get hasPausedQueue() {
    return this.pausedTypes.length > 0;
  }

  /** The selected queue is left with pending work while the transformer is paused. */
  @computed
  get isPaused() {
    return this.pausedTypes.includes(this.queueType);
  }

  @computed
  get isQueueTransforming() {
    return this.isTransforming && this.activeType === this.queueType;
  }

  /** Running totals of completed transforms' original and resulting sizes, starting from zero. */
  @computed
  get sizeTotals() {
    if (!this.sizeHistory.length) return [];

    let compressedSize = 0;
    let originalSize = 0;

    const start = dayjs(this.sizeHistory[0].date).subtract(10, "minute").toDate();

    return [
      { compressedSize, date: start, originalSize },
      ...this.sizeHistory.map((bucket) => {
        compressedSize += bucket.compressedSize;
        originalSize += bucket.originalSize;

        return { compressedSize, date: new Date(bucket.date), originalSize };
      }),
    ];
  }
}
