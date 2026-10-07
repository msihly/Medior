import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "trabecula/utils/client";
import { File, RootStore } from "medior/store";
import { trpc } from "medior/utils/server";
import { FileCollection, FileCollectionSearch } from ".";

@model("medior/CollectionManager")
export class CollectionManager extends Model({
  currentCollections: prop<FileCollection[]>(() => []).withSetter(),
  currentCollectionsPage: prop<number>(1).withSetter(),
  currentCollectionsPageCount: prop<number>(0).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  isRelatedQueueOpen: prop<boolean>(false).withSetter(),
  isTriagerOpen: prop<boolean>(false).withSetter(),
  search: prop<FileCollectionSearch>(() => new FileCollectionSearch({})).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
  selectedFiles: prop<File[]>(() => []).withSetter(),
  selectedFilesPage: prop<number>(1).withSetter(),
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
    else {
      this.isRelatedQueueOpen = false;
      this.isTriagerOpen = false;
    }

    this.search.reset();
    this.currentCollectionsPage = 1;
    this.currentCollectionsPageCount = 0;
    this.selectedFilesPage = 1;

    if (!isOpen) {
      this.selectedFileIds = [];
      this.selectedFiles = [];
    }
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadCurrentCollections = asyncAction(async (signal: AbortSignal) => {
    const res = await trpc.listFileSelectionCollections.mutate(
      { fileIds: this.selectedFileIds, page: this.currentCollectionsPage },
      { signal },
    );

    if (signal.aborted) return;

    if (!res.success) throw new Error(res.error);

    this.setCurrentCollections(res.data.items.map((c) => new FileCollection(c)));
    this.setCurrentCollectionsPageCount(res.data.pageCount);
  });

  @modelFlow
  loadFiles = asyncAction(async (signal: AbortSignal) => {
    const res = await trpc.listFile.mutate(
      {
        args: {
          filter: {
            id: this.selectedFileIds.slice(
              (this.selectedFilesPage - 1) * 3,
              this.selectedFilesPage * 3,
            ),
          },
        },
      },
      { signal },
    );

    if (signal.aborted) return;

    if (!res.success) throw new Error(res.error);

    this.setSelectedFiles(res.data.items.map((f) => new File(f)));
  });
}
