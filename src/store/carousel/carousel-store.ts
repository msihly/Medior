import remote from "@electron/remote";
import { computed } from "mobx";
import { Model, _async, _await, getRootStore, model, modelAction, prop } from "mobx-keystone";
import { RootStore } from "store";

@model("medior/CarouselStore")
export class CarouselStore extends Model({
  activeFileId: prop<string>("").withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  removeFiles(fileIds: string[]) {
    const newSelectedIds = this.selectedFileIds.filter((id) => !fileIds.includes(id));
    if (!newSelectedIds.length) return remote.getCurrentWindow().close();

    if (fileIds.includes(this.activeFileId))
      this.setActiveFileId(
        newSelectedIds[this.activeFileIndex] ?? newSelectedIds[this.activeFileIndex - 1]
      );

    this.setSelectedFileIds(newSelectedIds);

    const rootStore = getRootStore<RootStore>(this);
    if (!rootStore) return;
    rootStore.fileStore.loadFiles({ fileIds: newSelectedIds });
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeFileIndex() {
    return this.getFileIndex(this.activeFileId);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getFileIndex = (fileId: string) => this.selectedFileIds.indexOf(fileId);
}
