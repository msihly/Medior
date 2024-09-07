import { ExtendedModel, model, modelAction } from "mobx-keystone";
import { _TagSearch } from "medior/store/_generated";
import { LogicalOp } from "medior/utils";

@model("medior/TagSearch")
export class TagSearch extends ExtendedModel(_TagSearch, {}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  setCountOp(val: LogicalOp | "") {
    this.count.logOp = val;
  }

  @modelAction
  setCountValue(val: number) {
    this.count.value = val;
  }

  @modelAction
  toggleRegExMode() {
    this.regExMode =
      this.regExMode === "any" ? "hasRegEx" : this.regExMode === "hasRegEx" ? "hasNoRegEx" : "any";
  }
}
