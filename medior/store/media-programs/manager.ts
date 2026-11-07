import autoBind from "auto-bind";
import { Model, model, modelAction, prop } from "mobx-keystone";
import { MediaProgramSearch } from ".";

@model("medior/MediaProgramManagerStore")
export class MediaProgramManagerStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  /** Shows the rankings in place of the programs. */
  isRankingsView: prop<boolean>(false).withSetter(),
  search: prop<MediaProgramSearch>(() => new MediaProgramSearch({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  setIsOpen(isOpen: boolean) {
    this.isOpen = isOpen;
    this.isRankingsView = false;
    this.search.reset();
  }
}
