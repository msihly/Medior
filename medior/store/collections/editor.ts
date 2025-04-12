import {
  getRootStore,
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { SortMenuProps } from "medior/components";
import { asyncAction, File, FileSearch, RootStore, Tag } from "medior/store";
import { getConfig, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
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
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
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

    const collRes = await trpc.listFileCollection.mutate({ args: { filter: { id } } });
    if (!collRes.success) throw new Error(collRes.error);

    const collection = collRes.data.items[0];
    this.setCollection(new FileCollection(collection));
    this.setTitle(collection.title);

    const fileIndexes = collection.fileIdIndexes.sort((a, b) => a.index - b.index);
    this.setFileIndexes(fileIndexes);

    const tagsRes = await trpc.listTag.mutate({ args: { filter: { id: collection.tagIds } } });
    if (!tagsRes.success) throw new Error(tagsRes.error);
    const tags = tagsRes.data.items.sort((a, b) => b.count - a.count).map((t) => new Tag(t));
    this.setTags(tags);

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
}
