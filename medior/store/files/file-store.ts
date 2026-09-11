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
import { _FileStore } from "medior/store/_generated";
import * as db from "medior/server/database";
import { FaceModel, RootStore } from "medior/store";
import { asyncAction, toast } from "medior/utils/client";
import { chunkArray, splitArray } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import {
  File,
  FileSearch,
  FileSimilarityStore,
  FileTagsEditorStore,
  VideoTransformerStore,
} from ".";

export interface FileDeletionProgress {
  message: string;
  processedCount: number;
  totalCount: number;
}

@model("medior/FileStore")
export class FileStore extends ExtendedModel(_FileStore, {
  activeFileId: prop<string | null>(null).withSetter(),
  archivedFileIds: prop<string[]>(() => []).withSetter(),
  deleteCancelToken: prop<number>(0).withSetter(),
  hasArchivedFiles: prop<boolean>(false).withSetter(),
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  isInfoModalOpen: prop<boolean>(false).withSetter(),
  isRefreshMinimized: prop<boolean>(false).withSetter(),
  isRefreshOpen: prop<boolean>(false).withSetter(),
  isRefreshing: prop<boolean>(false).withSetter(),
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
  cancelFileRefresh() {
    if (!this.isRefreshing) return;
    const refreshId = this.refreshId;

    this.refreshAbortController?.abort();
    this.setRefreshCancelToken(this.refreshCancelToken + 1);
    this.resetFileRefreshState();
    toast.info("File refresh cancelled.");

    if (refreshId)
      void trpc.cancelFileRefresh.mutate({ refreshId }).catch((error) => console.error(error));
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
  openVideoTransformer(fileIds: string[], fnType: "reencode" | "remux" | "splice") {
    this.videoTransformer.setFileIds(fileIds);
    this.videoTransformer.setFnType(fnType);
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
    this.setArchivedFileIds(
      isArchived
        ? [...new Set([...this.archivedFileIds, ...fileIds])]
        : this.archivedFileIds.filter((id) => !fileIds.includes(id)),
    );
    this.setHasArchivedFiles(this.archivedFileIds.length > 0);
  }

  @modelAction
  updateFiles(
    fileIds: string[],
    updates: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >,
  ) {
    fileIds.forEach((id) => this.getById(id)?.update?.(updates));
  }

  @modelAction
  updateVisibleFiles(
    fileIds: string[],
    updates: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >,
  ) {
    const stores = getRootStore<RootStore>(this);
    this.updateFiles(fileIds, updates);
    stores.collection.editor.updateFiles(fileIds, updates);
    stores.collection.manager.selectedFiles.forEach((file) => {
      if (fileIds.includes(file.id)) file.update(updates);
    });
    stores.collection.editor.fileSearch.results.forEach((file) => {
      if (fileIds.includes(file.id)) file.update(updates);
    });
    stores.collection.manager.search.files.forEach((file) => {
      if (fileIds.includes(file.id)) file.update(updates);
    });
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
    this.setIdsForConfirmDelete([...ids]);
    const res = await trpc.listFile.mutate({ args: { filter: { id: ids } } });
    if (!res.success) throw new Error(res.error);
    if (res.data.items.some((f) => f.isArchived)) this.setIsConfirmDeleteOpen(true);
    else this.deleteFiles();
  });

  @modelFlow
  deleteFiles = asyncAction(async (onProgress?: (progress: FileDeletionProgress) => void) => {
    const cancelToken = this.deleteCancelToken;
    const fileIds = [...this.idsForConfirmDelete];
    if (!fileIds?.length) throw new Error("No files to delete");

    const isCancelled = () => this.deleteCancelToken !== cancelToken;
    const reportProgress = (processedCount: number, message: string) =>
      onProgress?.({ message, processedCount, totalCount: fileIds.length });
    reportProgress(0, `Preparing to process ${fileIds.length} files.`);

    const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });
    if (!res.success) throw new Error(res.error);
    const files = res.data.items;

    const [deleted, archived] = splitArray(files, (f) => f.isArchived);
    const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));

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

      const errorCount = processedCount - deletedCount;
      reportProgress(
        processedCount,
        `Deleted ${deletedCount} / ${deletedIds.length} files${errorCount ? `(${errorCount} errors)` : ""}.`,
      );
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
      const res = await trpc.editFileTags.mutate({
        addedTagIds,
        batchId,
        fileIds,
        removedTagIds,
        withSub,
      });

      if (!res.success) throw new Error(res.error);
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
      return;
    }

    const cancelToken = this.refreshCancelToken;
    const refreshId = crypto.randomUUID();
    const abortController = new AbortController();
    const finishRefresh = async () => {
      const res = await trpc.finishFileRefresh.mutate({ refreshId });
      if (!res.success) console.error(res.error);
    };
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

    while (
      this.refreshCancelToken === cancelToken &&
      this.refreshProcessedCount < this.refreshFileIds.length
    ) {
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
        if (!res.success) throw new Error(res.error);
        this.updateVisibleFiles([fileId], res.data);
      } catch (error) {
        if (this.refreshCancelToken === cancelToken) {
          console.error(error);
          this.setRefreshErrorCount(this.refreshErrorCount + 1);
        }
      } finally {
        if (this.refreshCancelToken === cancelToken) {
          this.setRefreshProcessedCount(this.refreshProcessedCount + 1);
          this.setRefreshTotalCount(this.refreshFileIds.length);
        }
      }
    }

    const wasCancelled = this.refreshCancelToken !== cancelToken;
    if (wasCancelled) {
      await finishRefresh();
      return;
    }

    this.setRefreshMessage("Reloading refreshed files.");
    try {
      await (stores.collection.editor.isOpen
        ? stores.collection.editor.search.loadFiltered()
        : this.search.loadFiltered());
    } catch (error) {
      console.error(error);
    }

    const refreshedCount = this.refreshProcessedCount - this.refreshErrorCount;
    if (this.refreshErrorCount)
      toast.warn(`Refreshed ${refreshedCount} / ${this.refreshTotalCount} files.`);
    else toast.success(`Refreshed ${refreshedCount} files.`);

    await finishRefresh();
    if (this.refreshId === refreshId) this.resetFileRefreshState();
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
    if (!fileIds?.length) return false;

    const res = await trpc.setFileIsArchived.mutate({ fileIds, isArchived: false });
    if (!res.success) throw new Error(res.error);
    this.updateArchivedFileIds(fileIds, false);
    this.search.toggleSelected(fileIds.map((id) => ({ id, isSelected: false })));
    this.search.removeFiles(fileIds);

    toast.success(`${fileIds.length} files unarchived`);
    return true;
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getById(id: string) {
    return this.search.results.find((f) => f.id === id);
  }

  listByIds(ids: string[]) {
    return this.search.results.filter((f) => ids.includes(f.id));
  }

  listByTagId(tagId: string) {
    return this.search.results.filter((f) => f.tagIds.includes(tagId));
  }
}
