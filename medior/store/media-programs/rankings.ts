import autoBind from "auto-bind";
import { FileSchema, MediaProgramSchema } from "medior/_generated/server";
import { computed } from "mobx";
import { ExtendedModel, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { SortMenuProps } from "medior/components";
import { asyncAction, derefMobx } from "medior/utils/client";
import {
  isDeepEqual,
  MediaProgramRankingExport,
  MediaProgramRankingTile,
  moveSelectedItems,
} from "medior/utils/common";
import { getConfig, rpc } from "medior/utils/server";
// The search class is extended as this module loads, before the index has exported it.
import { MediaProgramSearch } from "./search";

const CUSTOM_SORT: SortMenuProps["value"] = { isDesc: false, key: "custom" };

/** Orders the programs a custom sort has no saved place for. */
const UNRANKED_SORT: SortMenuProps["value"] = { isDesc: true, key: "rating" };

/**
 * Chooses which programs the rankings show, leaving their loading and order to the rankings. Its
 * saved searches are the Media Program Manager's too, which can't sort by the custom order.
 */
@model("medior/MediaProgramRankingSearch")
export class MediaProgramRankingSearch extends ExtendedModel(MediaProgramSearch, {}) {
  /** Restores a saved search's filters without searching, in its saved order if it has one. */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();

    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);

    if (savedSearch.customOrderIds.length) this.setSortValue({ ...CUSTOM_SORT });
  });

  /** Saves the custom sort as the selected saved search's own sort, or the sort it falls back to. */
  getSearchProps() {
    const searchProps = super.getSearchProps();
    const savedSort = this.savedSearches.find((s) => s.id === this.selectedSavedSearchId)
      ?.filterProps.sortValue;

    return searchProps.sortValue.key === "custom"
      ? {
          ...searchProps,
          sortValue:
            savedSort && savedSort.key !== "custom" ? derefMobx(savedSort) : { ...UNRANKED_SORT },
        }
      : searchProps;
  }
}

/**
 * Ranks the programs a search matches. The custom sort shows the selected saved search's saved
 * order, with programs new to it first; other sorts derive a new order that can be saved in its
 * place. Moves count as unsaved until the order is saved or searched again.
 */
