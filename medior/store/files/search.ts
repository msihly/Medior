import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { _FileSearch } from "medior/store/_generated";
import { asyncAction, derefMobx, reloadItemTags } from "medior/utils/client";
import { durationToSeconds, secondsToDuration } from "medior/utils/common";
import { trpc } from "medior/utils/server";

@model("medior/FileSearch")
export class FileSearch extends ExtendedModel(_FileSearch, {
  _bitrate: prop<number>(null),
  _duration: prop<string>(""),
  _maxSize: prop<number>(null),
  _minSize: prop<number>(null),
  isArchiveOpen: prop<boolean>(false).withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );

    reaction(
      () => this.hasChanges,
      () => {
        if (!this.hasChanges) {
          this.setIsArchiveOpen(this.isArchived);

          if (this.selectedIds?.length > 0)
            this.toggleSelected(this.selectedIds.map((id) => ({ id, isSelected: false })));
        }
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  removeFiles(fileIds: string[]) {
    const removedIds = new Set(fileIds);

    this.carouselFileIds = this.carouselFileIds.filter((id) => !removedIds.has(id));
    this.results = this.results.filter((file) => !removedIds.has(file.id));
    this.selectedIds = this.selectedIds.filter((id) => !removedIds.has(id));
  }

  @modelAction
  updateFileTags({
    addedTagIds,
    fileIds,
    removedTagIds,
  }: {
    addedTagIds: string[];
    fileIds: string[];
    removedTagIds: string[];
  }) {
    const updatedIds = new Set(fileIds);

    this.results.forEach((file) => {
      if (updatedIds.has(file.id)) file.updateTags({ addedTagIds, removedTagIds });
    });
  }

  @modelAction
  _reset() {
    this.reset();
    this._bitrate = null;
    this._duration = "";
    this._maxSize = null;
    this._minSize = null;
  }

  @modelAction
  _setBitrate(val: number) {
    this.setBitrateValue(Number.isFinite(val) ? val * 1000 : null);
    this._bitrate = val;
  }

  @modelAction
  _setDuration(val: string) {
    this.setDurationValue(val.length > 0 ? durationToSeconds(val) : null);
    this._duration = val;
  }

  @modelAction
  _setMaxSize(val: number) {
    this.setMaxSize(Number.isFinite(val) ? val * 1024 : null);
    this._maxSize = val;
  }

  @modelAction
  _setMinSize(val: number) {
    this.setMinSize(Number.isFinite(val) ? val * 1024 : null);
    this._minSize = val;
  }

  @modelAction
  afterApplySearchProps(searchProps: Record<string, any>) {
    this._bitrate = Number.isInteger(searchProps.bitrate?.value)
      ? searchProps.bitrate.value / 1000
      : null;

    this._duration =
      typeof searchProps.duration?.value === "number" && searchProps.duration.value > 0
        ? secondsToDuration(searchProps.duration.value)
        : "";

    this._maxSize = Number.isFinite(searchProps.maxSize) ? searchProps.maxSize / 1024 : null;
    this._minSize = Number.isFinite(searchProps.minSize) ? searchProps.minSize / 1024 : null;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  listIdsForCarousel = asyncAction(async () => {
    if (!this.carouselFileIds.length) throw new Error("No files found");

    return [...this.carouselFileIds];
  });

  @modelFlow
  reloadFiles = asyncAction(async (fileIds: string[]) => {
    const requestedIds = new Set(fileIds);
    const results = this.results;
    const visibleIds = results.filter((file) => requestedIds.has(file.id)).map((file) => file.id);

    if (visibleIds.length) {
      const res = await trpc.listFile.mutate({ args: { filter: { id: visibleIds } } });

      if (!res.success) throw new Error(res.error);

      if (results === this.results) {
        for (const file of res.data.items) this.getResult(file.id)?.update(file);
      }
    }
  });

  @modelFlow
  reloadTags = asyncAction(async (fileIds: string[]) => {
    const requestedIds = new Set(fileIds);

    await reloadItemTags(this.results.filter((file) => requestedIds.has(file.id)));
  });

  @modelFlow
  selectFirstInQuery = asyncAction(async (limit: number) => {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Enter a positive whole number");

    const filters =
      (this.cachedFilterProps as ReturnType<typeof this.getFilterProps>) ?? this.getFilterProps();
    const loadId = this.loadId + 1;

    this.setLoadId(loadId);
    this.setIsLoading(true);
    this.setIsPageCountLoading(false);

    try {
      const res = await trpc.listFileSearchIds.mutate({
        ...filters,
        forcePages: this.forcePages,
        limit,
      });

      if (loadId !== this.loadId) return null;

      if (!res.success) throw new Error(res.error);

      this.setSelectedIds([...new Set([...this.selectedIds, ...res.data])]);

      return res.data.length;
    } catch (error) {
      if (loadId === this.loadId) throw error;

      return null;
    } finally {
      if (loadId === this.loadId) this.setIsLoading(false);
    }
  });
}

/**
 * Chooses which files duplicate groups or similarity matches come from, without searching the
 * library itself. The duplicate review marks its menu as changed only while the menu differs from
 * the filter last searched, so restoring a search's filter or unrelated store updates never mark it.
 */
@model("medior/DuplicateFileSearch")
export class DuplicateFileSearch extends ExtendedModel(FileSearch, {}) {
  onInit() {
    autoBind(this);
  }

  /** Restores a saved search's filters without searching the library; the review applies them. */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();

    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);
  });
}
