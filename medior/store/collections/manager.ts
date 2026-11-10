import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { File, RootStore } from "medior/store";
import { asyncAction } from "medior/utils/client";
import { rpc } from "medior/utils/server";
import { FileCollection, FileCollectionSearch } from ".";

/** One full-width row of the Selected Files card grid. */
export const SELECTED_FILES_PAGE_SIZE = 6;

@model("medior/CollectionManager")
export class CollectionManager extends Model({
  currentCollections: prop<FileCollection[]>(() => []).withSetter(),
  currentCollectionsPage: prop<number>(1).withSetter(),
  currentCollectionsPageCount: prop<number>(0).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isRelatedQueueOpen: prop<boolean>(false).withSetter(),
  isTriagerOpen: prop<boolean>(false).withSetter(),
  search: prop<FileCollectionSearch>(() => new FileCollectionSearch({})),
  /** Media program that selected collections are copied into as seasons. */
  seasonsProgramId: prop<string>(null).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
  selectedFiles: prop<File[]>(() => []).withSetter(),
  selectedFilesPage: prop<number>(1).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  /**
   * Shows the manager picking collections for the given files, or copying collections into a
   * program's seasons, or only browsing them without either.
   */
  @modelAction
  open({
    fileIds = [],
    seasonsProgramId = null,
  }: { fileIds?: string[]; seasonsProgramId?: string } = {}) {
    const stores = getRootStore<RootStore>(this);
    const editor = stores.collection.editor;

    // Picking collections for files closes a collection editor that would cover the manager.
    if (fileIds.length && editor.isOpen && editor.homeView === "collections")
      editor.setIsOpen(false);

    this.seasonsProgramId = seasonsProgramId;

    // Picked files reload each time, while browsing keeps the manager's page.
    if (fileIds.length || this.selectedFileIds.length) this.selectedFileIds = fileIds;

    stores.home.openView("collections");
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadCurrentCollections = asyncAction(async (signal: AbortSignal) => {
    const res = await rpc.listFileSelectionCollections(
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
    const res = await rpc.listFile(
      {
        args: {
          filter: {
            id: this.selectedFileIds.slice(
              (this.selectedFilesPage - 1) * SELECTED_FILES_PAGE_SIZE,
              this.selectedFilesPage * SELECTED_FILES_PAGE_SIZE,
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