@model("medior/MediaProgramRankingStore")
export class MediaProgramRankingStore extends Model({
  filter: prop<MediaProgramRankingSearch>(
    () =>
      new MediaProgramRankingSearch({ sortValue: getConfig().mediaPrograms.rankings.search.sort }),
  ),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isExportOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  /** The custom order is shown reversed, so it's compared and saved the other way round. */
  isReversed: prop<boolean>(false).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  rankedIds: prop<string[]>(() => []).withSetter(),
  /** The saved search the shown order was loaded from, which only it may be saved to. */
  rankedSavedSearchId: prop<string>(null).withSetter(),
  search: prop<MediaProgramSearch>(
    () =>
      new MediaProgramSearch({
        forcePages: true,
        pageSize: getConfig().mediaPrograms.rankings.search.pageSize,
      }),
  ),
}) {
  /** The order as last searched or saved, which discarding the moves since restores. */
  private baseRankedIds: string[] = [];
  private loadRevision = 0;
  /** The filters the shown order was searched with, saved along with it. */
  private searchedProps: Record<string, any> = null;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.loadRevision++;
    this.setIsLoading(false);
    this.search.cancelLoad();
  }

  /** Drops deleted programs from the order. */
  @modelAction
  removeRankedIds(ids: string[]) {
    const removedIds = new Set(ids);
    if (!this.rankedIds.some((id) => removedIds.has(id))) return;

    this.baseRankedIds = this.baseRankedIds.filter((id) => !removedIds.has(id));
    this.rankedIds = this.rankedIds.filter((id) => !removedIds.has(id));
    this.search.setIds([...this.rankedIds]);
  }

  /** Resets the filters to the rankings' configured sort. */
  @modelAction
  resetFilter() {
    this.filter.reset();
    this.filter.setSortValue(getConfig().mediaPrograms.rankings.search.sort);
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    this.cancelLoad();
    this.isOpen = isOpen;
    this.isExportOpen = false;
    this.isReversed = false;
    this.hasUnsavedChanges = false;
    this.baseRankedIds = [];
    this.rankedIds = [];
    this.rankedSavedSearchId = null;
    this.searchedProps = null;
    this.resetFilter();
    this.filter.setSelectedSavedSearchId("");
    this.search.reset();
    this.search.setForcePages(true);
    this.search.setPageSize(getConfig().mediaPrograms.rankings.search.pageSize);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Restores the order as last searched or saved, dropping the moves since. */
  @modelFlow
  discardOrder = asyncAction(async () => {
    const revision = ++this.loadRevision;

    this.setIsLoading(true);

    try {
      this.setRankedIds([...this.baseRankedIds]);
      this.search.setIds([...this.baseRankedIds]);
      this.setHasUnsavedChanges(false);

      // The page's cached filters hold the moved order.
      const pageRes = await this.search.loadFiltered({ noCache: true });
      if (revision === this.loadRevision && !pageRes.success) throw new Error(pageRes.error);
    } finally {
      if (revision === this.loadRevision) this.setIsLoading(false);
    }
  });

  /** Loads the top programs and their posters for an export. */
  @modelFlow
  loadExportPrograms = asyncAction(async (count: number) => {
    const ids = this.rankedIds.slice(0, count);
    let files: FileSchema[] = [];
    let programs: MediaProgramSchema[] = [];

    if (ids.length) {
      const programRes = await rpc.listFilteredMediaProgram({
        forcePages: true,
        ids,
        page: 1,
        pageSize: ids.length,
      });
      if (!programRes.success) throw new Error(programRes.error);

      programs = programRes.data;

      const posterIds = [...new Set(programs.map((program) => program.posterFileId))].filter(
        Boolean,
      );

      if (posterIds.length) {
        const fileRes = await rpc.listFile({ args: { filter: { id: posterIds } } });
        if (!fileRes.success) throw new Error(fileRes.error);

        files = fileRes.data.items;
      }
    }

    return { files, programs };
  });

  /** Loads every program the filters match and orders them by the filters' sort. */
  @modelFlow
  loadRanking = asyncAction(async () => {
    const revision = ++this.loadRevision;
    const savedSearchId = this.filter.selectedSavedSearchId || null;
    const searchProps = this.filter.getSearchProps();
    const sortValue = derefMobx(this.filter.sortValue);
    const isCustom = sortValue.key === "custom";

    this.setIsLoading(true);

    try {
      const res = await rpc.listFilteredMediaProgramIds({
        ...this.filter.getFilterProps(),
        sortValue: isCustom ? UNRANKED_SORT : sortValue,
      });
      if (revision !== this.loadRevision) return;
      if (!res.success) throw new Error(res.error);

      let rankedIds = res.data;

      if (isCustom) {
        const matchedIds = new Set(res.data);
        const savedOrderIds =
          this.filter.savedSearches.find((s) => s.id === savedSearchId)?.customOrderIds ?? [];
        const savedIds = savedOrderIds.filter((id) => matchedIds.has(id));
        const savedIdSet = new Set(savedIds);

        rankedIds = [...res.data.filter((id) => !savedIdSet.has(id)), ...savedIds];

        if (sortValue.isDesc) rankedIds.reverse();
      }

      this.baseRankedIds = rankedIds;
      this.searchedProps = searchProps;
      this.setIsReversed(isCustom && sortValue.isDesc);
      this.setRankedSavedSearchId(savedSearchId);
      this.setRankedIds(rankedIds);
      this.setHasUnsavedChanges(false);
      this.search.setIds([...rankedIds]);
      this.search.setSelectedIds([]);
      this.filter.setHasChanges(false);

      if (!rankedIds.length) {
        this.search.setResults([]);
        this.search.setPage(1);
        this.search.setPageCount(1);
      } else {
        const pageRes = await this.search.loadFiltered({
          noCache: true,
          page: 1,
          withFullCount: true,
        });
        if (revision !== this.loadRevision) return;
        if (!pageRes.success) throw new Error(pageRes.error);
      }
    } catch (error) {
      if (revision === this.loadRevision) throw error;
    } finally {
      if (revision === this.loadRevision) this.setIsLoading(false);
    }
  });

  @modelFlow
  moveRankedIds = asyncAction(async ({ down, maxDelta }: { down: boolean; maxDelta?: number }) => {
    const delta = maxDelta ?? 1;
    if (!Number.isSafeInteger(delta) || delta < 1)
      throw new Error("Enter a positive whole number for the move distance.");

    const selectedIds = new Set(this.search.selectedIds);
    const rankedIds = moveSelectedItems(this.rankedIds, (id) => selectedIds.has(id), {
      delta,
      down,
    });
    if (!rankedIds.some((id, index) => id !== this.rankedIds[index])) return;

    const revision = ++this.loadRevision;

    this.setIsLoading(true);

    try {
      this.setRankedIds(rankedIds);
      this.search.setIds([...rankedIds]);
      this.setHasUnsavedChanges(true);

      // The page's cached filters hold the previous order.
      const pageRes = await this.search.loadFiltered({ noCache: true });
      if (revision === this.loadRevision && !pageRes.success) throw new Error(pageRes.error);
    } finally {
      if (revision === this.loadRevision) this.setIsLoading(false);
    }
  });

  /** Draws the export as a PNG data URL, or saves it to the output path given. */
  @modelFlow
  renderExport = asyncAction(
    async (args: {
      options: MediaProgramRankingExport;
      outputPath?: string;
      tiles: MediaProgramRankingTile[];
      title: string;
    }) => {
      const res = await rpc.renderMediaProgramRanking(args);
      if (!res.success) throw new Error(res.error);

      return res.data;
    },
  );

  /**
   * Saves the order as its saved search's custom order, which it then opens in, along with the
   * filters it was searched with.
   */
  @modelFlow
  saveOrder = asyncAction(async () => {
    const savedSearch = this.savedSearch;
    if (!savedSearch) throw new Error("Save the filters as a saved search to keep their order.");
    if (!this.searchedProps) throw new Error("Search before saving the order.");
    if (!this.isSavedSearchSelected)
      throw new Error("Another saved search is selected; search again before saving its order.");

    this.setIsSaving(true);

    try {
      const res = await rpc.updateSavedSearch({
        args: {
          id: savedSearch.id,
          updates: { customOrderIds: [...this.orderIds], filterProps: this.searchedProps },
        },
      });
      if (!res.success) throw new Error(res.error);

      const loaded = await this.filter.loadSavedSearches();
      if (!loaded.success) throw new Error(loaded.error);

      this.baseRankedIds = [...this.rankedIds];
      this.setHasUnsavedChanges(false);
    } finally {
      this.setIsSaving(false);
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  /** The order differs from its saved search's saved order, which is still the one selected. */
  @computed
  get canSaveOrder() {
    return (
      !!this.savedSearch &&
      this.isSavedSearchSelected &&
      !isDeepEqual(this.orderIds, this.savedOrderIds)
    );
  }

  /** Whether the saved search the order was loaded from is still the one selected. */
  @computed
  private get isSavedSearchSelected() {
    return this.rankedSavedSearchId === (this.filter.selectedSavedSearchId || null);
  }

  /** Each saved program's place among the saved programs shown, in the order as it's saved now. */
  @computed
  private get orderedSavedIndexesById() {
    return new Map(
      this.orderIds.filter((id) => this.savedIndexesById.has(id)).map((id, index) => [id, index]),
    );
  }

  /** The shown order as it's saved, which a reversed custom sort shows backwards. */
  @computed
  private get orderIds() {
    return this.isReversed ? [...this.rankedIds].reverse() : this.rankedIds;
  }

  @computed
  private get rankIndexesById() {
    return new Map(this.rankedIds.map((id, index) => [id, index]));
  }

  /** Each saved program's place among the saved programs shown, in the saved order. */
  @computed
  private get savedIndexesById() {
    return new Map(
      this.savedOrderIds
        .filter((id) => this.rankIndexesById.has(id))
        .map((id, index) => [id, index]),
    );
  }

  @computed
  get savedOrderIds() {
    return this.savedSearch?.customOrderIds ?? [];
  }

  /** The saved search the shown order was loaded from. */
  @computed
  get savedSearch() {
    return this.filter.savedSearches.find((s) => s.id === this.rankedSavedSearchId);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getRankIndex(id: string) {
    return this.rankIndexesById.get(id);
  }

  /** Against a saved order, programs new to it or in another place among its programs are marked. */
  getIsRankChanged(id: string) {
    return (
      this.savedOrderIds.length > 0 &&
      (!this.savedIndexesById.has(id) ||
        this.savedIndexesById.get(id) !== this.orderedSavedIndexesById.get(id))
    );
  }
}
