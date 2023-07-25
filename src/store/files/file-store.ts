import { promises as fs } from "fs";
import path from "path";
import md5File from "md5-file";
import { computed } from "mobx";
import {
  _async,
  _await,
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { RootStore } from "store";
import { EditFileTagsInput, LoadFilesInput, RefreshFileInput, SetFileRatingInput } from "database";
import { File } from ".";
import {
  CONSTANTS,
  dayjs,
  generateFramesThumbnail,
  getVideoInfo,
  handleErrors,
  IMAGE_EXT_REG_EXP,
  PromiseQueue,
  splitArray,
  trpc,
  VIDEO_EXT_REG_EXP,
} from "utils";
import { toast } from "react-toastify";

export const FileInfoRefreshQueue = new PromiseQueue();

@model("mediaViewer/FileStore")
export class FileStore extends Model({
  files: prop<File[]>(() => []),
  filteredFileIds: prop<string[]>(() => []),
  page: prop<number>(1).withSetter(),
  selectedIds: prop<string[]>(() => []),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  append(files: ModelCreationData<File>[]) {
    this.files.push(
      ...files.reduce((acc, cur) => {
        const file = this.files.find((f) => f.id === cur.id);
        if (!file) acc.push(new File(cur));
        else file.update(cur);
        return acc;
      }, [])
    );
  }

  @modelAction
  appendFiltered(files: ModelCreationData<File>[], page = this.page) {
    const displayed = files.slice((page - 1) * CONSTANTS.FILE_COUNT, page * CONSTANTS.FILE_COUNT);
    this.append(displayed);
    this.filteredFileIds = files.map((f) => f.id);
  }

  @modelAction
  overwrite(files: ModelCreationData<File>[]) {
    this.files = files.map((f) => new File(f));
    this.filteredFileIds = files.map((f) => f.id);
  }

  @modelAction
  toggleFilesSelected(selected: { id: string; isSelected?: boolean }[]) {
    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []]
    );
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removed.includes(id)
    );
  }

  @modelAction
  updateFiles(fileIds: string[], updates: Partial<File>) {
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
  deleteFiles = _async(function* (
    this: FileStore,
    {
      files,
      isUndelete = false,
      rootStore,
    }: { files: File[]; isUndelete?: boolean; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        if (!files?.length) return false;

        if (isUndelete) {
          const fileIds = files.map((f) => f.id);
          await trpc.setFileIsArchived.mutate({ fileIds, isArchived: false });
          await trpc.onFilesUpdated.mutate({ fileIds, updates: { isArchived: false } });
          toast.success(`${files.length} files unarchived`);
        } else {
          const [deleted, archived] = splitArray(files, (f: File) => f.isArchived);
          const [deletedIds, archivedIds] = [deleted, archived].map((arr) => arr.map((f) => f.id));

          if (archivedIds?.length > 0) {
            await trpc.setFileIsArchived.mutate({ fileIds: archivedIds, isArchived: true });
            await trpc.onFilesUpdated.mutate({
              fileIds: archivedIds,
              updates: { isArchived: true },
            });

            toast.success(`${archivedIds.length} files archived`);
          }

          if (deletedIds?.length > 0) {
            await trpc.deleteFiles.mutate({ fileIds: deletedIds });
            await Promise.all(
              deleted.flatMap((file) =>
                this.listByHash(file.hash).length === 1
                  ? [
                      fs.unlink(file.path),
                      ...file.thumbPaths.map((thumbPath) => fs.unlink(thumbPath)),
                    ]
                  : []
              )
            );

            await Promise.all(
              [...new Set(deleted.flatMap((f) => f.tagIds))].map((id) =>
                rootStore.tagStore.refreshTagCount({ id, withRelated: true })
              )
            );

            await trpc.onFilesDeleted.mutate({ fileIds: deletedIds });
            toast.success(`${deletedIds.length} files deleted`);
          }
        }

        this.toggleFilesSelected(files.map((f) => ({ id: f.id, isSelected: false })));

        return true;
      })
    );
  });

  @modelFlow
  editFileTags = _async(function* (
    this: FileStore,
    { addedTagIds = [], batchId, fileIds, rootStore, removedTagIds = [] }: EditFileTagsInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        if (!fileIds?.length || (!addedTagIds?.length && !removedTagIds?.length)) return false;

        if (removedTagIds?.length > 0) {
          if (batchId?.length > 0)
            await trpc.removeTagsFromBatch.mutate({ batchId, tagIds: removedTagIds });
          await trpc.removeTagsFromFiles.mutate({ fileIds, tagIds: removedTagIds });
        }

        if (addedTagIds?.length > 0) {
          if (batchId?.length > 0)
            await trpc.addTagsToBatch.mutate({ batchId, tagIds: addedTagIds });
          await trpc.addTagsToFiles.mutate({ fileIds, tagIds: addedTagIds });
        }

        await Promise.all(
          [...addedTagIds, ...removedTagIds].map((id) =>
            rootStore.tagStore.refreshTagCount({ id, withRelated: true })
          )
        );

        await trpc.onFileTagsUpdated.mutate({ addedTagIds, batchId, fileIds, removedTagIds });
        toast.success(`${fileIds.length} files updated`);
      })
    );
  });

  @modelFlow
  loadFiles = _async(function* (this: FileStore, { fileIds }: LoadFilesInput) {
    return yield* _await(
      handleErrors(async () => {
        if (!fileIds?.length) return false;
        const filesRes = await trpc.listFiles.mutate({ ids: fileIds });
        if (filesRes.success) this.overwrite(filesRes.data);
        return filesRes.success;
      })
    );
  });

  @modelFlow
  loadMissingFiles = _async(function* (this: FileStore) {
    return yield* _await(
      handleErrors(async () => {
        const selectedFiles = this.selected.map((f) => f.id);
        if (selectedFiles.length < this.selectedIds.length) {
          const missingFiles = this.selectedIds.filter((id) => !selectedFiles.includes(id));
          console.debug(`Loading ${missingFiles.length} missing files`);

          const filesRes = await trpc.listFiles.mutate({ ids: missingFiles });
          if (filesRes.success) this.append(filesRes.data);
        }
      })
    );
  });

  @modelFlow
  refreshFile = _async(function* (this: FileStore, { id, withThumbs = false }: RefreshFileInput) {
    return yield* _await(
      handleErrors(async () => {
        const file = this.getById(id);
        const sharp = !file.isAnimated ? (await import("sharp")).default : null;

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
          width: file.isAnimated ? videoInfo?.width : imageInfo?.width,
        };

        if (withThumbs) {
          const dirPath = path.dirname(file.path);

          const thumbPaths = file.isAnimated
            ? Array(9)
                .fill("")
                .map((_, i) =>
                  path.join(dirPath, `${hash}-thumb-${String(i + 1).padStart(2, "0")}.jpg`)
                )
            : [path.join(dirPath, `${hash}-thumb${file.ext}`)];

          await (file.isAnimated
            ? generateFramesThumbnail(file.path, dirPath, hash, videoInfo?.duration)
            : sharp(file.path).resize(null, 300).toFile(thumbPaths[0]));

          updates["thumbPaths"] = thumbPaths;
        }

        await trpc.updateFile.mutate({ id, ...updates });
        file.update(updates);

        return updates;
      })
    );
  });

  @modelFlow
  refreshSelectedFiles = _async(function* (this: FileStore) {
    return yield* _await(
      handleErrors(async () => {
        let completedCount = 0;
        const totalCount = this.selected.length;

        const toastId = toast.info(() => `Refreshed ${completedCount} files' info...`, {
          autoClose: false,
        });

        this.selected.map((f, _, files) =>
          FileInfoRefreshQueue.add(async () => {
            await this.refreshFile({ id: f.id });

            completedCount++;
            const isComplete = completedCount === totalCount;

            // if (isComplete) ipcRenderer.send("onFilesEdited", { fileIds: files.map((f) => f.id) });

            toast.update(toastId, {
              autoClose: isComplete ? 5000 : false,
              render: `Refreshed ${completedCount} files${isComplete ? "." : "..."}`,
            });
          })
        );
      })
    );
  });

  @modelFlow
  setFileRating = _async(function* (this: FileStore, { fileIds = [], rating }: SetFileRatingInput) {
    return yield* _await(
      handleErrors(async () => {
        if (!fileIds.length) return;
        await trpc.setFileRating.mutate({ fileIds, rating });
      })
    );
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getById(id: string) {
    return this.files.find((f) => f.id === id);
  }

  listByHash(hash: string) {
    return this.files.filter((f) => f.hash === hash);
  }

  listByIds(ids: string[]) {
    return this.files.filter((f) => ids.includes(f.id));
  }

  listByTagId(tagId: string) {
    return this.files.filter((f) => f.tagIds.includes(tagId));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get archived() {
    return this.files.filter((f) => f.isArchived);
  }

  @computed
  get displayed() {
    const displayedIds = this.filteredFileIds.slice(
      (this.page - 1) * CONSTANTS.FILE_COUNT,
      this.page * CONSTANTS.FILE_COUNT
    );

    return this.files.filter((f) => displayedIds.includes(f.id));
  }

  @computed
  get images() {
    return this.files.filter((f) => IMAGE_EXT_REG_EXP.test(f.ext));
  }

  @computed
  get pageCount() {
    return this.filteredFileIds.length < CONSTANTS.FILE_COUNT
      ? 1
      : Math.ceil(this.filteredFileIds.length / CONSTANTS.FILE_COUNT);
  }

  @computed
  get selected() {
    return this.files.filter((f) => this.selectedIds.includes(f.id));
  }

  @computed
  get videos() {
    return this.files.filter((f) => VIDEO_EXT_REG_EXP.test(f.ext));
  }
}
