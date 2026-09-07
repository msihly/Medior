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
import { FaceModel, FileImporter, RootStore } from "medior/store";
import { asyncAction, makeQueue, toast } from "medior/utils/client";
import { chunkArray, PromiseQueue, splitArray } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { File, FileSearch, FileTagsEditorStore, VideoTransformerStore } from ".";

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
  search: prop<FileSearch>(() => new FileSearch({})),
  tagsEditor: prop<FileTagsEditorStore>(() => new FileTagsEditorStore({})),
  videoTransformer: prop<VideoTransformerStore>(() => new VideoTransformerStore({})),
}) {
  refreshQueue = new PromiseQueue();

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
  clearRefreshQueue() {
    this.refreshQueue.cancel();
    this.refreshQueue = new PromiseQueue();
  }

  @modelAction
  openVideoTransformer(fileIds: string[], fnType: "reencode" | "remux" | "splice") {
    this.videoTransformer.setFileIds(fileIds);
    this.videoTransformer.setFnType(fnType);
    this.videoTransformer.setIsOpen(true);
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

    if (tagIdsToRegen.size) {
      const regenRes = await trpc.regenTags.mutate({ tagIds: [...tagIdsToRegen] });
      if (!regenRes.success) throw new Error(regenRes.error);
    }

    if (deletedCount) toast.warn(`${deletedCount} files deleted`);

    this.search.toggleSelected(processedIds.map((id) => ({ id, isSelected: false })));
    this.setIsConfirmDeleteOpen(false);
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
    const stores = getRootStore<RootStore>(this);

    const filesRes = await trpc.listFile.mutate({ args: { filter: { id: args.ids } } });
    if (!filesRes?.success) throw new Error("Failed to load files");
    const files = filesRes.data.items;

    await makeQueue({
      action: async (file) => {
        const importer = new FileImporter({
          deleteOnImport: false,
          ext: file.ext,
          ignorePrevDeleted: false,
          originalName: file.originalName,
          originalPath: file.path,
          size: file.size,
          tagIds: file.tagIds,
        });

        const res = await importer.refresh(file);
        if (!res.success) throw new Error(res.error);
      },
      items: files,
      logPrefix: "Refreshed",
      logSuffix: "files",
      onComplete: () =>
        stores.collection.editor.isOpen
          ? stores.collection.editor.search.loadFiltered()
          : this.search.loadFiltered(),
      queue: this.refreshQueue,
    });
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
