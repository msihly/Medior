import { SortMenuProps } from "medior/components";
import { getRootStore, model, Model, modelAction, modelFlow, prop } from "mobx-keystone";
import { toast } from "react-toastify";
import { asyncAction, RootStore } from "medior/store";
import { getConfig, LogicalOp, makePerfLog, makeQueue, PromiseQueue, trpc } from "medior/utils";
import { TagOption } from ".";

export type TagManagerMode = "create" | "edit" | "search";

export type TagManagerTag = {
  aliases?: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  id: string;
  label: string;
  thumbPaths: string[];
};

@model("medior/TagManagerStore")
export class TagManagerStore extends Model({
  aliasesValue: prop<string>("").withSetter(),
  countOp: prop<LogicalOp | "">("").withSetter(),
  countValue: prop<number>(0).withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isMultiTagEditorOpen: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  labelValue: prop<string>("").withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  regExMode: prop<"any" | "hasRegEx" | "hasNoRegEx">("any").withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  searchValue: prop<TagOption[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().tags.managerSearchSort).withSetter(),
  tags: prop<TagManagerTag[]>(() => []),
}) {
  tagRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  overwrite(tags: TagManagerTag[]) {
    this.tags = tags;
  }

  @modelAction
  resetSearch() {
    const config = getConfig();

    this.countOp = "";
    this.countValue = 0;
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.regExMode = "any";
    this.searchValue = [];
    this.sortValue = config.tags.managerSearchSort;
  }

  @modelAction
  toggleRegExMode() {
    this.regExMode =
      this.regExMode === "any" ? "hasRegEx" : this.regExMode === "hasRegEx" ? "hasNoRegEx" : "any";
  }

  @modelAction
  toggleTagsSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
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
        `${added.length ? `${added.length} tags selected.` : ""}${
          added.length && removed.length ? "\n" : ""
        }${removed.length ? `${removed.length} tags deselected.` : ""}`
      );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  editMultiTagRelations = asyncAction(
    async ({
      childIdsToAdd,
      childIdsToRemove,
      parentIdsToAdd,
      parentIdsToRemove,
    }: {
      childIdsToAdd: string[];
      childIdsToRemove: string[];
      parentIdsToAdd: string[];
      parentIdsToRemove: string[];
    }) => {
      const res = await trpc.editMultiTagRelations.mutate({
        childIdsToAdd,
        childIdsToRemove,
        parentIdsToAdd,
        parentIdsToRemove,
        tagIds: this.selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    }
  );

  @modelFlow
  getShiftSelectedTags = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const stores = getRootStore<RootStore>(this);

      const clickedIndex =
        (stores.tag.manager.page - 1) * getConfig().tags.searchTagCount +
        stores.tag.manager.tags.findIndex((t) => t.id === id);

      const res = await trpc.getShiftSelectedTags.mutate({
        ...this.getFilterProps(),
        ...stores.tag.tagSearchOptsToIds(this.searchValue),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    }
  );

  @modelFlow
  loadFilteredTags = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[LFF]");

    const stores = getRootStore<RootStore>(this);
    if (!stores) throw new Error("RootStore not found");

    this.setIsLoading(true);

    const filteredRes = await trpc.listFilteredTags.mutate({
      ...this.getFilterProps(),
      ...stores.tag.tagSearchOptsToIds(this.searchValue),
      page: page ?? this.page,
      pageSize: getConfig().tags.searchTagCount,
    });
    if (!filteredRes.success) throw new Error(filteredRes.error);

    const { pageCount, tags } = filteredRes.data;
    if (debug) perfLog(`Loaded ${tags.length} filtered tags`);

    this.overwrite(tags);
    if (debug) perfLog("TagStore.tags overwrite and re-render");

    this.setPageCount(pageCount);
    if (page) this.setPage(page);
    if (debug) perfLog(`Set page to ${page ?? this.page} and pageCount to ${pageCount}`);

    if (debug) perfLogTotal(`Loaded ${tags.length} tags`);
    this.setIsLoading(false);

    return tags;
  });

  @modelFlow
  refreshSelectedTags = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    makeQueue({
      action: async (tagId) => {
        const res = await trpc.refreshTag.mutate({ tagId });
        if (!res.success) throw new Error(res.error);
      },
      items: this.selectedIds,
      logSuffix: "tags",
      onComplete: () => Promise.all([stores.tag.loadTags(), this.loadFilteredTags()]),
      queue: this.tagRefreshQueue,
    });
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.tags.find((t) => t.id === id);
  }

  getFilterProps() {
    return {
      alias: this.aliasesValue,
      countOp: this.countOp,
      countValue: this.countValue,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      isSortDesc: this.sortValue.isDesc,
      label: this.labelValue,
      regExMode: this.regExMode,
      searchValue: this.searchValue,
      sortKey: this.sortValue.key,
    };
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }
}
