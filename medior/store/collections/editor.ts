import { computed } from "mobx";
import {
  getRootStore,
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { asyncAction, File, FileSearch, RootStore } from "medior/store";
import { SortMenuProps } from "medior/components";
import { FileCollection } from ".";
import { getConfig, trpc } from "medior/utils";
import { toast } from "react-toastify";

@model("medior/CollectionEditor")
export class CollectionEditor extends Model({
  collection: prop<FileCollection | null>(null).withSetter(),
  fileIndexes: prop<{ fileId: string; index: number }[]>(() => []).withSetter(),
  fileSearch: prop<FileSearch>(
    () => new FileSearch({ pageSize: getConfig().collection.editor.fileSearch.pageSize })
  ),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  search: prop<FileSearch>(
    () =>
      new FileSearch({
        pageSize: getConfig().collection.editor.search.pageSize,
        sortValue: getConfig().collection.editor.search.sort,
      })
  ),
  title: prop<string>("").withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFilesToCollection(files: File[]) {
    // TODO: Adjust this to add files to the end of the collection and navigate to the last page
    const startIndex = this.search.results.length;
    // this.search.results.push(...files);
    this.fileSearch.excludedFileIds.push(...files.map((f) => f.id));
    this.fileIndexes.push(
      ...files.map((file, idx) => ({ fileId: file.id, index: startIndex + idx }))
    );
    this.search.ids.push(...files.map((f) => f.id));
    this.setHasUnsavedChanges(true);
    this.fileSearch.loadFiltered();
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    this.search.selectedIds = [];
    this.isOpen = isOpen;
  }

  @modelAction
  updateFiles(fileIds: string[], updates: Partial<ModelCreationData<File>>) {
    fileIds.forEach((id) => this.getFileById(id)?.update?.(updates));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  confirmDelete = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    const res = await stores.collection.deleteCollections([this.collection.id]);
    if (!res.success) throw new Error("Failed to delete collection");
    else {
      this.setCollection(null);
      this.setIsOpen(false);
      toast.success("Collection deleted");
    }
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

    const collRes = await trpc.listFileCollections.mutate({ args: { filter: { id } } });
    if (!collRes.success) throw new Error(collRes.error);

    const collection = collRes.data.items[0];
    this.setCollection(new FileCollection(collection));
    const fileIndexes = collection.fileIdIndexes.sort((a, b) => a.index - b.index);
    this.setFileIndexes(fileIndexes);
    this.setTitle(collection.title);

    const fileIds = [...new Set(fileIndexes.map((f) => f.fileId))];
    this.fileSearch.setExcludedFileIds(fileIds);
    this.search.setIds(fileIds);
    this.search.setForcePages(true);

    if (!fileIds?.length) this.search.setResults([]);
    else {
      const fileRes = await this.search.loadFiltered();
      if (!fileRes.success) throw new Error(fileRes.error);
    }

    this.setIsLoading(false);
    this.setHasUnsavedChanges(false);
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
        isDown: boolean
      ) => {
        const newFileIndexes = fileIndexes.map((f) => ({ fileId: f.fileId, index: f.index }));

        const sortedSelected = [...selectedIds].sort(
          (a, b) =>
            (isDown ? -1 : 1) *
            (newFileIndexes.findIndex((f) => f.fileId === a) -
              newFileIndexes.findIndex((f) => f.fileId === b))
        );

        sortedSelected.forEach((id) => {
          const fromIndex = newFileIndexes.findIndex((f) => f.fileId === id);
          if (fromIndex === -1) return;

          const toIndex = Math.max(
            0,
            Math.min(fromIndex + (isDown ? maxDelta : -maxDelta), newFileIndexes.length)
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
    }
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
    this.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
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

    // TODO: set fileIndexes on file reorder or insert / delete
    this.setIsLoading(true);

    if (sortValue.key === "custom") {
      const fileIdIndexes = this.collection.fileIdIndexes
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

    const pageRes = await this.search.loadFiltered();
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

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get allTagIds() {
    return [...new Set(this.search.results.flatMap((f) => f.tagIds ?? []))];
  }

  @computed
  get sortedTags() {
    const stores = getRootStore<RootStore>(this);
    return stores.tag.listByIds(this.allTagIds).sort((a, b) => b.count - a.count);
  }
}
