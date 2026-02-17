import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, getRootStore, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { _FileSearch } from "medior/store/_generated";
import { asyncAction, RootStore } from "medior/store";
import { durationToSeconds } from "medior/utils/common";
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
    this.results = this.results.filter((file) => !fileIds.includes(file.id));
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
    this.setBitrateValue(val * 1000);
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
    this.setMaxSize(Number.isInteger(val) ? val * 1000 : null);
    this._maxSize = val;
  }

  @modelAction
  _setMinSize(val: number) {
    this.setMinSize(Number.isInteger(val) ? val * 1000 : null);
    this._minSize = val;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  listIdsForCarousel = asyncAction(async () => {
    const res = await trpc.listFileIdsForCarousel.mutate({
      ...this.getFilterProps(),
      page: this.page,
      pageSize: this.pageSize,
    });
    if (!res.success) throw new Error(res.error);
    if (!res.data?.length) throw new Error("No files found");
    return res.data;
  });

  @modelFlow
  reloadFiles = asyncAction(async (fileIds: string[]) => {
    for (const file of this.results) {
      if (fileIds.includes(file.id)) await file.reload();
    }
  });

  @modelFlow
  reloadTags = asyncAction(async (fileIds: string[]) => {
    for (const file of this.results) {
      if (fileIds.includes(file.id)) await file.reloadTags();
    }
  });
}
