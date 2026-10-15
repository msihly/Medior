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
import { _FileCollectionSearch } from "medior/store/_generated";
import { File, RootStore } from "medior/store";
import { asyncAction, loadFilesWithTags } from "medior/utils/client";

@model("medior/FileCollectionSearch")
export class FileCollectionSearch extends ExtendedModel(_FileCollectionSearch, {
  _maxSize: prop<number>(null),
  _minSize: prop<number>(null),
  files: prop<Record<string, File>>(() => ({}))
    .withTransform(objectToMapTransform<File>())
    .withSetter(),
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

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Loads the preview files of the shown collections, unless they are all loaded already. */
  @modelFlow
  loadFiles = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);

    const loadId = this.loadId;
    const results = this.results;
    const fileIds = [
      ...new Set(
        [...this.results, ...stores.collection.manager.currentCollections]
          .map((c) => c.previewIds)
          .flat(),
      ),
    ];

    // Removing collections, or updating them in place, keeps the previews already loaded.
    if (this.results.length && fileIds.every((fileId) => this.files.has(fileId))) return;

    this.setIsLoading(true);

    try {
      if (!this.results.length) {
        this.setFiles(new Map());
        this.setIsLoading(false);
      } else {
        const files = await loadFilesWithTags(fileIds);

        if (loadId !== this.loadId || results !== this.results) return;

        this.setFiles(new Map(files.map((file) => [file.id, new File(file)])));
        this.setIsLoading(false);
      }
    } catch (error) {
      if (loadId !== this.loadId || results !== this.results) return;

      this.setIsLoading(false);

      throw error;
    }
  });
}
