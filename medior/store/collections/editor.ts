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
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  setIsOpen(isOpen: boolean) {
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
    fileIds.forEach((id) => this.getFileById(id)?.update?.(updates));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  addFiles = asyncAction(async (ids: string[]) => {
    if (this.isLoading || !this.collection) return;
    const fileIds = [...new Set(ids)].filter((id) => !this.search.ids.includes(id));
    if (!fileIds.length) return;
    this.setIsLoading(true);
    try {
      let orderedIds = [...fileIds, ...this.fileIndexes.map(({ fileId }) => fileId)];
      if (this.search.sortValue.key !== "custom") {
        const res = await trpc.listSortedFileIds.mutate({
          ids: orderedIds,
          sortValue: this.search.sortValue,
        });
        if (!res.success) throw new Error(res.error);
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
      this.fileSearch.setSelectedIds(
        this.fileSearch.selectedIds.filter((id) => !fileIds.includes(id)),
      );
      const res = await this.search.loadFiltered({ noCache: true, page: this.search.page });
      if (!res.success) throw new Error(res.error);
      toast.success(`Added ${fileIds.length} files. Save the collection to keep these changes.`);
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  addFilesToCollection = asyncAction(async (args: { collId: string; fileIds: string[] }) => {
    if (!this.isOpen) this.setIsOpen(true);
    this.setIsLoading(true);
    const res = await trpc.addFilesToCollection.mutate(args);
    if (!res.success) throw new Error(res.error);
    await this.loadCollection(args.collId);
    await this.fileSearch.loadFiltered();
    this.setIsLoading(false);
    toast.success("Collection updated");
  });

  @modelFlow
  loadCollection = asyncAction(async (id: string) => {
    if (id === null) {
      this.setCollection(null);
      this.setFileIndexes([]);
      this.setHasUnsavedChanges(false);
      this.search.reset();
      return;
    } else this.setIsLoading(true);

    const collRes = await trpc.listFileCollection.mutate({ args: { filter: { id } } });
    if (!collRes.success) throw new Error(collRes.error);

    const collection = collRes.data.items[0];
    this.setCollection(new FileCollection(collection));
    this.setTitle(collection.title);

    if (this.search.sortValue.key === "custom") {
      this.setFileIndexes(
        collection.fileIdIndexes
          .sort((a, b) => (this.search.sortValue.isDesc ? b.index - a.index : a.index - b.index))
          .map((f, i) => ({ fileId: f.fileId, index: i })),
      );
    } else {
      const indexesRes = await trpc.listSortedFileIds.mutate({
        ids: collection.fileIdIndexes.map((f) => f.fileId),
        sortValue: this.search.sortValue,
      });
      if (!indexesRes.success) throw new Error(indexesRes.error);

      this.setFileIndexes(indexesRes.data.map((fileId, index) => ({ fileId, index })));
    }

    const fileIds = [...new Set(this.fileIndexes.map((f) => f.fileId))];
    this.search.setIds(fileIds);
    this.fileSearch.setExcludedFileIds(fileIds);

    const tagsRes = await trpc.listTag.mutate({ filter: { id: collection.tagIds } });
    if (!tagsRes.success) throw new Error(tagsRes.error);
    const tags = tagsRes.data.sort((a, b) => b.count - a.count).map((t) => new Tag(t));
    this.setTags(tags);

    this.search.setForcePages(true);

    if (!fileIds?.length) this.search.setResults([]);
    else {
      const fileRes = await this.search.loadFiltered({
        noCache: true,
        page: 1,
        withFullCount: true,
      });
      if (!fileRes.success) throw new Error(fileRes.error);

      const firstPageRes = await this.search.loadFiltered({ page: 1 });
      if (!firstPageRes.success) throw new Error(firstPageRes.error);
    }

    this.setIsLoading(false);
    this.setHasUnsavedChanges(false);
  });

  @modelFlow
  loadMergePreview = asyncAction(async (collection: ModelCreationData<FileCollection>) => {
    this.setIsOpen(false);
    this.setIsLoading(true);
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
    if (!tagsRes.success) throw new Error(tagsRes.error);
    this.setTags(tagsRes.data.sort((a, b) => b.count - a.count).map((tag) => new Tag(tag)));

    const fileRes = await this.search.loadFiltered({ noCache: true, page: 1, withFullCount: true });
    if (!fileRes.success) throw new Error(fileRes.error);
    const firstPageRes = await this.search.loadFiltered({ page: 1 });
    if (!firstPageRes.success) throw new Error(firstPageRes.error);

    this.setHasUnsavedChanges(false);
    this.setIsLoading(false);
  });

  @modelFlow
  moveFileIndexes = asyncAction(
    async ({ down, maxDelta = 1 }: { down: boolean; maxDelta?: number }) => {
      this.setIsLoading(true);

      const moveArrayElements = <T>(arr: T[], from: number, to: number) => {
        if (to >= arr.length) to = arr.length - 1;
        if (to < 0) to = 0;

        const [element] = arr.splice(from, 1);
        arr.splice(to, 0, element);
      };

      const moveIndexes = (
        fileIndexes: { fileId: string; index: number }[],
        selectedIds: string[],
        isDown: boolean,
      ) => {
        const newFileIndexes = fileIndexes.map((f) => ({ fileId: f.fileId, index: f.index }));

        const sortedSelected = [...selectedIds].sort(
          (a, b) =>
            (isDown ? -1 : 1) *
            (newFileIndexes.findIndex((f) => f.fileId === a) -
              newFileIndexes.findIndex((f) => f.fileId === b)),
        );

        sortedSelected.forEach((id) => {
          const fromIndex = newFileIndexes.findIndex((f) => f.fileId === id);
          if (fromIndex === -1) return;

          const toIndex = Math.max(
            0,
            Math.min(fromIndex + (isDown ? maxDelta : -maxDelta), newFileIndexes.length),
          );

          if (toIndex >= 0 && toIndex < newFileIndexes.length) {
            moveArrayElements(newFileIndexes, fromIndex, toIndex);
          }
        });

        return newFileIndexes.map((f, i) => ({ ...f, index: i }));
      };

      const newFileIndexes = moveIndexes(this.fileIndexes, this.search.selectedIds, down);
      const newFileIds = newFileIndexes.map((f) => f.fileId);

      this.setFileIndexes(newFileIndexes);
      this.search.setIds(newFileIds);

      const pageRes = await this.search.loadFiltered();
      if (!pageRes.success) throw new Error(pageRes.error);

      this.setHasUnsavedChanges(true);
      this.setIsLoading(false);
    },
  );

  @modelFlow
  removeFiles = asyncAction(async (ids: string[]) => {
    this.setIsLoading(true);
    const res = await trpc.updateCollection.mutate({
      fileIdIndexes: this.fileIndexes
        .filter((f) => !ids.includes(f.fileId))
        .map((f, i) => ({ fileId: f.fileId, index: i })),
      id: this.collection.id,
    });
    if (!res.success) {
      this.setIsLoading(false);
      throw new Error(res.error);
    }
    await this.loadCollection(this.collection.id);
    toast.success("Files removed from collection");
  });

  @modelFlow
  saveCollection = asyncAction(async () => {
    this.setIsLoading(true);
    const res = await trpc.updateCollection.mutate({
      id: this.collection.id,
      fileIdIndexes: this.fileIndexes.map((f, i) => ({ ...f, index: i })),
      title: this.title,
    });
    if (!res.success) {
      this.setIsLoading(false);
      throw new Error(res.error);
    }

    this.setHasUnsavedChanges(false);
    await this.loadCollection(this.collection.id);
    this.setIsLoading(false);
    toast.success("Collection saved");
  });

  @modelFlow
  setSortValue = asyncAction(async (sortValue: SortMenuProps["value"]) => {
    this.search.setSortValue(sortValue);

    this.setIsLoading(true);
    if (sortValue.key === "custom") {
      const fileIdIndexes = [
        ...this.fileIndexes.filter(
          (file) => !this.collection.fileIdIndexes.some(({ fileId }) => fileId === file.fileId),
        ),
        ...[...this.collection.fileIdIndexes].sort((a, b) => a.index - b.index),
      ]
        .map(({ fileId }, index) => ({ fileId, index }))
        .sort((a, b) => (sortValue.isDesc ? b.index - a.index : a.index - b.index))
        .map((f, i) => ({ fileId: f.fileId, index: i }));
      this.setFileIndexes(fileIdIndexes);
      this.search.setIds(fileIdIndexes.map((f) => f.fileId));
    } else {
      const indexesRes = await trpc.listSortedFileIds.mutate({ ids: this.search.ids, sortValue });
      if (!indexesRes.success) throw new Error(indexesRes.error);
      this.setFileIndexes(indexesRes.data.map((fileId, index) => ({ fileId, index })));
      this.search.setIds(indexesRes.data);
    }

    const pageRes = await this.search.loadFiltered({ noCache: true });
    if (!pageRes.success) throw new Error(pageRes.error);

    this.setIsLoading(false);
    this.setHasUnsavedChanges(true);
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
