import { reaction } from "mobx";
import {
  ExtendedModel,
  getRootStore,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { asyncAction, RootStore } from "medior/store";
import { _FileSearch } from "medior/store/_generated";
import { getConfig, trpc } from "medior/utils";

@model("medior/FileSearch")
export class FileSearch extends ExtendedModel(_FileSearch, {
  hasQueuedReload: prop<boolean>(false).withSetter(),
}) {
  constructor(props: ModelCreationData<FileSearch>) {
    super(props);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true)
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

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  listIdsForCarousel = asyncAction(async () => {
    const res = await trpc.listFileIdsForCarousel.mutate({
      ...this.getFilterProps(),
      page: this.page,
      pageSize: getConfig().file.searchFileCount,
    });
    if (!res.success) throw new Error(res.error);
    if (!res.data?.length) throw new Error("No files found");
    return res.data;
  });
}
