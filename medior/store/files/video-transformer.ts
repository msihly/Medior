import autoBind from "auto-bind";
import { FileSchema, FileTransformSchema } from "medior/_generated/server";
import { reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { SortValue } from "medior/store/_generated";
import { asyncAction, openCarouselWindow, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { File, FileTransform, FileTransformSearch } from ".";

export type FileTransformType = "reencode" | "remux" | "splice";

@model("medior/VideoTransformerStore")
export class VideoTransformerStore extends Model({
  activeFile: prop<File>(null).withSetter(),
  activeTransform: prop<FileTransform>(null).withSetter(),
  fileIds: prop<string[]>(() => []).withSetter(),
  fnType: prop<FileTransformType>(null).withSetter(),
  focusedTransformId: prop<string>(null).withSetter(),
  isAuto: prop<boolean>(false).withSetter(),
  isConfigOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isMinimized: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPaused: prop<boolean>(false).withSetter(),
  isTransforming: prop<boolean>(false).withSetter(),
  isUpdating: prop<boolean>(false).withSetter(),
  pendingCount: prop<number>(0).withSetter(),
  queueAfterSize: prop<number>(0).withSetter(),
  queueBeforeSize: prop<number>(0).withSetter(),
  search: prop<FileTransformSearch>(() => new FileTransformSearch({})),
  sourceSortValue: prop<SortValue>(null).withSetter(),
  timestampPairs: prop<Array<[number, number]>>(() => []).withSetter(),
}) {
  private activeTransformLoadId = 0;
  private activeTransformUpdates = new Map<string, Partial<FileTransformSchema>>();
  private queueCountLoadId = 0;
  private transformerStatusLoadId = 0;

  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => {
        if (!this.isOpen) this.reset();
        else {
          this.getTransformerStatus();
          this.loadQueueCount();

          if (!this.fileIds.length || !this.fnType) {
            this.loadActiveTransform();
            this.loadQueue({ page: 1 });
          }
        }
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.activeTransformLoadId++;
    this.activeTransformUpdates.clear();
    this.setIsLoading(false);
  }

  @modelAction
  receiveActiveTransform({
    file,
    transform,
  }: {
    file: FileSchema;
    transform: FileTransformSchema;
  }) {
    this.activeTransformLoadId++;
    this.activeTransformUpdates.clear();

    this.setFocusedTransformId(transform.id);
    this.setActiveFile(new File(file));
    this.setActiveTransform(new FileTransform(transform));
    this.setIsLoading(false);
  }

  @modelAction
  receiveTransformUpdate(id: string, updates: Partial<FileTransformSchema>) {
    if (this.isLoading)
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
    this.activeTransformLoadId++;
    this.activeTransformUpdates.clear();
    this.queueCountLoadId++;
    this.transformerStatusLoadId++;
    this.setActiveTransform(null);
    this.setActiveFile(null);
    this.setFileIds([]);
    this.setFocusedTransformId(null);
    this.setFnType(null);
    this.setIsLoading(false);
    this.setIsMinimized(false);
    this.setPendingCount(0);
    this.setQueueAfterSize(0);
    this.setQueueBeforeSize(0);
    this.setSourceSortValue(null);
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
  createTransforms = asyncAction(async () => {
    if (!this.fileIds.length || !this.fnType || this.isUpdating) return;

    this.setIsUpdating(true);

    try {
      const res = await trpc.createFileTransforms.mutate({
        fileIds: this.fileIds,
        sortValue: this.sourceSortValue,
        timestampPairs: this.timestampPairs.map(([start, end]) => ({ end, start })),
        type: this.fnType,
      });

      if (!res.success) throw new Error(res.error);

      const transformIds = res.data.ids;

      this.setFocusedTransformId(transformIds[0]);
      this.setFileIds([]);
      this.search.setIds(transformIds);
      this.search.setForcePages(true);

      await this.loadQueue({ noCache: true, page: 1 });
      await this.loadQueueCount();
      await this.loadActiveTransform(transformIds[0]);
    } finally {
      this.setIsUpdating(false);
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

    if (deletedActiveTransform) {
      this.setFocusedTransformId(null);
      await this.loadActiveTransform();
    }

    await this.loadQueueCount();
    await this.loadPreviousQueuePageIfEmpty();

    return res.data.deletedCount;
  });

  @modelFlow
  getTransformerStatus = asyncAction(async () => {
    const loadId = ++this.transformerStatusLoadId;
    const res = await trpc.getFileTransformerStatus.mutate();

    if (loadId !== this.transformerStatusLoadId) return;

    if (!res.success) throw new Error(res.error);

    this.setIsAuto(res.data.isAuto);
    this.setIsPaused(res.data.isPaused);
    this.setIsTransforming(res.data.isTransforming);

    return res.data;
  });

  @modelFlow
  loadActiveTransform = asyncAction(async (id?: string) => {
    const loadId = ++this.activeTransformLoadId;

    this.activeTransformUpdates.clear();
    this.setIsLoading(true);

    try {
      let transform: FileTransformSchema;

      if (id) {
        const res = await trpc.listFileTransform.mutate({
          args: { filter: { id }, page: 1, pageSize: 1 },
        });

        if (!res.success) throw new Error(res.error);

        transform = res.data.items[0];
      } else {
        const res = await trpc.getNextFileTransform.mutate();

        if (!res.success) throw new Error(res.error);

        transform = res.data;
      }

      if (loadId !== this.activeTransformLoadId) return;

      const fileId = transform?.fileId;

      if (!fileId) {
        this.setActiveTransform(null);
        this.setActiveFile(null);

        return;
      }

      const filesRes = await trpc.listFile.mutate({ args: { filter: { id: [fileId] } } });

      if (loadId !== this.activeTransformLoadId) return;

      if (!filesRes.success) throw new Error(filesRes.error);

      const file = filesRes.data.items[0];

      if (!file) throw new Error("File not found");

      const tagRes = await trpc.listTag.mutate({ filter: { id: file.tagIds } });

      if (loadId !== this.activeTransformLoadId) return;

      if (!tagRes.success) throw new Error(tagRes.error);

      this.setActiveFile(new File({ ...file, tags: tagRes.data }));
      this.setActiveTransform(
        new FileTransform({ ...transform, ...this.activeTransformUpdates.get(transform.id) }),
      );
    } finally {
      if (loadId === this.activeTransformLoadId) {
        this.activeTransformUpdates.clear();
        this.setIsLoading(false);
      }
    }
  });

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

  @modelFlow
  loadQueue = asyncAction(
    async (
      args: {
        noCache?: boolean;
        page?: number;
        toLastPage?: boolean;
        withFullCount?: boolean;
      } = {},
    ) => {
      const search = await this.search.loadFiltered(args);

      if (!search.success) throw new Error(search.error);
    },
  );

  @modelFlow
  loadQueueCount = asyncAction(async () => {
    const loadId = ++this.queueCountLoadId;
    const res = await trpc.getFileTransformQueueCount.mutate();

    if (!res.success) throw new Error(res.error);

    if (loadId !== this.queueCountLoadId) return;

    this.setQueueAfterSize(res.data.afterSize);
    this.setQueueBeforeSize(res.data.beforeSize);
    this.setPendingCount(res.data.pendingCount);

    return res.data;
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
    else if (
      this.isAuto &&
      this.activeTransform.type !== "splice" &&
      ["COMPLETE", "COMPRESSED"].includes(this.activeTransform.status)
    )
      return this.replaceOutput();
    else return this.runTransform(this.activeTransform.id);
  }

  @modelFlow
  runTransform = asyncAction(async (id: string) => {
    if (this.isUpdating) return;

    const loadId = this.activeTransformLoadId;

    this.setFocusedTransformId(id);
    this.setIsUpdating(true);

    try {
      const res = await trpc.runFileTransform.mutate({ id, isAuto: this.isAuto });

      if (!res.success) throw new Error(res.error);

      await this.getTransformerStatus();

      if (!res.data.started) throw new Error("File transform did not start");

      if (
        loadId === this.activeTransformLoadId ||
        (!this.isTransforming && !this.focusedTransformId)
      )
        await this.loadActiveTransform(this.focusedTransformId ?? undefined);

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
      const res = await trpc.runFileTransformer.mutate({ isAuto: this.isAuto });

      if (!res.success) throw new Error(res.error);

      await this.getTransformerStatus();

      if (
        loadId === this.activeTransformLoadId ||
        (!this.isTransforming && !this.focusedTransformId)
      )
        await this.loadActiveTransform(this.focusedTransformId ?? undefined);

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
      await this.loadActiveTransform(id);
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
}
