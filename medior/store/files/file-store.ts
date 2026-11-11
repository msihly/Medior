import autoBind from "auto-bind";
import { observable } from "mobx";
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
import { FaceModel, RootStore, tagToOption } from "medior/store";
import { asyncAction, toast, toastJobResult } from "medior/utils/client";
import { chunkArray, FileTranslationSource, Fmt } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import {
  File,
  FileExporterStore,
  FileSearch,
  FileSimilarityStore,
  FileTagsEditorStore,
  FileTranslationStore,
  LowerResolutionStore,
  VideoTransformerStore,
  VideoTransformRequest,
} from ".";

@model("medior/FileStore")
export class FileStore extends ExtendedModel(_FileStore, {
  /** The server job deleting or unarchiving files started here. */
  actionJobId: prop<string>(null).withSetter(),
  activeFileId: prop<string | null>(null).withSetter(),
  archivedFileIds: prop<string[]>(() => []).withSetter(),
  exporter: prop<FileExporterStore>(() => new FileExporterStore({})),
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  isActionMinimized: prop<boolean>(false).withSetter(),
  /** The files chosen for deletion are being checked before anything changes. */
  isActionPreparing: prop<boolean>(false).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  isInfoModalOpen: prop<boolean>(false).withSetter(),
  isRefreshMinimized: prop<boolean>(false).withSetter(),
  isRefreshOpen: prop<boolean>(false).withSetter(),
  lowerResolution: prop<LowerResolutionStore>(() => new LowerResolutionStore({})),
  /** The server job refreshing files that this window follows. */
  refreshJobId: prop<string>(null).withSetter(),
  /** The search tab the Files view shows. */
  searchIndex: prop<number>(0).withSetter(),
  /** The Files view's searches, each in its own tab, the first of which is always kept. */
  searchTabs: prop<FileSearch[]>(() => [new FileSearch({})]),
  similarity: prop<FileSimilarityStore>(() => new FileSimilarityStore({})),
  tagsEditor: prop<FileTagsEditorStore>(() => new FileTagsEditorStore({})),
  translation: prop<FileTranslationStore>(() => new FileTranslationStore({})),
  /** The search the Collection Triager's carousel loads its files into while it's open. */
  triageSearch: prop<FileSearch>(null).withSetter(),
  videoTransformer: prop<VideoTransformerStore>(() => new VideoTransformerStore({})),
}) {
  private actionAbortController: AbortController = null;
  /** The files sent to the action job, in the order it processes them. */
  private actionFileIds: string[] = [];
  /**
   * Files an operation is changing, by the operation's label, which can't be edited until done.
   * Kept apart from the store's snapshots so locking the whole library stays cheap to update.
   */
  private fileLocks = observable.map<string, string>();
  private releaseWaiters = new Map<string, (() => void)[]>();

  onInit() {
    autoBind(this);
  }

  private followAction(jobId: string) {
    const stores = getRootStore<RootStore>(this);

    stores.home.followJob(jobId, this.finishAction, () => this.setActionJobId(jobId));
  }

  private followRefresh(jobId: string) {
    const stores = getRootStore<RootStore>(this);

    stores.home.followJob(jobId, this.finishRefresh, () => this.setRefreshJobId(jobId));
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFileAfterIndex(file: ModelCreationData<File>, index: number) {
    this.search.results.splice(index + 1, 0, new File(file));
  }

  /** Adds a search tab after the others and shows it. */
  @modelAction
  addSearchTab() {
    const search = new FileSearch({});

    this.searchTabs.push(search);
    this.searchIndex = this.searchTabs.length - 1;

    return search;
  }

  cancelActionPreparation() {
    this.actionAbortController?.abort();
  }

  /** Closes a search tab after the first. Closing the shown tab shows the one before it. */
  @modelAction
  closeSearchTab(index: number) {
    if (index === 0) return;

    this.searchTabs[index].cancelLoad();
    this.searchTabs.splice(index, 1);

    if (this.searchIndex >= index) this.searchIndex--;
  }

  /** Sends files to the Media Transformer, which creates their transforms once it shows. */
  @modelAction
  openVideoTransformer({
    fileIds,
    fnType,
    sortValue,
    spliceMode = "replace",
    timestampPairs = [],
  }: VideoTransformRequest) {
    const stores = getRootStore<RootStore>(this);

    if (sortValue && this.shownSearch.ids.length) {
      const selectedIds = new Set(fileIds);

      fileIds = this.shownSearch.ids.filter((id) => selectedIds.has(id));
      sortValue = null;
    }

    this.videoTransformer.setFileIds(fileIds);
    this.videoTransformer.setFnType(fnType);
    this.videoTransformer.setQueueType(fnType);
    this.videoTransformer.setSourceSortValue(sortValue ? { ...sortValue } : null);
    this.videoTransformer.setSpliceMode(spliceMode);
    this.videoTransformer.setTimestampPairs(timestampPairs);

    stores.home.openView("transformer");
  }

  @modelAction
  updateArchivedFileIds(fileIds: string[], isArchived: boolean) {
    const updatedIds = new Set(fileIds);

    this.setArchivedFileIds(
      isArchived
        ? [...new Set([...this.archivedFileIds, ...fileIds])]
        : this.archivedFileIds.filter((id) => !updatedIds.has(id)),
    );
  }

  @modelAction
  setFileLocks(locks: { fileIds: string[]; label: string }[]) {
    this.fileLocks.replace(
      locks.flatMap(({ fileIds, label }) =>
        fileIds.map((fileId): [string, string] => [fileId, label]),
      ),
    );
  }

  /** Locks files for the labeled operation, or releases them without a label. */
  @modelAction
  updateFileLocks({ fileIds, label }: { fileIds: string[]; label: string | null }) {
    for (const fileId of fileIds) {
      if (label) this.fileLocks.set(fileId, label);
      else {
        this.fileLocks.delete(fileId);
        this.releaseWaiters.get(fileId)?.forEach((resolve) => resolve());
        this.releaseWaiters.delete(fileId);
      }
    }
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
    for (const search of this.searches)
      search.updateFileTags({ addedTagIds, fileIds, removedTagIds });

    this.similarity.search.updateFileTags({ addedTagIds, fileIds, removedTagIds });
  }

  @modelAction
  updateFiles(
    fileIds: string[],
    updates: Partial<
      Omit<ModelCreationData<File>, "faceModels"> & { faceModels?: ModelCreationData<FaceModel>[] }
    >,
  ) {
    for (const search of this.searches)
      fileIds.forEach((id) => search.getResult(id)?.update(updates));
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
      ...stores.mediaProgram.editor.search.results,
      ...stores.mediaProgram.manager.search.files.values(),
      ...stores.mediaProgram.rankings.search.files.values(),
      ...stores.music.editor.search.results,
      ...stores.music.manager.albums.files.values(),
      ...stores.music.manager.artists.files.values(),
      ...stores.music.manager.playlists.files.values(),
      ...stores.music.manager.tracks.results,
    ];

    this.updateFiles(fileIds, updates);
    stores.collection.editor.updateFiles(fileIds, updates);

    for (const file of files) {
      if (updatedIds.has(file.id)) file.update(updates);
    }
  }

  /** Resolves once a job has finished with a file, which it releases then, or has ended. */
  async waitForFileRelease(fileId: string, jobId: string) {
    const stores = getRootStore<RootStore>(this);

    let onRelease: () => void;
    const release = new Promise<void>((resolve) => {
      onRelease = resolve;
      this.releaseWaiters.set(fileId, [...(this.releaseWaiters.get(fileId) ?? []), resolve]);
    });

    await Promise.race([release, stores.home.waitForJob(jobId)]);

    // A job that ended first leaves no waiter behind.
    const waiters = this.releaseWaiters.get(fileId)?.filter((resolve) => resolve !== onRelease);

    if (waiters?.length) this.releaseWaiters.set(fileId, waiters);
    else this.releaseWaiters.delete(fileId);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  archiveFiles = asyncAction(async (ids: string[]) => {
    const res = await rpc.setFileIsArchived({ fileIds: ids, isArchived: true });

    if (!res.success) throw new Error(`Error archiving files: ${res.error}`);

    this.updateArchivedFileIds(ids, true);
    toast.warn(`${ids.length} files archived`);
  });

  @modelFlow
  confirmDeleteArchivedFiles = asyncAction(async () => {
    if (!this.hasArchivedFiles) return;

    this.shownSearch.setSelectedIds([...this.archivedFileIds]);
    this.setIdsForConfirmDelete([...this.archivedFileIds]);
    this.setIsConfirmDeleteOpen(true);
  });

  @modelFlow
  confirmDeleteFiles = asyncAction(async (ids: string[]) => {
    if (this.isActionRunning || !ids.length) return;

    const abortController = new AbortController();

    this.actionAbortController = abortController;
    this.setIdsForConfirmDelete([...ids]);
    this.setIsActionMinimized(false);
    this.setIsActionPreparing(true);

    try {
      const res = await rpc.listFile(
        { args: { filter: { id: ids } } },
        { signal: abortController.signal },
      );

      if (abortController.signal.aborted) return;

      if (!res.success) throw new Error(res.error);

      if (res.data.items.some((file) => file.isArchived)) this.setIsConfirmDeleteOpen(true);
      else {
        const deleted = await this.deleteFiles(abortController.signal);
        if (!deleted.success) throw new Error(deleted.error);
      }
    } catch (error) {
      if (!abortController.signal.aborted) toast.error(error);
    } finally {
      this.actionAbortController = null;
      this.setIsActionPreparing(false);
    }
  });

  /**
   * Archives the chosen files still in the library and deletes those already archived. A deletion
   * cancelled while it was starting is stopped as soon as it has started.
   */
  @modelFlow
  deleteFiles = asyncAction(async (signal?: AbortSignal) => {
    const stores = getRootStore<RootStore>(this);

    const fileIds = [...this.idsForConfirmDelete];
    if (!fileIds.length) throw new Error("No files to delete");

    this.setIsActionPreparing(true);

    try {
      const res = await rpc.startFileDeletion({ fileIds });
      if (!res.success) throw new Error(res.error);

      this.actionFileIds = fileIds;
      this.followAction(res.data);

      if (signal?.aborted) await stores.home.stopJob(res.data);
    } finally {
      this.setIsActionPreparing(false);
    }
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
        const res = await rpc.editFileTags({
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
    const res = await rpc.listAllArchivedFileIds();

    if (!res.success) throw new Error(res.error);

    this.setArchivedFileIds(res.data);
  });

  @modelFlow
  loadFileLocks = asyncAction(async () => {
    const res = await rpc.listFileLocks();
    if (!res.success) throw new Error(res.error);

    this.setFileLocks(res.data);
  });

  /** Opens a search tab in the Files view, searching the given tags. */
  @modelFlow
  openSearchTab = asyncAction(async ({ tagIds = [] }: { tagIds?: string[] } = {}) => {
    const stores = getRootStore<RootStore>(this);

    const search = this.addSearchTab();
    stores.home.openView("files");

    if (tagIds.length) {
      const tagRes = await rpc.listTag({ filter: { id: tagIds } });
      if (!tagRes.success) throw new Error(tagRes.error);

      // A tab closed while its tags loaded is left alone.
      if (!this.searchTabs.includes(search)) return;

      search.setTags(tagRes.data.map(tagToOption));
    }

    const res = await search.loadFiltered({ noCache: true, page: 1 });
    if (!res.success) throw new Error(res.error);
  });

  /**
   * Starts refreshing files on the server, or adds them to the refresh already running. Returns
   * the refresh's job ID, or nothing when it couldn't start.
   */
  @modelFlow
  refreshFiles = asyncAction(async (args: { ids: string[] }) => {
    if (!args.ids.length) return null;

    try {
      const res = await rpc.startFileRefresh({ fileIds: args.ids });
      if (!res.success) throw new Error(res.error);

      this.setIsRefreshMinimized(false);
      this.setIsRefreshOpen(true);
      this.followRefresh(res.data);

      return res.data;
    } catch (error) {
      toast.error(error);

      return null;
    }
  });

  /** Stops the running refresh, as saving settings that restart its services does. */
  @modelFlow
  stopFileRefresh = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);

    const job = stores.home.getJob("refreshFiles");

    if (job) await stores.home.stopJob(job.id);
  });

  @modelFlow
  setFileRating = asyncAction(async ({ fileIds = [], rating }: db.SetFileRatingInput) => {
    if (!fileIds.length) return;

    const res = await rpc.setFileRating({ fileIds, rating });

    if (res.success) toast.success(`Rating updated to ${rating}`);
    else {
      console.error("Error updating rating:", res.error);
      toast.error("Error updating rating");
    }
  });

  /**
   * Starts translating files on the server, followed from the corner, or adds them to the
   * translation already running. `force` replaces stored translations rather than reusing them.
   * Returns the translation's job ID, or nothing when it couldn't start.
   */
  @modelFlow
  translateFiles = asyncAction(
    async (args: { force?: boolean; ids: string[]; sources?: FileTranslationSource[] }) => {
      const stores = getRootStore<RootStore>(this);

      if (!args.ids.length) return null;

      try {
        const res = await rpc.startFileTranslation({
          fileIds: args.ids,
          force: args.force,
          sources: args.sources,
        });
        if (!res.success) throw new Error(res.error);

        stores.home.followJob(res.data, toastJobResult);

        return res.data;
      } catch (error) {
        toast.error(error);

        return null;
      }
    },
  );

  @modelFlow
  unarchiveFiles = asyncAction(async ({ fileIds }: { fileIds: string[] }) => {
    if (!fileIds?.length || this.isActionRunning) return;

    this.setIsActionMinimized(false);
    this.setIsActionPreparing(true);

    try {
      const res = await rpc.startFileUnarchive({ fileIds });
      if (!res.success) throw new Error(res.error);

      this.actionFileIds = fileIds;
      this.followAction(res.data);
    } catch (error) {
      toast.error(error);
    } finally {
      this.setIsActionPreparing(false);
    }
  });

  /**
   * Takes in a deletion or unarchiving job's results once it ends. Unarchiving goes through its
   * files in order, so the processed count covers the first.
   */
  @modelFlow
  private finishAction = asyncAction(async (job: db.JobState) => {
    const processedIds =
      job.type === "unarchiveFiles"
        ? this.actionFileIds.slice(0, job.processed)
        : job.processed === job.total
          ? this.actionFileIds
          : [];

    if (this.actionJobId === job.id) this.setActionJobId(null);

    this.actionFileIds = [];
    this.setIsActionMinimized(false);

    for (const search of this.searches)
      search.toggleSelected(processedIds.map((id) => ({ id, isSelected: false })));

    if (job.error) toast.error(job.error);

    if (job.type === "unarchiveFiles") {
      for (const search of this.searches) search.removeFiles(processedIds);

      toast.info(`${Fmt.commas(job.processed)} files unarchived`);
    } else {
      this.setIdsForConfirmDelete([]);
      this.setIsConfirmDeleteOpen(false);

      if (job.message) toast.warn(job.message);
    }
  });

  /** Refreshed files were updated in place as each finished, so only the result is reported. */
  @modelFlow
  private finishRefresh = asyncAction(async (job: db.JobState) => {
    const failedCount = job.failures.reduce((count, failure) => count + failure.count, 0);
    const refreshedCount = job.processed - failedCount;

    if (this.refreshJobId === job.id) this.setRefreshJobId(null);

    this.setIsRefreshMinimized(false);
    this.setIsRefreshOpen(false);

    if (job.error) toast.error(job.error);
    else if (job.isStopping)
      toast.info(`File refresh stopped after ${Fmt.commas(refreshedCount)} files.`);
    else if (failedCount)
      toast.warn(`Refreshed ${Fmt.commas(refreshedCount)} / ${Fmt.commas(job.total)} files.`);
    else toast.success(`Refreshed ${Fmt.commas(refreshedCount)} files.`);
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  get actionJob() {
    return getRootStore<RootStore>(this).home.getJobById(this.actionJobId);
  }

  get hasArchivedFiles() {
    return this.archivedFileIds.length > 0;
  }

  get isActionRunning() {
    return this.isActionPreparing || !!this.actionJobId;
  }

  get refreshJob() {
    return getRootStore<RootStore>(this).home.getJobById(this.refreshJobId);
  }

  /**
   * The search the carousel loads its files into: the Collection Triager's while it's open, or
   * else the shown tab's.
   */
  get search() {
    return this.triageSearch ?? this.shownSearch;
  }

  /** Every search files are loaded into, including the triager's while it's open. */
  get searches() {
    return this.triageSearch ? [...this.searchTabs, this.triageSearch] : this.searchTabs;
  }

  /** The search of the tab the Files view shows. */
  get shownSearch() {
    return this.searchTabs[this.searchIndex];
  }

  getById(id: string) {
    return this.search.getResult(id);
  }

  /** The label of the operation locking a file, if any. */
  getFileLock(fileId: string) {
    return this.fileLocks.get(fileId);
  }
}
