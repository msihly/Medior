import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, getRootStore, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { _FileSearch } from "medior/store/_generated";
import { RootStore } from "medior/store";
import { asyncAction, reloadItemTags } from "medior/utils/client";
import { durationToSeconds, secondsToDuration } from "medior/utils/common";
import { trpc } from "medior/utils/server";

@model("medior/FileSearch")
export class FileSearch extends ExtendedModel(_FileSearch, {
  _bitrate: prop<number>(null),
  _duration: prop<string>(""),
  _maxSize: prop<number>(null),
  _minSize: prop<number>(null),
  hasQueuedReload: prop<boolean>(false).withSetter(),
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
  reloadIfQueued() {
    const stores = getRootStore<RootStore>(this);

    if (this.hasQueuedReload && !stores._getIsBlockingModalOpen()) {
      this.setHasQueuedReload(false);
      this.loadFiltered();
    }
  }

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
    const parsedSeconds = val.length > 0 ? durationToSeconds(val) : null;

    this.setDurationValue(parsedSeconds);
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

    const filterProps = this.cachedFilterProps as ReturnType<typeof this.getFilterProps> | null;
    const filters = filterProps ?? this.getFilterProps();
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
