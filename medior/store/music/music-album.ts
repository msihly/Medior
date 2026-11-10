import autoBind from "auto-bind";
import { ExtendedModel, model } from "mobx-keystone";
import { _MusicAlbum } from "medior/store/_generated";

@model("medior/MusicAlbum")
export class MusicAlbum extends ExtendedModel(_MusicAlbum, {}) {
  onInit() {
    autoBind(this);
  }
}
