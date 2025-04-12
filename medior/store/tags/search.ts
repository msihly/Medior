import { reaction } from "mobx";
import { ExtendedModel, model, modelAction, ModelCreationData } from "mobx-keystone";
import { _TagSearch } from "medior/store/_generated";

@model("medior/TagSearch")
export class TagSearch extends ExtendedModel(_TagSearch, {}) {
  constructor(props: ModelCreationData<TagSearch>) {
    super(props);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  toggleRegExMode() {
    this.regExMode =
      this.regExMode === "any" ? "hasRegEx" : this.regExMode === "hasRegEx" ? "hasNoRegEx" : "any";
  }
}
