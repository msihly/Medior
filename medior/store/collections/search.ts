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
import { asyncAction, File, RootStore } from "medior/store";
import { trpc } from "medior/utils/server";

@model("medior/FileCollectionSearch")
export class FileCollectionSearch extends ExtendedModel(_FileCollectionSearch, {
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
    this.setIsLoading(true);

    if (this.results.length) {
      const fileIds = [...new Set(this.results.map((c) => c.previewIds).flat())];

      const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });
      if (!res.success) throw new Error(res.error);

      this.setFiles(new Map(res.data.items.map((f) => [f.id, new File(f)])));
    }

    this.setIsLoading(false);
  });
}
