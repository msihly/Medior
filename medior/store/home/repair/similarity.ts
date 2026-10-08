import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";

@model("medior/RepairSimilarityStore")
export class RepairSimilarityStore extends Model({
  enabled: prop<boolean>(false).withSetter(),
  jobId: prop<string | null>(null).withSetter(),
  vectors: prop<boolean>(true).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }
}
