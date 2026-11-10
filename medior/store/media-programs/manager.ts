import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";
import { MediaProgramSearch } from ".";

@model("medior/MediaProgramManagerStore")
export class MediaProgramManagerStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  /** Shows the rankings in place of the programs. */
  isRankingsView: prop<boolean>(false).withSetter(),
  search: prop<MediaProgramSearch>(() => new MediaProgramSearch({})),
}) {
  onInit() {
    autoBind(this);
  }
}
