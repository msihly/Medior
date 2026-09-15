import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";
import { durationToSeconds } from "medior/utils/common";

@model("medior/RepairAudioStore")
export class RepairAudioStore extends Model({
  enabled: prop<boolean>(false).withSetter(),
  maxDurationDisplay: prop<string>("20m").withSetter(),
  transcriptions: prop<boolean>(true).withSetter(),
  waveforms: prop<boolean>(true).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get isSelected() {
    return this.enabled && (this.transcriptions || this.waveforms);
  }

  get maxDuration() {
    return durationToSeconds(this.maxDurationDisplay ?? "");
  }
}
