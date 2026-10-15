import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, model } from "mobx-keystone";
import { _FileImportBatchSearch } from "medior/store/_generated";

@model("medior/FileImportBatchSearch")
export class FileImportBatchSearch extends ExtendedModel(_FileImportBatchSearch, {}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
  }
}
