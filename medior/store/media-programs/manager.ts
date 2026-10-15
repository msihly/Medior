import autoBind from "auto-bind";
import { Model, model, modelAction, prop } from "mobx-keystone";
import { MediaProgramSearch } from ".";

@model("medior/MediaProgramManagerStore")
export class MediaProgramManagerStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  search: prop<MediaProgramSearch>(() => new MediaProgramSearch({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  setIsOpen(isOpen: boolean) {
    this.isOpen = isOpen;
    this.search.reset();
  }
}
