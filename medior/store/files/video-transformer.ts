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
  focusedTransformId: prop<string>(null).withSetter(),
  fnType: prop<FileTransformType>(null).withSetter(),
  isAuto: prop<boolean>(false).withSetter(),
  isConfigOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isMinimized: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPaused: prop<boolean>(false).withSetter(),
  isTransforming: prop<boolean>(false).withSetter(),
  pendingCount: prop<number>(0).withSetter(),
  queueAfterSize: prop<number>(0).withSetter(),
  queueBeforeSize: prop<number>(0).withSetter(),
  search: prop<FileTransformSearch>(() => new FileTransformSearch({})),
  sourceSortValue: prop<SortValue>(null).withSetter(),
  timestampPairs: prop<Array<[number, number]>>(() => []).withSetter(),
}) {
  private activeTransformLoadId = 0;

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
  reset() {
    this.activeTransformLoadId++;
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
  resetEmptyConstrainedQueue() {
    if (!this.search.forcePages || this.search.ids.length) return false;
    this.search.setPage(1);
    this.search.setPageCount(1);
    this.search.setSelectedIds([]);
    return true;
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
    this.setActiveFile(new File(file));
    this.setActiveTransform(new FileTransform(transform));
    this.setIsLoading(false);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTransforms = asyncAction(async () => {
    if (!this.fileIds.length || !this.fnType) return;

    this.setIsLoading(true);
    const res = await trpc.createFileTransforms
      .mutate({
        fileIds: this.fileIds,
        sortValue: this.sourceSortValue,
        timestampPairs: this.timestampPairs.map(([start, end]) => ({ end, start })),
        type: this.fnType,
      })
      .finally(() => this.setIsLoading(false));
    if (!res.success) throw new Error(res.error);

    const transformIds = res.data.ids;
    this.setFocusedTransformId(transformIds[0]);
    this.setFileIds([]);
    this.search.setIds(transformIds);
    this.search.setForcePages(true);
    await this.loadQueue({ noCache: true, page: 1 });
    await this.loadQueueCount();
    await this.loadActiveTransform(transformIds[0]);
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
    if (!this.resetEmptyConstrainedQueue())
      await this.loadQueue({
        noCache: true,
        page: this.search.results.length ? this.search.page : Math.max(1, this.search.page - 1),
      });
    return res.data.deletedCount;
  });

  @modelFlow
  getTransformerStatus = asyncAction(async () => {
    const res = await trpc.getFileTransformerStatus.mutate();
    if (!res.success) throw new Error(res.error);
    this.setIsAuto(res.data.isAuto);
    this.setIsPaused(res.data.isPaused);
    this.setIsTransforming(res.data.isTransforming);
    return res.data;
  });

  @modelFlow
  loadActiveTransform = asyncAction(async (id?: string) => {
    const loadId = ++this.activeTransformLoadId;
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
      this.setActiveTransform(transform ? new FileTransform(transform) : null);

      const fileId = transform?.fileId;
      if (!fileId) {
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
    } finally {
      if (loadId === this.activeTransformLoadId) this.setIsLoading(false);
    }
  });

  @modelFlow
  loadQueue = asyncAction(
    async (args: { noCache?: boolean; page?: number; withFullCount?: boolean } = {}) => {
      await this.search.loadFiltered(args);
      await this.search.loadFiles();
    },
  );

  @modelFlow
  loadQueueCount = asyncAction(async () => {
    const res = await trpc.getFileTransformQueueCount.mutate();
    if (!res.success) throw new Error(res.error);
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
    if (this.resetEmptyConstrainedQueue()) return;
    await this.loadQueue({
      noCache: true,
      page: this.search.results.length ? this.search.page : Math.max(1, this.search.page - 1),
    });
  });

  @modelFlow
  replaceOutput = asyncAction(async () => {
    if (!this.activeTransform?.id) return;
    const id = this.activeTransform.id;
    this.setFocusedTransformId(null);
    this.setIsLoading(true);
    const res = await trpc.replaceFileTransformOutput
      .mutate({ id })
      .finally(() => this.setIsLoading(false));
    if (!res.success) throw new Error(res.error);
    if (res.data.status === "DUPLICATE") {
      const mergeRes = await trpc.mergeFileTransformDuplicate.mutate({ id });
      if (!mergeRes.success) throw new Error(mergeRes.error);
      toast.success("Duplicate merged; original archived");
    } else toast.success("Media replaced");
    await this.search.loadFiltered();
    await this.loadQueueCount();
    await this.loadActiveTransform();
    if (this.isAuto) await this.runTransformer();
  });

  @modelFlow
  runTransformer = asyncAction(async () => {
    const res = await trpc.runFileTransformer.mutate({ isAuto: this.isAuto });
    if (!res.success) throw new Error(res.error);
    await this.getTransformerStatus();
    await this.loadActiveTransform();
    return res.data;
  });

  @modelFlow
  runTransform = asyncAction(async (id: string) => {
    this.setFocusedTransformId(id);
    this.setIsPaused(false);
    const res = await trpc.runFileTransform.mutate({ id, isAuto: this.isAuto });
    if (!res.success) throw new Error(res.error);
    await this.getTransformerStatus();
    await this.loadActiveTransform(id);
    if (!res.data.started) throw new Error("File transform did not start");
    return res.data;
  });

  @modelFlow
  runActiveTransform = asyncAction(async () => {
    if (!this.activeTransform?.id) return this.runTransformer();
    await this.runTransform(this.activeTransform.id);
  });

  @modelFlow
  setAutoReplace = asyncAction(async (isAuto: boolean) => {
    this.setIsAuto(isAuto);
    const res = await trpc.setFileTransformerAuto.mutate({ isAuto });
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  saveCopy = asyncAction(async () => {
    if (!this.activeTransform?.id) return;
    this.setIsLoading(true);
    const res = await trpc.saveFileTransformCopy
      .mutate({ id: this.activeTransform.id })
      .finally(() => this.setIsLoading(false));
    if (!res.success) throw new Error(res.error);
    toast.success("Media rendered");
    await openCarouselWindow({ file: res.data, selectedFileIds: [res.data.id] });
    await this.search.loadFiltered();
    await this.loadQueueCount();
    await this.loadActiveTransform();
  });

  @modelFlow
  togglePaused = asyncAction(async () => {
    const res = await (this.isPaused
      ? trpc.resumeFileTransformer.mutate()
      : trpc.pauseFileTransformer.mutate());
    if (!res.success) throw new Error(res.error);
    await this.getTransformerStatus();
    if (!this.isPaused) this.runActiveTransform();
  });
}
