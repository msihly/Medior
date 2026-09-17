import autoBind from "auto-bind";
import { reaction } from "mobx";
import {
  ExtendedModel,
  getRootStore,
  model,
  modelAction,
  modelFlow,
  objectToMapTransform,
  prop,
} from "mobx-keystone";
import { asyncAction } from "trabecula/utils/client";
import { _FileCollectionSearch } from "medior/store/_generated";
import { File, RootStore } from "medior/store";
import { trpc } from "medior/utils/server";

@model("medior/FileCollectionSearch")
export class FileCollectionSearch extends ExtendedModel(_FileCollectionSearch, {
  _maxSize: prop<number>(null),
  _minSize: prop<number>(null),
  files: prop<Record<string, File>>(() => ({}))
    .withTransform(objectToMapTransform<File>())
    .withSetter(),
  hasQueuedReload: prop<boolean>(false).withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );

    reaction(
      () => this.results,
      () => this.loadFiles(),
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _reset() {
    this.reset();
    this._maxSize = null;
    this._minSize = null;
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
    this._maxSize = Number.isFinite(searchProps.maxSize) ? searchProps.maxSize / 1024 : null;
    this._minSize = Number.isFinite(searchProps.minSize) ? searchProps.minSize / 1024 : null;
  }

  @modelAction
  reloadIfQueued() {
    const stores = getRootStore<RootStore>(this);
    if (this.hasQueuedReload && !stores.collection.editor.isOpen) {
      this.setHasQueuedReload(false);
      this.loadFiltered();
    }
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadFiles = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    const loadId = this.loadId;
    this.setIsLoading(true);

    try {
      if (!this.results.length) {
        if (loadId === this.loadId) {
          this.setFiles(new Map());
          this.setIsLoading(false);
        }
        return;
      }

      const fileIds = [
        ...new Set(
          [...this.results, ...stores.collection.manager.currentCollections]
            .map((c) => c.previewIds)
            .flat(),
        ),
      ];

      const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });
      if (loadId !== this.loadId) return;
      if (!res.success) throw new Error(res.error);

      const files = res.data.items.map((file) => new File(file));
      await Promise.all(
        files.map(async (file) => {
          const res = await file.reloadTags();
          if (!res.success) throw new Error(res.error);
        }),
      );
      if (loadId !== this.loadId) return;
      this.setFiles(new Map(files.map((file) => [file.id, file])));
      this.setIsLoading(false);
    } catch (error) {
      if (loadId !== this.loadId) return;
      this.setIsLoading(false);
      throw error;
    }
  });
}
