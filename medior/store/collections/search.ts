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
    this.setMaxSize(Number.isInteger(val) ? val * 1000 : null);
    this._maxSize = val;
  }

  @modelAction
  _setMinSize(val: number) {
    this.setMinSize(Number.isInteger(val) ? val * 1000 : null);
    this._minSize = val;
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
    this.setIsLoading(true);

    if (this.results.length) {
      const fileIds = [
        ...new Set(
          [...this.results, ...stores.collection.manager.currentCollections]
            .map((c) => c.previewIds)
            .flat(),
        ),
      ];

      const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });
      if (!res.success) throw new Error(res.error);

      this.setFiles(new Map(res.data.items.map((f) => [f.id, new File(f)])));
    }

    this.setIsLoading(false);
  });
}
