import autoBind from "auto-bind";
import { ExtendedModel, model } from "mobx-keystone";
import { _MusicArtist } from "medior/store/_generated";

@model("medior/MusicArtist")
export class MusicArtist extends ExtendedModel(_MusicArtist, {}) {
  onInit() {
    autoBind(this);
  }
}
