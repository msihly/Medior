import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, prop } from "mobx-keystone";
import { HomeView, RootStore } from "medior/store";

@model("medior/FileTagsEditorStore")
export class FileTagsEditorStore extends Model({
  fileIds: prop<string[]>(() => []).withSetter(),
  /** The view the editor opened over, where it waits while another view shows. */
  homeView: prop<HomeView>(null),
  isOpen: prop<boolean>(false),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  setIsOpen(isOpen: boolean) {
    const stores = getRootStore<RootStore>(this);

    // Asked to open again, the editor shows the view it waits in.
    if (isOpen && this.isOpen) stores.home.openView(this.homeView);
    else if (isOpen) this.homeView = stores.home.view;

    this.isOpen = isOpen;
  }
}
