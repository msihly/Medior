import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, RootStore, TagOption } from "medior/store";
import { SortMenuProps } from "medior/components";
import { getConfig, LogicalOp, makePerfLog, trpc } from "medior/utils";

@model("medior/TagSearch")
export class TagSearch extends Model({
  alias: prop<string>("").withSetter(),
  countOp: prop<LogicalOp | "">("").withSetter(),
  countValue: prop<number>(0).withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  label: prop<string>("").withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  regExMode: prop<"any" | "hasRegEx" | "hasNoRegEx">("any").withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().tags.managerSearchSort).withSetter(),
  tags: prop<TagOption[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    const config = getConfig();

    this.alias = "";
    this.countOp = "";
    this.countValue = 0;
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.label = "";
    this.page = 1;
    this.regExMode = "any";
    this.sortValue = config.file.searchSort;
    this.tags = [];
  }

  @modelAction
  toggleRegExMode() {
    this.regExMode =
      this.regExMode === "any" ? "hasRegEx" : this.regExMode === "hasRegEx" ? "hasNoRegEx" : "any";
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  getShiftSelectedTags = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * getConfig().tags.searchTagCount + this.tags.findIndex((t) => t.id === id);

      const res = await trpc.getShiftSelectedTags.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    }
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[LFF]");

    const stores = getRootStore<RootStore>(this);
    if (!stores) throw new Error("RootStore not found");

    this.setIsLoading(true);

    const filteredRes = await trpc.listFilteredTags.mutate({
      ...this.getFilterProps(),
      page: page ?? this.page,
      pageSize: getConfig().tags.searchTagCount,
    });
    if (!filteredRes.success) throw new Error(filteredRes.error);

    const { pageCount, tags } = filteredRes.data;
    if (debug) perfLog(`Loaded ${tags.length} filtered tags`);

    stores.tag.manager.setSearchResults(tags);
    if (debug) perfLog("TagStore.tags overwrite and re-render");

    this.setPageCount(pageCount);
    if (page) this.setPage(page);
    if (debug) perfLog(`Set page to ${page ?? this.page} and pageCount to ${pageCount}`);

    if (debug) perfLogTotal(`Loaded ${tags.length} tags`);
    this.setIsLoading(false);

    return tags;
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get numOfFilters() {
    return (
      (this.alias ? 1 : 0) +
      (this.countOp ? 1 : 0) +
      (this.dateCreatedEnd ? 1 : 0) +
      (this.dateCreatedStart ? 1 : 0) +
      (this.dateModifiedEnd ? 1 : 0) +
      (this.dateModifiedStart ? 1 : 0) +
      (this.label ? 1 : 0) +
      (this.regExMode !== "any" ? 1 : 0) +
      (this.tags.length ? 1 : 0)
    );
  }

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    const stores = getRootStore<RootStore>(this);
    return {
      ...stores.tag.tagSearchOptsToIds(this.tags),
      alias: this.alias,
      countOp: this.countOp,
      countValue: this.countValue,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      isSortDesc: this.sortValue.isDesc,
      label: this.label,
      regExMode: this.regExMode,
      sortKey: this.sortValue.key,
    };
  }
}
