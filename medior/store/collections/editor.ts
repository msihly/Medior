import autoBind from "auto-bind";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { SortMenuProps } from "medior/components";
import { File, FileSearch, Tag } from "medior/store";
import { asyncAction, toast } from "medior/utils/client";
import { getConfig, trpc } from "medior/utils/server";
import { FileCollection } from ".";

@model("medior/CollectionEditor")
export class CollectionEditor extends Model({
  collection: prop<FileCollection | null>(null).withSetter(),
  fileIndexes: prop<{ fileId: string; index: number }[]>(() => []).withSetter(),
  fileSearch: prop<FileSearch>(
    () => new FileSearch({ pageSize: getConfig().collection.editor.fileSearch.pageSize }),
  ),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  isSaving: prop<boolean>(false).withSetter(),
  search: prop<FileSearch>(
    () =>
      new FileSearch({
        pageSize: getConfig().collection.editor.search.pageSize,
        sortValue: getConfig().collection.editor.search.sort,
      }),
  ),
  tags: prop<Tag[]>(() => []).withSetter(),
  title: prop<string>("").withSetter(),
}) {
  private collectionLoadRevision = 0;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.collectionLoadRevision++;
    this.setIsLoading(false);
    this.search.cancelLoad();
    this.fileSearch.cancelLoad();
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    this.cancelLoad();
    this.isOpen = isOpen;

    if (!isOpen) this.setCollection(null);

    const config = getConfig().collection.editor;

    this.fileSearch.reset();
    this.fileSearch.setPageSize(config.fileSearch.pageSize);
    this.search.reset();
    this.search.setPageSize(config.search.pageSize);
    this.search.setSortValue(config.search.sort);
  }

  @modelAction
  updateFiles(fileIds: string[], updates: Partial<ModelCreationData<File>>) {
    const filesById = new Map(this.search.results.map((file) => [file.id, file]));

    fileIds.forEach((id) => filesById.get(id)?.update?.(updates));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  addFiles = asyncAction(async (ids: string[]) => {
    if (this.isLoading || !this.collection) return;

    const existingIds = new Set(this.search.ids);
    const fileIds = [...new Set(ids)].filter((id) => !existingIds.has(id));
    const addedIds = new Set(fileIds);

    if (!fileIds.length) return;

    const revision = ++this.collectionLoadRevision;

    this.setIsLoading(true);

    try {
      let orderedIds = [...fileIds, ...this.fileIndexes.map(({ fileId }) => fileId)];

      if (this.search.sortValue.key !== "custom") {
        const res = await trpc.listSortedFileIds.mutate({
          ids: orderedIds,
          sortValue: this.search.sortValue,
        });

        if (!res.success) throw new Error(res.error);

        if (revision !== this.collectionLoadRevision) return;

        orderedIds = res.data;
      }

      this.setFileIndexes(orderedIds.map((fileId, index) => ({ fileId, index })));
      this.search.setIds(orderedIds);
      this.fileSearch.setExcludedFileIds(orderedIds);

      if (this.fileSearch.cachedFilterProps)
        this.fileSearch.setCachedFilterProps({
          ...this.fileSearch.cachedFilterProps,
          excludedFileIds: [...orderedIds],
        });

      this.fileSearch.setHasChanges(true);
      this.setHasUnsavedChanges(true);
      this.fileSearch.removeFiles(fileIds);
      this.fileSearch.setSelectedIds(this.fileSearch.selectedIds.filter((id) => !addedIds.has(id)));

      const res = await this.search.loadFiltered({ noCache: true, page: this.search.page });

      if (!res.success) throw new Error(res.error);

      if (revision !== this.collectionLoadRevision) return;

      toast.success(`Added ${fileIds.length} files. Save the collection to keep these changes.`);
    } finally {
      if (revision === this.collectionLoadRevision) this.setIsLoading(false);
    }
  });

  @modelFlow
  addFilesToCollection = asyncAction(async (args: { collId: string; fileIds: string[] }) => {
    if (!this.isOpen) this.setIsOpen(true);

    this.setIsSaving(true);

    try {
      const res = await trpc.addFilesToCollection.mutate(args);

      if (!res.success) throw new Error(res.error);

      toast.success("Collection updated");
    } finally {
      this.setIsSaving(false);
    }

    const loaded = await this.loadCollection(args.collId);

    if (!loaded.success) throw new Error(loaded.error);

    if (!loaded.data) return false;

    const files = await this.fileSearch.loadFiltered();

    if (!files.success) throw new Error(files.error);

    return true;
  });

  @modelFlow
  loadCollection = asyncAction(async (id: string) => {
    this.cancelLoad();

    const revision = this.collectionLoadRevision;

    if (id !== this.collection?.id) {
      this.setCollection(null);
      this.setFileIndexes([]);
      this.setHasUnsavedChanges(false);
      this.setTags([]);
      this.setTitle("");
    }

    if (id === null) {
      this.search.reset();

      return false;
    }

    this.setIsLoading(true);
    this.search.setIds([]);
    this.search.setResults([]);

    try {
      const collRes = await trpc.listFileCollection.mutate({ args: { filter: { id } } });

      if (revision !== this.collectionLoadRevision) return false;

      if (!collRes.success) throw new Error(collRes.error);

      const collection = collRes.data.items[0];

      if (!collection) throw new Error("Collection no longer exists.");

      let fileIndexes: { fileId: string; index: number }[];

      if (this.search.sortValue.key === "custom") {
        fileIndexes = [...collection.fileIdIndexes]
          .sort((a, b) => (this.search.sortValue.isDesc ? b.index - a.index : a.index - b.index))
          .map((file, index) => ({ fileId: file.fileId, index }));
      } else {
        const indexesRes = await trpc.listSortedFileIds.mutate({
          ids: collection.fileIdIndexes.map((file) => file.fileId),
          sortValue: this.search.sortValue,
        });

        if (revision !== this.collectionLoadRevision) return false;

        if (!indexesRes.success) throw new Error(indexesRes.error);

        fileIndexes = indexesRes.data.map((fileId, index) => ({ fileId, index }));
      }

      const fileIds = [...new Set(fileIndexes.map((file) => file.fileId))];
      const tagsRes = await trpc.listTag.mutate({ filter: { id: collection.tagIds } });

      if (revision !== this.collectionLoadRevision) return false;

      if (!tagsRes.success) throw new Error(tagsRes.error);

      this.setCollection(new FileCollection(collection));
      this.setFileIndexes(fileIndexes);
      this.setTags(tagsRes.data.sort((a, b) => b.count - a.count).map((tag) => new Tag(tag)));
      this.setTitle(collection.title);
      this.search.setForcePages(true);
      this.search.setIds(fileIds);
      this.fileSearch.setExcludedFileIds(fileIds);

      if (!fileIds.length) this.search.setResults([]);
      else {
        const fileRes = await this.search.loadFiltered({
          noCache: true,
          page: 1,
          withFullCount: true,
        });

        if (revision !== this.collectionLoadRevision) return false;

        if (!fileRes.success) throw new Error(fileRes.error);
      }

      this.setHasUnsavedChanges(false);

      return true;
    } catch (error) {
      if (revision === this.collectionLoadRevision) throw error;

      return false;
    } finally {
      if (revision === this.collectionLoadRevision) this.setIsLoading(false);
    }
  });

  @modelFlow
  loadMergePreview = asyncAction(async (collection: ModelCreationData<FileCollection>) => {
    this.setIsOpen(false);

    const revision = ++this.collectionLoadRevision;

    this.setIsLoading(true);

    try {
      this.setCollection(new FileCollection(collection));
      this.setFileIndexes(
        [...collection.fileIdIndexes]
          .sort((a, b) => a.index - b.index)
          .map(({ fileId }, index) => ({ fileId, index })),
      );

      this.setTitle(collection.title);
      this.search.setForcePages(true);
      this.search.setIds(this.fileIndexes.map(({ fileId }) => fileId));
      this.search.setSortValue({ isDesc: false, key: "custom" });

      const tagsRes = await trpc.listTag.mutate({ filter: { id: collection.tagIds } });

      if (revision !== this.collectionLoadRevision) return;

      if (!tagsRes.success) throw new Error(tagsRes.error);

      this.setTags(tagsRes.data.sort((a, b) => b.count - a.count).map((tag) => new Tag(tag)));

      const fileRes = await this.search.loadFiltered({
        noCache: true,
        page: 1,
        withFullCount: true,
      });

      if (revision !== this.collectionLoadRevision) return;

      if (!fileRes.success) throw new Error(fileRes.error);

      this.setHasUnsavedChanges(false);
    } finally {
      if (revision === this.collectionLoadRevision) this.setIsLoading(false);
    }
  });

  @modelFlow
  moveFileIndexes = asyncAction(
    async ({ down, maxDelta }: { down: boolean; maxDelta?: number }) => {
      const delta = maxDelta ?? 1;

      if (!Number.isSafeInteger(delta) || delta < 1)
        throw new Error("Enter a positive whole number for the move distance.");

      const revision = ++this.collectionLoadRevision;

      this.setIsLoading(true);

      try {
        const fileIndexes = Array<{ fileId: string; index: number }>(this.fileIndexes.length);
        const selectedIds = new Set(this.search.selectedIds);
        const selectedFiles = this.fileIndexes
          .map((file, index) => ({ file, index }))
          .filter(({ file }) => selectedIds.has(file.fileId));

        let boundary = down ? fileIndexes.length : -1;

        if (down) selectedFiles.reverse();

        for (const { file, index } of selectedFiles) {
          const toIndex = down
            ? Math.min(index + delta, boundary - 1)
            : Math.max(index - delta, boundary + 1);

          fileIndexes[toIndex] = file;
          boundary = toIndex;
        }

        let nextIndex = 0;

        for (const file of this.fileIndexes) {
          if (selectedIds.has(file.fileId)) continue;

          while (fileIndexes[nextIndex]) nextIndex++;

          fileIndexes[nextIndex++] = file;
        }

        if (fileIndexes.some((file, index) => file.fileId !== this.fileIndexes[index].fileId)) {
          this.setFileIndexes(fileIndexes.map((file, index) => ({ ...file, index })));
          this.search.setIds(fileIndexes.map(({ fileId }) => fileId));
          this.setHasUnsavedChanges(true);

          const pageRes = await this.search.loadFiltered();

          if (revision === this.collectionLoadRevision && !pageRes.success)
            throw new Error(pageRes.error);
        }
      } finally {
        if (revision === this.collectionLoadRevision) this.setIsLoading(false);
      }
    },
  );

  @modelFlow
  removeFiles = asyncAction(async (ids: string[]) => {
    const removedIds = new Set(ids);

    this.setIsSaving(true);

    try {
      const res = await trpc.updateCollection.mutate({
        fileIdIndexes: this.fileIndexes
          .filter((f) => !removedIds.has(f.fileId))
          .map((f, i) => ({ fileId: f.fileId, index: i })),
        id: this.collection.id,
      });

      if (!res.success) throw new Error(res.error);

      await this.loadCollection(this.collection.id);
      toast.success("Files removed from collection");
    } finally {
      this.setIsSaving(false);
    }
  });

  @modelFlow
  saveCollection = asyncAction(async () => {
    this.setIsSaving(true);

    try {
      const res = await trpc.updateCollection.mutate({
        fileIdIndexes: this.fileIndexes.map((f, i) => ({ ...f, index: i })),
        id: this.collection.id,
        title: this.title,
      });

      if (!res.success) throw new Error(res.error);

      this.setHasUnsavedChanges(false);
      await this.loadCollection(this.collection.id);
      toast.success("Collection saved");
    } finally {
      this.setIsSaving(false);
    }
  });

  @modelFlow
  setSortValue = asyncAction(async (sortValue: SortMenuProps["value"]) => {
    const revision = ++this.collectionLoadRevision;

    this.setIsLoading(true);

    try {
      if (sortValue.key === "custom") {
        const originalIds = new Set(this.collection.fileIdIndexes.map(({ fileId }) => fileId));
        const files = [
          ...this.fileIndexes.filter(({ fileId }) => !originalIds.has(fileId)),
          ...[...this.collection.fileIdIndexes].sort((a, b) => a.index - b.index),
        ];

        if (sortValue.isDesc) files.reverse();

        const fileIdIndexes = files.map(({ fileId }, index) => ({ fileId, index }));

        this.setFileIndexes(fileIdIndexes);
        this.search.setIds(fileIdIndexes.map((f) => f.fileId));
      } else {
        const indexesRes = await trpc.listSortedFileIds.mutate({ ids: this.search.ids, sortValue });

        if (revision !== this.collectionLoadRevision) return;

        if (!indexesRes.success) throw new Error(indexesRes.error);

        this.setFileIndexes(indexesRes.data.map((fileId, index) => ({ fileId, index })));
        this.search.setIds(indexesRes.data);
      }

      this.search.setSortValue(sortValue);
      this.setHasUnsavedChanges(true);

      const pageRes = await this.search.loadFiltered({ noCache: true });

      if (revision !== this.collectionLoadRevision) return;

      if (!pageRes.success) throw new Error(pageRes.error);
    } finally {
      if (revision === this.collectionLoadRevision) this.setIsLoading(false);
    }
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFileById(id: string) {
    return this.search.results.find((f) => f.id === id);
  }

  getIndexById(id: string) {
    return this.fileIndexes.find((f) => f.fileId === id)?.index;
  }

  getOriginalIndex(id: string) {
    return this.collection?.fileIdIndexes.find((f) => f.fileId === id)?.index;
  }

  getFileIdsForCarousel() {
    return this.fileIndexes.map((f) => f.fileId);
  }
}
