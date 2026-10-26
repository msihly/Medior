import { ExtendedModel, model, modelAction } from "mobx-keystone";
import { _TagSearch } from "medior/store/_generated";
import { cycleTriState } from "medior/utils/common";

@model("medior/TagSearch")
export class TagSearch extends ExtendedModel(_TagSearch, {}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  toggleHasRegEx() {
    this.hasRegEx = cycleTriState(this.hasRegEx);
  }
}
