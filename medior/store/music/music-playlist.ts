import autoBind from "auto-bind";
import { ExtendedModel, model } from "mobx-keystone";
import { _MusicPlaylist } from "medior/store/_generated";

@model("medior/MusicPlaylist")
export class MusicPlaylist extends ExtendedModel(_MusicPlaylist, {}) {
  onInit() {
    autoBind(this);
  }
}
