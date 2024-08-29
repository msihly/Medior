import * as Types from "medior/database/types";
import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, FileCollection, RootStore, TagOption } from "medior/store";
import { SortMenuProps } from "medior/components";
import { getConfig, LogicalOp, makePerfLog, trpc } from "medior/utils";

@model("medior/FileCollectionSearch")
export class FileCollectionSearch extends Model({
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  fileCountOp: prop<LogicalOp | "">("").withSetter(),
  fileCountValue: prop<number>(0).withSetter(),
  hasQueuedReload: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  ratingOp: prop<LogicalOp | "">("").withSetter(),
  ratingValue: prop<number>(0).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().collection.managerSearchSort
  ).withSetter(),
  tags: prop<TagOption[]>(() => []).withSetter(),
  title: prop<string>("").withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reloadIfQueued() {
    const stores = getRootStore<RootStore>(this);
    if (this.hasQueuedReload && !stores._getIsBlockingModalOpen()) {
      this.setHasQueuedReload(false);
      this.loadFiltered();
    }
  }

  @modelAction
  reset() {
    const config = getConfig();

    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.fileCountOp = "";
    this.fileCountValue = 0;
    this.page = 1;
    this.ratingOp = "";
    this.sortValue = config.collection.managerSearchSort;
    this.ratingValue = 0;
    this.tags = [];
    this.title = "";
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadFiltered = asyncAction(
    async (
      args: {
        filterProps?: Partial<Types.ListFilteredFilesInput>;
        noOverwrite?: boolean;
        page?: number;
        pageSize?: number;
      } = {}
    ) => {
      const debug = false;
      const { perfLog, perfLogTotal } = makePerfLog("[LFC]");

      const stores = getRootStore<RootStore>(this);
      this.setIsLoading(true);

      const collectionsRes = await trpc.listFilteredCollections.mutate({
        ...this.getFilterProps(),
        ...args.filterProps,
        page: args.page ?? this.page,
        pageSize: args.pageSize ?? getConfig().collection.editorPageSize,
      });
      if (!collectionsRes.success) throw new Error(collectionsRes.error);

      const { collections, pageCount } = collectionsRes.data;
      if (debug) perfLog(`Loaded ${collections.length} filtered collections`);

      stores.collection.manager.setSearchResults(collections.map((c) => new FileCollection(c)));
      if (debug) perfLog("Overwrite and re-render");

      this.setPageCount(pageCount);
      if (args.page) this.setPage(args.page);
      if (debug) perfLog(`Set page to ${args.page ?? this.page} and pageCount to ${pageCount}`);

      stores.collection.manager.setSelectedCollectionId(null);
      this.setIsLoading(false);
      if (debug) perfLogTotal(`Loaded ${collections.length} collections`);

      return collections;
    }
  );

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get numOfFilters() {
    return (
      (this.dateCreatedEnd ? 1 : 0) +
      (this.dateCreatedStart ? 1 : 0) +
      (this.dateModifiedEnd ? 1 : 0) +
      (this.dateModifiedStart ? 1 : 0) +
      (this.fileCountOp ? 1 : 0) +
      (this.ratingOp ? 1 : 0) +
      (this.title ? 1 : 0) +
      (this.tags.length ? 1 : 0)
    );
  }

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    const stores = getRootStore<RootStore>(this);

    return {
      ...stores.tag.tagSearchOptsToIds(this.tags),
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      fileCountOp: this.fileCountOp,
      fileCountValue: this.fileCountValue,
      isSortDesc: this.sortValue.isDesc,
      ratingOp: this.ratingOp,
      ratingValue: this.ratingValue,
      sortKey: this.sortValue.key,
      title: this.title,
    };
  }
}
