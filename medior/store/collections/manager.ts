import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, File, RootStore } from "medior/store";
import { trpc } from "medior/utils/server";
import { FileCollection, FileCollectionSearch } from ".";

@model("medior/CollectionManager")
export class CollectionManager extends Model({
  currentCollections: prop<FileCollection[]>(() => []).withSetter(),
  idsForConfirmDelete: prop<string[]>(() => []),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  search: prop<FileCollectionSearch>(() => new FileCollectionSearch({})).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
  selectedFiles: prop<File[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

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
    const res = await trpc.listFileCollection.mutate({
      args: { filter: { id: this.selectedFileIds[0] } },
    });
    this.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
    this.setCurrentCollections(res.data.items.map((c) => new FileCollection(c)));
  });

  @modelFlow
  loadFiles = asyncAction(async () => {
    const res = await trpc.listFile.mutate({
      args: { filter: { id: this.selectedFileIds } },
    });
    if (!res.success) throw new Error(res.error);
    this.setSelectedFiles(res.data.items.map((f) => new File(f)));
  });
}
