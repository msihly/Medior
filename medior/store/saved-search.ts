import autoBind from "auto-bind";
import { ExtendedModel, model } from "mobx-keystone";
import { _SavedSearch } from "medior/store/_generated";

@model("medior/SavedSearch")
export class SavedSearch extends ExtendedModel(_SavedSearch, {}) {
  onInit() {
    autoBind(this);
  }
}
