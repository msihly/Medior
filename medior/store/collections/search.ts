import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, getRootStore, model, modelAction, prop } from "mobx-keystone";
import { _FileCollectionSearch } from "medior/store/_generated";
import { RootStore } from "medior/store";

@model("medior/FileCollectionSearch")
export class FileCollectionSearch extends ExtendedModel(_FileCollectionSearch, {
  hasQueuedReload: prop<boolean>(false).withSetter(),
}) {
  onInit() {
    autoBind(this);
    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
  }

  @modelAction
  reloadIfQueued() {
    const stores = getRootStore<RootStore>(this);
    if (this.hasQueuedReload && !stores.collection.editor.isOpen) {
      this.setHasQueuedReload(false);
      this.loadFiltered();
    }
  }
}
