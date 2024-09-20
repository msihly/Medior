import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { asyncAction, File, FileSearch, RootStore } from "medior/store";
import { SortMenuProps } from "medior/components";
import { FileCollection } from ".";
import { getConfig, trpc } from "medior/utils";
import { toast } from "react-toastify";
import { arrayMove } from "@alissavrk/dnd-kit-sortable";

@model("medior/CollectionEditor")
export class CollectionEditor extends Model({
  collection: prop<FileCollection>(null).withSetter(),
  fileIndexes: prop<{ id: string; index: number }[]>(() => []).withSetter(),
  files: prop<File[]>(() => []).withSetter(),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  search: prop<FileSearch>(
    () => new FileSearch({ pageSize: getConfig().collection.editor.fileSearch.pageSize })
  ),
  selectedIds: prop<string[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => ({ isDesc: false, key: "custom" })),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFilesToCollection(files: File[]) {
    const startIndex = this.files.length;
    this.files.push(...files);
    this.search.excludedFileIds.push(...files.map((f) => f.id));
    this.fileIndexes.push(...files.map((file, idx) => ({ id: file.id, index: startIndex + idx })));
    this.setHasUnsavedChanges(true);
    this.search.loadFiltered();
  }

  @modelAction
  getShiftSelectedIds(clickedId: string): { idsToDeselect: string[]; idsToSelect: string[] } {
    if (this.selectedIds.length === 0) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (this.selectedIds.length === 1 && this.selectedIds[0] === clickedId)
      return { idsToDeselect: [clickedId], idsToSelect: [] };

    const clickedIndex = this.files.findIndex((f) => f.id === clickedId);
    const editorFileIds = this.files.map((f) => f.id);

    const firstSelectedIndex = editorFileIds.indexOf(this.selectedIds[0]);
    const lastSelectedIndex = editorFileIds.indexOf(this.selectedIds[this.selectedIds.length - 1]);

    if (clickedIndex > firstSelectedIndex && clickedIndex < lastSelectedIndex) {
      const distanceToStart = clickedIndex - firstSelectedIndex;
      const distanceToEnd = lastSelectedIndex - clickedIndex;

      return {
        idsToDeselect:
          distanceToStart < distanceToEnd
            ? editorFileIds.slice(firstSelectedIndex, clickedIndex)
            : editorFileIds.slice(clickedIndex + 1, lastSelectedIndex + 1),
        idsToSelect: [],
      };
    } else {
      const startIndex = Math.min(firstSelectedIndex, clickedIndex);
      const endIndex = Math.max(lastSelectedIndex, clickedIndex);
      return { idsToDeselect: [], idsToSelect: editorFileIds.slice(startIndex, endIndex + 1) };
    }
  }

  @modelAction
  moveFileIndex(fromFileId: string, toFileId: string) {
    const [from, to] = [fromFileId, toFileId].map((id) =>
      this.fileIndexes.find((f) => f.id === id)
    );
    if (!from || !to) return console.error(`Missing file for ${fromFileId} or ${toFileId}`);
    if (from.index === to.index) return console.debug("Indexes are the same, no move needed");

    this.setFileIndexes(
      arrayMove(this.fileIndexes, from.index, to.index).map((f, i) => ({ id: f.id, index: i }))
    );

    this.setHasUnsavedChanges(true);
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    this.selectedIds = [];
    this.sortValue = { isDesc: false, key: "custom" };
    this.isOpen = isOpen;
  }

  @modelAction
  setSortValue(sortValue: SortMenuProps["value"]) {
    this.sortValue = sortValue;
    this.hasUnsavedChanges = true;

    if (sortValue.key === "custom")
      this.fileIndexes = this.collection.fileIdIndexes
        .map((f, i) => ({
          id: f.fileId,
          index: f.index,
        }))
        .sort((a, b) => a.index - b.index);
    else {
      const sortKey = sortValue.key as keyof File;
      this.fileIndexes = this.files
        .slice()
        .sort((a, b) =>
          sortValue.isDesc ? (a[sortKey] < b[sortKey] ? 1 : -1) : a[sortKey] > b[sortKey] ? 1 : -1
        )
        .map((f, i) => ({ id: f.id, index: i }));
    }
  }

  @modelAction
  toggleFilesSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []]
    );

    const removedSet = new Set(removed);
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id)
    );

    if (withToast)
      toast.info(
        `${added.length ? `${added.length} files selected.` : ""}${
          added.length && removed.length ? "\n" : ""
        }${removed.length ? `${removed.length} files deselected.` : ""}`
      );
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
  loadCollection = asyncAction(
    async ({ id, selectedFileIds }: { id: string; selectedFileIds?: string[] }) => {
      if (id === null) {
        this.setCollection(null);
        this.setFiles([]);
        this.setFileIndexes([]);
        this.setHasUnsavedChanges(false);
        return;
      }

      this.setIsLoading(true);
      const res = await trpc.listFileCollections.mutate({ args: { filter: { id } } });
      if (!res.success) throw new Error(res.error);

      this.setCollection(new FileCollection(res.data.items[0]));
      await this.loadCollectionFiles(selectedFileIds);
      this.setIsLoading(false);
      this.setHasUnsavedChanges(false);
    }
  );

  @modelFlow
  loadCollectionFiles = asyncAction(async (selectedFileIds: string[] = []) => {
    const filesRes = await trpc.listFiles.mutate({
      args: {
        filter: {
          id: [...this.collection.fileIdIndexes.map(({ fileId }) => fileId), ...selectedFileIds],
        },
      },
    });
    if (!filesRes.success) throw new Error(filesRes.error);

    const files = filesRes.data.items;
    this.setFiles(files.map((f) => new File(f)));

    const fileMap = new Map(files.map((f) => [f.id, f]));
    this.search.setExcludedFileIds([...fileMap.keys()]);
    this.setFileIndexes(
      this.collection.fileIdIndexes
        .map((f, i) => ({ id: f.fileId, index: i }))
        .sort((a, b) => a.index - b.index)
    );
  });

  @modelFlow
  removeFiles = asyncAction(async () => {
    this.setIsLoading(true);
    const res = await trpc.updateCollection.mutate({
      fileIdIndexes: this.sortedFiles
        .filter((f) => this.selectedIds.includes(f.id))
        .map((f, i) => ({ fileId: f.id, index: i })),
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
      fileIdIndexes: this.fileIndexes.map((f, i) => ({ fileId: f.id, index: i })),
      title: this.collection.title,
    });
    if (!res.success) {
      this.setIsLoading(false);
      throw new Error(res.error);
    }

    this.setHasUnsavedChanges(false);
    await this.loadCollection({ id: this.collection.id });
    this.setIsLoading(false);
    toast.success("Collection saved");
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFileById(id: string) {
    return this.files.find((f) => f.id === id);
  }

  getIndexById(id: string) {
    return this.fileIndexes.find((f) => f.id === id)?.index;
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getOriginalIndex(id: string) {
    return this.collection.fileIdIndexes.find((f) => f.fileId === id)?.index;
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get allTagIds() {
    return [...new Set(this.files.flatMap((f) => f.tagIds ?? []))];
  }

  @computed
  get sortedTags() {
    const stores = getRootStore<RootStore>(this);
    return stores.tag.listByIds(this.allTagIds).sort((a, b) => b.count - a.count);
  }

  @computed
  get sortedFiles() {
    const fileMap = new Map(this.files.map((file) => [file.id, file]));
    return this.fileIndexes.map((f) => fileMap.get(f.id));
  }
}
