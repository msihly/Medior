import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, getRootStore, model, modelAction, prop } from "mobx-keystone";
import { _FileImportBatchSearch } from "medior/store/_generated";
import { RootStore } from "medior/store";

@model("medior/FileImportBatchSearch")
export class FileImportBatchSearch extends ExtendedModel(_FileImportBatchSearch, {
  hasQueuedReload: prop<boolean>(false).withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
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
}
