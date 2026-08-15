import { computed } from "mobx";
import { ExtendedModel, model } from "mobx-keystone";
import { _FileTransform } from "medior/store/_generated";

@model("medior/FileTransform")
export class FileTransform extends ExtendedModel(_FileTransform, {}) {
  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get progress() {
    return {
      percent: this.progressPercent ?? 0,
      size: this.progressSize ?? 0,
      time: this.progressTime ?? "",
    };
  }
}
