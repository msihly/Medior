import remote from "@electron/remote";
import { computed } from "mobx";
import { Model, _async, _await, model, modelFlow, prop } from "mobx-keystone";
import { RootStore } from "store";
import { handleErrors } from "utils";

@model("mediaViewer/CarouselStore")
export class CarouselStore extends Model({
  activeFileId: prop<string>("").withSetter(),
  isTaggerOpen: prop<boolean>(false).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  removeFiles = _async(function* (
    this: CarouselStore,
    { fileIds, rootStore }: { fileIds: string[]; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const newSelectedIds = this.selectedFileIds.filter((id) => !fileIds.includes(id));
        if (!newSelectedIds.length) return remote.getCurrentWindow().close();

        if (fileIds.includes(this.activeFileId))
          this.setActiveFileId(
            newSelectedIds[this.activeFileIndex <= newSelectedIds.length ? this.activeFileIndex : 0]
          );

        this.setSelectedFileIds(newSelectedIds);
        rootStore.fileStore.loadFiles({ fileIds: newSelectedIds });
      })
    );
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeFileIndex() {
    return this.getFileIndex(this.activeFileId);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getFileIndex = (fileId: string) => this.selectedFileIds.indexOf(fileId);
}
