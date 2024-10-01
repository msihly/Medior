import { promises as fs } from "fs";
import path from "path";
import md5File from "md5-file";
import {
  ExtendedModel,
  getRootStore,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import * as db from "medior/database";
import { asyncAction, FaceModel, RootStore } from "medior/store";
import { _FileStore } from "medior/store/_generated";
import { File, FileSearch } from ".";
import {
  CONSTANTS,
  dayjs,
  generateFramesThumbnail,
  getVideoInfo,
  makeQueue,
  PromiseQueue,
  sharp,
  splitArray,
  trpc,
} from "medior/utils";
import { toast } from "react-toastify";

@model("medior/FileStore")
export class FileStore extends ExtendedModel(_FileStore, {
  activeFileId: prop<string | null>(null).withSetter(),
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  isInfoModalOpen: prop<boolean>(false).withSetter(),
  search: prop<FileSearch>(() => new FileSearch({})),
}) {
  refreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFileAfterIndex(file: ModelCreationData<File>, index: number) {
    this.search.results.splice(index + 1, 0, new File(file));
  }

  @modelAction
  clearRefreshQueue() {
    this.refreshQueue.cancel();
    this.refreshQueue = new PromiseQueue();
  }

  @modelAction
  updateFiles(
    fileIds: string[],
    updates: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >
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
    fileIds.forEach((id) => this.getById(id)?.updateTags?.({ addedTagIds, removedTagIds }));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  confirmDeleteFiles = asyncAction(async (ids: string[]) => {
    this.setIdsForConfirmDelete([...ids]);
    const res = await trpc.listFiles.mutate({ args: { filter: { id: ids } } });
    if (!res.success) throw new Error(res.error);
    if (res.data.items.some((f) => f.isArchived)) this.setIsConfirmDeleteOpen(true);
    else this.deleteFiles();
  });

  @modelFlow
  deleteFiles = asyncAction(async () => {
    const fileIds = [...this.idsForConfirmDelete];
    if (!fileIds?.length) throw new Error("No files to delete");

    const res = await trpc.listFiles.mutate({ args: { filter: { id: fileIds } } });
    if (!res.success) throw new Error(res.error);
    const files = res.data.items;

    const [deleted, archived] = splitArray(files, (f) => f.isArchived);
    const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));

    if (!deletedIds.length && !archivedIds.length) throw new Error("No files to delete or archive");

    if (archivedIds?.length > 0) {
      const res = await trpc.setFileIsArchived.mutate({ fileIds: archivedIds, isArchived: true });
      if (res.success) toast.warn(`${archivedIds.length} files archived`);
      else throw new Error(`Error archiving files: ${res.error}`);
    }

    if (deletedIds?.length > 0) {
      const deleteRes = await trpc.deleteFiles.mutate({ fileIds: deletedIds });
      if (!deleteRes.success) throw new Error(deleteRes.error);

      await Promise.all(
        deleted.flatMap((file) =>
          this.listByHash(file.hash).length === 1
            ? [fs.unlink(file.path), ...file.thumbPaths.map((thumbPath) => fs.unlink(thumbPath))]
            : []
        )
      );

      toast.warn(`${deletedIds.length} files deleted`);
    }

    this.search.toggleSelected(fileIds.map((id) => ({ id, isSelected: false })));
  });

  @modelFlow
  editFileTags = asyncAction(
    async ({ addedTagIds = [], batchId, fileIds, removedTagIds = [] }: db.EditFileTagsInput) => {
      const res = await trpc.editFileTags.mutate({
        addedTagIds,
        batchId,
        fileIds,
        removedTagIds,
      });

      if (!res.success) throw new Error(res.error);
      toast.success(`${fileIds.length} files updated`);
    }
  );

  @modelFlow
  refreshFile = asyncAction(async ({ curFile, id }: { curFile?: db.FileSchema; id: string }) => {
    if (!curFile && !id) throw new Error("No file or id provided");
    const file = !curFile ? this.getById(id) : new File(curFile);

    const curThumbPaths = [...file.thumbPaths];

    const [hash, { mtime, size }, imageInfo, videoInfo] = await Promise.all([
      md5File(file.path),
      fs.stat(file.path),
      !file.isAnimated ? sharp(file.path).metadata() : null,
      file.isAnimated ? getVideoInfo(file.path) : null,
    ]);

    const updates: Partial<File> = {
      dateModified: dayjs(mtime).isAfter(file.dateModified)
        ? mtime.toISOString()
        : file.dateModified,
      duration: file.isAnimated ? videoInfo?.duration : file.duration,
      frameRate: file.isAnimated ? videoInfo?.frameRate : file.frameRate,
      hash,
      height: file.isAnimated ? videoInfo?.height : imageInfo?.height,
      originalHash: file.originalHash ?? hash,
      size,
      videoCodec: videoInfo?.videoCodec,
      width: file.isAnimated ? videoInfo?.width : imageInfo?.width,
    };

    const dirPath = path.dirname(file.path);

    const thumbPaths = file.isAnimated
      ? Array(9)
          .fill("")
          .map((_, i) => path.join(dirPath, `${hash}-thumb-${String(i + 1).padStart(2, "0")}.jpg`))
      : [path.join(dirPath, `${hash}-thumb.jpg`)];

    await (file.isAnimated
      ? generateFramesThumbnail(file.path, dirPath, hash, videoInfo?.duration)
      : sharp(file.path, { failOn: "none" })
          .resize(null, CONSTANTS.FILE.THUMB.WIDTH)
          .toFile(thumbPaths[0]));

    updates["thumbPaths"] = thumbPaths;

    await trpc.updateFile.mutate({ id, ...updates });
    file.update?.(updates);

    await Promise.all(curThumbPaths.map((t) => !t.endsWith(".jpg") && fs.unlink(t)));

    return updates;
  });

  @modelFlow
  refreshFiles = asyncAction(async (args: { ids: string[] }) => {
    const stores = getRootStore<RootStore>(this);

    const filesRes = await trpc.listFiles.mutate({ args: { filter: { id: args.ids } } });
    if (!filesRes?.success) throw new Error("Failed to load files");

    makeQueue({
      action: (item) => this.refreshFile({ curFile: item, id: item.id }),
      items: filesRes.data.items,
      logSuffix: "files",
      onComplete: () =>
        stores.collection.editor.isOpen
          ? stores.collection.editor.loadCollection(stores.collection.editor.collection.id)
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

    await trpc.setFileIsArchived.mutate({ fileIds, isArchived: false });
    this.search.toggleSelected(fileIds.map((id) => ({ id, isSelected: false })));

    toast.success(`${fileIds.length} files unarchived`);
    return true;
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getById(id: string) {
    return this.search.results.find((f) => f.id === id);
  }

  listByHash(hash: string) {
    return this.search.results.filter((f) => f.hash === hash);
  }

  listByIds(ids: string[]) {
    return this.search.results.filter((f) => ids.includes(f.id));
  }

  listByTagId(tagId: string) {
    return this.search.results.filter((f) => f.tagIds.includes(tagId));
  }
}
