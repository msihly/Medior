import autoBind from "auto-bind";
import { reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
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
  timestampPairs: prop<Array<[number, number]>>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => {
        if (!this.isOpen) this.reset();
        else {
          this.getTransformerStatus();
          this.loadQueueCount();
          this.loadActiveTransform();
          this.loadQueue({ page: 1 });
        }
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    this.setActiveTransform(null);
    this.setActiveFile(null);
    this.setFileIds([]);
    this.setFnType(null);
    this.setIsLoading(false);
    this.setIsMinimized(false);
    this.setPendingCount(0);
    this.setQueueAfterSize(0);
    this.setQueueBeforeSize(0);
    this.setTimestampPairs([]);
  }

  @modelAction
  removeQueueFiles(fileIds: string[]) {
    const fileIdSet = new Set(fileIds);
    const ids = this.search.results
      .filter((transform) => fileIdSet.has(transform.fileId))
      .map((transform) => transform.id);
    this.search._deleteResults(ids);
    this.search.setFiles(
      new Map([...this.search.files].filter(([fileId]) => !fileIdSet.has(fileId))),
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTransforms = asyncAction(async () => {
    if (!this.fileIds.length || !this.fnType) return;

    this.setIsLoading(true);
    const res = await trpc.createFileTransforms
      .mutate({
        fileIds: this.fileIds,
        timestampPairs: this.timestampPairs.map(([start, end]) => ({ end, start })),
        type: this.fnType,
      })
      .finally(() => this.setIsLoading(false));
    if (!res.success) throw new Error(res.error);

    this.setFileIds([]);
    await this.loadQueue({ page: 1 });
    await this.loadQueueCount();
    await this.loadActiveTransform();
    await this.runTransformer();
    await this.loadQueueCount();
    await this.loadActiveTransform();
  });

  @modelFlow
  deleteTransforms = asyncAction(async (ids: string[]) => {
    if (!ids.length) return;
    const res = await trpc.deleteFileTransforms.mutate({ ids });
    if (!res.success) throw new Error(res.error);
    const fileIds = ids.map((id) => this.search.getResult(id)?.fileId).filter(Boolean);
    this.removeQueueFiles(fileIds);
    if (this.activeTransform && ids.includes(this.activeTransform.id))
      this.setActiveTransform(null);
    await this.loadQueueCount();
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
  loadActiveTransform = asyncAction(async () => {
    this.setIsLoading(true);

    try {
      const res = await trpc.getNextFileTransform.mutate();
      if (!res.success) throw new Error(res.error);

      this.setActiveTransform(new FileTransform(res.data));

      const fileId = res.data?.fileId;
      if (!fileId) {
        this.setActiveFile(null);
        return;
      }

      const filesRes = await trpc.listFile.mutate({ args: { filter: { id: [fileId] } } });
      if (!filesRes.success) throw new Error(filesRes.error);

      const file = filesRes.data.items[0];
      if (!file) throw new Error("File not found");

      const tagRes = await trpc.listTag.mutate({ filter: { id: file.tagIds } });
      if (!tagRes.success) throw new Error(tagRes.error);

      this.setActiveFile(new File({ ...file, tags: tagRes.data }));
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  loadQueue = asyncAction(async (args: { page?: number; withFullCount?: boolean } = {}) => {
    await this.search.loadFiltered(args);
    await this.search.loadFiles();
  });

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
  });

  @modelFlow
  replaceOutput = asyncAction(async () => {
    if (!this.activeTransform?.id) return;
    this.setIsLoading(true);
    const res = await trpc.replaceFileTransformOutput
      .mutate({ id: this.activeTransform.id })
      .finally(() => this.setIsLoading(false));
    if (!res.success) throw new Error(res.error);
    toast.success("Video replaced");
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
    toast.success("Video rendered");
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
    if (!this.isPaused) this.runTransformer();
  });
}
