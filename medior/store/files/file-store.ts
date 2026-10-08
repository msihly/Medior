import autoBind from "auto-bind";
import {
  ExtendedModel,
  getRootStore,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { _FileStore, SortValue } from "medior/store/_generated";
import * as db from "medior/server/database";
import { FaceModel, RootStore } from "medior/store";
import { asyncAction, toast } from "medior/utils/client";
import { chunkArray } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import {
  File,
  FileSearch,
  FileSimilarityStore,
  FileTagsEditorStore,
  LowerResolutionStore,
  VideoTransformerStore,
} from ".";

export interface FileDeletionProgress {
  message: string;
  processedCount: number;
  totalCount: number;
}

@model("medior/FileStore")
export class FileStore extends ExtendedModel(_FileStore, {
  actionCancelToken: prop<number>(0).withSetter(),
  actionMessage: prop<string>("").withSetter(),
  activeFileId: prop<string | null>(null).withSetter(),
  archivedFileIds: prop<string[]>(() => []).withSetter(),
  deleteCancelToken: prop<number>(0).withSetter(),
  hasArchivedFiles: prop<boolean>(false).withSetter(),
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  isActionCancelling: prop<boolean>(false).withSetter(),
  isActionRunning: prop<boolean>(false).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  isInfoModalOpen: prop<boolean>(false).withSetter(),
  isRefreshing: prop<boolean>(false).withSetter(),
  isRefreshMinimized: prop<boolean>(false).withSetter(),
  isRefreshOpen: prop<boolean>(false).withSetter(),
  lowerResolution: prop<LowerResolutionStore>(() => new LowerResolutionStore({})),
  refreshCancelToken: prop<number>(0).withSetter(),
  refreshCurrentFileId: prop<string | null>(null).withSetter(),
  refreshCurrentFileName: prop<string | null>(null).withSetter(),
  refreshErrorCount: prop<number>(0).withSetter(),
  refreshFileIds: prop<string[]>(() => []).withSetter(),
  refreshId: prop<string | null>(null).withSetter(),
  refreshMessage: prop<string>("").withSetter(),
  refreshProcessedCount: prop<number>(0).withSetter(),
  refreshStepProgress: prop<number | null>(null).withSetter(),
  refreshTotalCount: prop<number>(0).withSetter(),
  search: prop<FileSearch>(() => new FileSearch({})),
  similarity: prop<FileSimilarityStore>(() => new FileSimilarityStore({})),
  tagsEditor: prop<FileTagsEditorStore>(() => new FileTagsEditorStore({})),
  videoTransformer: prop<VideoTransformerStore>(() => new VideoTransformerStore({})),
}) {
  private actionAbortController: AbortController = null;
  private refreshAbortController: AbortController = null;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFileAfterIndex(file: ModelCreationData<File>, index: number) {
    this.search.results.splice(index + 1, 0, new File(file));
  }

  @modelAction
  cancelDeleteFiles() {
    this.deleteCancelToken++;
  }

  @modelAction
  cancelFileAction() {
    this.setActionCancelToken(this.actionCancelToken + 1);
    this.setIsActionCancelling(true);
    this.actionAbortController?.abort();
    this.cancelDeleteFiles();
  }

  @modelAction
  cancelFileRefresh() {
    if (!this.isRefreshing) return;

    const refreshId = this.refreshId;

    this.refreshAbortController?.abort();
    this.setRefreshCancelToken(this.refreshCancelToken + 1);
    this.resetFileRefreshState();
    toast.info("File refresh cancelled.");

    if (refreshId) trpc.cancelFileRefresh.mutate({ refreshId }).catch(console.error);
  }

  @modelAction
  handleFileRefreshProgress({
    fileId,
    fileName,
    message,
    progress,
    refreshId,
  }: {
    fileId: string;
    fileName: string;
    message: string;
    progress?: number;
    refreshId: string;
  }) {
    if (refreshId !== this.refreshId) return;

    this.setRefreshCurrentFileId(fileId);
    this.setRefreshCurrentFileName(fileName);
    this.setRefreshMessage(message);
    this.setRefreshStepProgress(progress ?? null);
  }

  @modelAction
  openVideoTransformer(
    fileIds: string[],
    fnType: "reencode" | "remux" | "splice",
    sortValue?: SortValue,
  ) {
    if (sortValue && this.search.ids.length) {
      const selectedIds = new Set(fileIds);

      fileIds = this.search.ids.filter((id) => selectedIds.has(id));
      sortValue = null;
    }

    this.videoTransformer.setFileIds(fileIds);
    this.videoTransformer.setFnType(fnType);
    this.videoTransformer.setSourceSortValue(sortValue ? { ...sortValue } : null);
    this.videoTransformer.setIsOpen(true);
  }

  @modelAction
  resetFileRefreshState() {
    this.refreshAbortController = null;
    this.setIsRefreshMinimized(false);
    this.setIsRefreshOpen(false);
    this.setIsRefreshing(false);
    this.setRefreshCurrentFileId(null);
    this.setRefreshCurrentFileName(null);
    this.setRefreshFileIds([]);
    this.setRefreshId(null);
  }

  @modelAction
  updateArchivedFileIds(fileIds: string[], isArchived: boolean) {
    const updatedIds = new Set(fileIds);

    this.setArchivedFileIds(
      isArchived
        ? [...new Set([...this.archivedFileIds, ...fileIds])]
        : this.archivedFileIds.filter((id) => !updatedIds.has(id)),
    );

    this.setHasArchivedFiles(this.archivedFileIds.length > 0);
  }

  @modelAction
  updateFileTags({
    addedTagIds,
    fileIds,
    removedTagIds,
  }: {
    addedTagIds: string[];
    fileIds: string[];
    removedTagIds: string[];
  }) {
    this.search.updateFileTags({ addedTagIds, fileIds, removedTagIds });
    this.similarity.search.updateFileTags({ addedTagIds, fileIds, removedTagIds });
  }

  @modelAction
  updateFiles(
    fileIds: string[],
    updates: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >,
  ) {
    const filesById = new Map(this.search.results.map((file) => [file.id, file]));

    fileIds.forEach((id) => filesById.get(id)?.update?.(updates));
  }

  @modelAction
  updateVisibleFiles(
    fileIds: string[],
    updates: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >,
  ) {
    const stores = getRootStore<RootStore>(this);

    const updatedIds = new Set(fileIds);
    const files = [
      ...this.similarity.search.results,
      ...stores.collection.manager.selectedFiles,
      ...stores.collection.editor.fileSearch.results,
      ...stores.collection.manager.search.files.values(),
    ];

    this.updateFiles(fileIds, updates);
    stores.collection.editor.updateFiles(fileIds, updates);

    for (const file of files) {
      if (updatedIds.has(file.id)) file.update(updates);
    }
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  archiveFiles = asyncAction(async (ids: string[]) => {
    const res = await trpc.setFileIsArchived.mutate({ fileIds: ids, isArchived: true });

    if (!res.success) throw new Error(`Error archiving files: ${res.error}`);

    this.updateArchivedFileIds(ids, true);
    toast.warn(`${ids.length} files archived`);
  });

  @modelFlow
  confirmDeleteArchivedFiles = asyncAction(async () => {
    if (!this.hasArchivedFiles) return;

    this.search.setSelectedIds([...this.archivedFileIds]);
    this.setIdsForConfirmDelete([...this.archivedFileIds]);
    this.setIsConfirmDeleteOpen(true);
  });

  @modelFlow
  confirmDeleteFiles = asyncAction(async (ids: string[]) => {
    if (this.isActionRunning || !ids.length) return;

    const cancelToken = this.actionCancelToken;

    this.setIdsForConfirmDelete([...ids]);
    this.setIsActionCancelling(false);
    this.setIsActionRunning(true);
    this.setActionMessage("Preparing files…");
    this.actionAbortController = new AbortController();

    try {
      const res = await trpc.listFile.mutate(
        { args: { filter: { id: ids } } },
        { signal: this.actionAbortController.signal },
      );

      if (cancelToken !== this.actionCancelToken) return;

      if (!res.success) throw new Error(res.error);

      this.actionAbortController = null;

      if (res.data.items.some((file) => file.isArchived)) this.setIsConfirmDeleteOpen(true);
      else {
        const deleted = await this.deleteFiles(({ message }) => this.setActionMessage(message));

        if (!deleted.success) throw new Error(deleted.error);
      }
    } catch (error) {
      if (cancelToken === this.actionCancelToken) toast.error(error);
    } finally {
      this.actionAbortController = null;
      this.setIsActionRunning(false);
      this.setIsActionCancelling(false);
    }
  });

  @modelFlow
  deleteFiles = asyncAction(async (onProgress?: (progress: FileDeletionProgress) => void) => {
    const cancelToken = this.deleteCancelToken;
    const fileIds = [...this.idsForConfirmDelete];

    if (!fileIds?.length) throw new Error("No files to delete");

    const isCancelled = () => this.deleteCancelToken !== cancelToken;

    const reportProgress = (processedCount: number, message: string) =>
      onProgress?.({ message, processedCount, totalCount: fileIds.length });

    reportProgress(0, `Processing ${fileIds.length} files.`);

    const archivedIds: string[] = [];
    const deletedIds: string[] = [];

    for (const chunk of chunkArray(fileIds, 1000)) {
      if (isCancelled()) break;

      const res = await trpc.listFileSelectionState.mutate({ fileIds: chunk });

      if (!res.success) throw new Error(res.error);

      for (const file of res.data) {
        if (file.isArchived) deletedIds.push(file.id);
        else archivedIds.push(file.id);
      }
    }

    if (!deletedIds.length && !archivedIds.length) throw new Error("No files to delete or archive");

    const processedIds: string[] = [];
    const tagIdsToRegen = new Set<string>();
    let processedCount = 0;

    for (const chunk of chunkArray(archivedIds, 200)) {
      if (isCancelled()) break;

      const res = await trpc.setFileIsArchived.mutate({ fileIds: chunk, isArchived: true });

      if (!res.success) throw new Error(`Error archiving files: ${res.error}`);

      this.updateArchivedFileIds(chunk, true);
      this.search.removeFiles(chunk);
      processedIds.push(...chunk);
      processedCount += chunk.length;
      reportProgress(
        processedCount,
        `Archived ${processedCount} / ${archivedIds.length} files; ${deletedIds.length} files remain to be deleted.`,
      );
    }

    const archivedCount = processedCount;

    if (archivedCount) toast.warn(`${archivedCount} files archived`);

    let deletedCount = 0;

    for (const chunk of chunkArray(deletedIds, 200)) {
      if (isCancelled()) break;

      const deleteRes = await trpc.deleteFiles.mutate({ fileIds: chunk, withTagRegen: false });

      if (!deleteRes.success) throw new Error(deleteRes.error);

      deleteRes.data.tagIds.forEach((tagId) => tagIdsToRegen.add(tagId));
      this.updateArchivedFileIds(chunk, false);
      this.search.removeFiles(chunk);
      processedIds.push(...chunk);

      deletedCount += chunk.length;
      processedCount += chunk.length;

      reportProgress(processedCount, `Deleted ${deletedCount} / ${deletedIds.length} files.`);
    }

    this.search.toggleSelected(processedIds.map((id) => ({ id, isSelected: false })));
    this.setIdsForConfirmDelete([]);
    this.setIsConfirmDeleteOpen(false);

    if (tagIdsToRegen.size) {
      const regenRes = await trpc.regenTags.mutate({ tagIds: [...tagIdsToRegen] });

      if (!regenRes.success) throw new Error(regenRes.error);
    }

    if (deletedCount) toast.warn(`${deletedCount} files deleted`);

    if (this.search.isArchived)
      await this.search.loadFiltered({ noCache: true, page: 1, withFullCount: true });

    return { archivedCount, deletedCount };
  });

  @modelFlow
  editFileTags = asyncAction(
    async ({
      addedTagIds = [],
      batchId,
      fileIds,
      removedTagIds = [],
      withSub = true,
      withToast = true,
    }: db.EditFileTagsInput & { withToast?: boolean }) => {
      for (const ids of chunkArray(fileIds, 1000)) {
        const res = await trpc.editFileTags.mutate({
          addedTagIds,
          batchId,
          fileIds: ids,
          removedTagIds,
          withSub,
        });

        if (!res.success) throw new Error(res.error);
      }

      if (withToast) toast.success(`${fileIds.length} files updated`);
    },
  );

  @modelFlow
  loadArchivedFileIds = asyncAction(async () => {
    const res = await trpc.listAllArchivedFileIds.mutate();

    if (!res.success) throw new Error(res.error);

    this.setArchivedFileIds(res.data);
    this.setHasArchivedFiles(res.data.length > 0);
  });

  @modelFlow
  refreshFiles = asyncAction(async (args: { ids: string[] }) => {
    if (!args.ids.length) return;

    const stores = getRootStore<RootStore>(this);

    const ids = [...new Set(args.ids)];

    if (this.isRefreshing) {
      this.setRefreshFileIds([...new Set([...this.refreshFileIds, ...ids])]);
      this.setRefreshTotalCount(this.refreshFileIds.length);
      this.setIsRefreshMinimized(false);
      this.setIsRefreshOpen(true);
    } else {
      const abortController = new AbortController();
      const cancelToken = this.refreshCancelToken;
      const refreshId = crypto.randomUUID();

      const isCurrentRefresh = () =>
        this.refreshId === refreshId && this.refreshCancelToken === cancelToken;

      this.refreshAbortController = abortController;
      this.setIsRefreshMinimized(false);
      this.setIsRefreshOpen(true);
      this.setIsRefreshing(true);
      this.setRefreshCurrentFileId(null);
      this.setRefreshCurrentFileName(null);
      this.setRefreshErrorCount(0);
      this.setRefreshFileIds(ids);
      this.setRefreshId(refreshId);
      this.setRefreshMessage("Preparing refresh queue.");
      this.setRefreshProcessedCount(0);
      this.setRefreshStepProgress(null);
      this.setRefreshTotalCount(ids.length);

      try {
        while (isCurrentRefresh() && this.refreshProcessedCount < this.refreshFileIds.length) {
          const fileId = this.refreshFileIds[this.refreshProcessedCount];
          const file =
            this.getById(fileId) ??
            stores.collection.editor.getFileById(fileId) ??
            stores.collection.editor.fileSearch.getResult(fileId);

          this.setRefreshCurrentFileId(fileId);
          this.setRefreshCurrentFileName(file?.originalName ?? fileId);
          this.setRefreshMessage("Starting refresh.");
          this.setRefreshStepProgress(null);

          try {
            const res = await trpc.refreshFileInfo.mutate(
              { fileId, refreshId },
              { signal: abortController.signal },
            );

            if (isCurrentRefresh()) {
              if (!res.success) throw new Error(res.error);

              this.updateVisibleFiles([fileId], res.data);
            }
          } catch (error) {
            if (isCurrentRefresh()) {
              console.error(error);
              this.setRefreshErrorCount(this.refreshErrorCount + 1);
            }
          } finally {
            if (isCurrentRefresh()) {
              this.setRefreshProcessedCount(this.refreshProcessedCount + 1);
              this.setRefreshTotalCount(this.refreshFileIds.length);
            }
          }

          if (isCurrentRefresh() && this.refreshProcessedCount === this.refreshFileIds.length) {
            this.setRefreshMessage("Reloading refreshed files.");

            try {
              const res = await (stores.collection.editor.isOpen
                ? stores.collection.editor.search.loadFiltered()
                : this.search.loadFiltered());

              if (!res.success) console.error(res.error);
            } catch (error) {
              console.error(error);
            }
          }
        }

        if (isCurrentRefresh()) {
          const errorCount = this.refreshErrorCount;
          const refreshedCount = this.refreshProcessedCount - errorCount;
          const totalCount = this.refreshTotalCount;

          this.resetFileRefreshState();

          if (errorCount) toast.warn(`Refreshed ${refreshedCount} / ${totalCount} files.`);
          else toast.success(`Refreshed ${refreshedCount} files.`);
        }
      } finally {
        if (this.refreshId === refreshId) this.resetFileRefreshState();

        try {
          const res = await trpc.finishFileRefresh.mutate({ refreshId });

          if (!res.success) console.error(res.error);
        } catch (error) {
          console.error(error);
        }
      }
    }
  });

  @modelFlow
  setFileRating = asyncAction(async ({ fileIds = [], rating }: db.SetFileRatingInput) => {
    if (!fileIds.length) return;

    const res = await trpc.setFileRating.mutate({ fileIds, rating });

    if (res.success) toast.success(`Rating updated to ${rating}`);
    else {
      console.error("Error updating rating:", res.error);
      toast.error("Error updating rating");
    }
  });

  @modelFlow
  unarchiveFiles = asyncAction(async ({ fileIds }: { fileIds: string[] }) => {
    if (!fileIds?.length || this.isActionRunning) return false;

    const cancelToken = this.actionCancelToken;
    let processedCount = 0;

    this.setIsActionCancelling(false);
    this.setIsActionRunning(true);
    this.setActionMessage(`Unarchiving ${fileIds.length} files…`);

    try {
      for (const ids of chunkArray(fileIds, 200)) {
        if (cancelToken !== this.actionCancelToken) break;

        const res = await trpc.setFileIsArchived.mutate({ fileIds: ids, isArchived: false });

        if (!res.success) throw new Error(res.error);

        this.updateArchivedFileIds(ids, false);
        this.search.toggleSelected(ids.map((id) => ({ id, isSelected: false })));
        this.search.removeFiles(ids);
        processedCount += ids.length;
        this.setActionMessage(`Unarchived ${processedCount} / ${fileIds.length} files`);
      }

      toast.info(`${processedCount} files unarchived`);

      return cancelToken === this.actionCancelToken;
    } catch (error) {
      toast.error(error);

      return false;
    } finally {
      this.setIsActionRunning(false);
      this.setIsActionCancelling(false);
    }
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getById(id: string) {
    return this.search.results.find((f) => f.id === id);
  }
}
