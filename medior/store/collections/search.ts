import { ExtendedModel, getRootStore, model, modelAction, prop } from "mobx-keystone";
import { RootStore } from "medior/store";
import { _FileCollectionSearch } from "medior/store/_generated";

@model("medior/FileCollectionSearch")
export class FileCollectionSearch extends ExtendedModel(_FileCollectionSearch, {
  hasQueuedReload: prop<boolean>(false).withSetter(),
}) {
  @modelAction
  reloadIfQueued() {
    const stores = getRootStore<RootStore>(this);
    if (this.hasQueuedReload && !stores._getIsBlockingModalOpen()) {
      this.setHasQueuedReload(false);
      this.loadFiltered();
    }
  }
}
