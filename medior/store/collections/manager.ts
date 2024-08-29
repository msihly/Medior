import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, File, RootStore } from "medior/store";
import { FileCollection, FileCollectionSearch } from ".";
import { trpc } from "medior/utils";

@model("medior/CollectionManager")
export class CollectionManager extends Model({
  currentCollections: prop<FileCollection[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  search: prop<FileCollectionSearch>(() => new FileCollectionSearch({})).withSetter(),
  searchResults: prop<FileCollection[]>(() => []).withSetter(),
  selectedCollectionId: prop<string>(null).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
  selectedFiles: prop<File[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  setIsOpen(isOpen: boolean) {
    const stores = getRootStore<RootStore>(this);
    this.isOpen = isOpen;
    if (isOpen) stores.collection.editor.isOpen = false;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadCurrentCollections = asyncAction(async () => {
    this.setIsLoading(true);
    const res = await trpc.listFileCollections.mutate({
      args: { filter: { id: this.selectedFileIds[0] } },
    });
    this.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
    this.setCurrentCollections(res.data.items.map((c) => new FileCollection(c)));
  });

  @modelFlow
  loadFiles = asyncAction(async () => {
    const res = await trpc.listFiles.mutate({
      args: { filter: { id: this.selectedFileIds } },
    });
    if (!res.success) throw new Error(res.error);
    this.setSelectedFiles(res.data.items.map((f) => new File(f)));
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.searchResults.find((c) => c.id === id);
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get selectedCollection() {
    return this.searchResults.find((c) => c.id === this.selectedCollectionId);
  }
}
