import { model, Model, prop } from "mobx-keystone";
import { FileImport } from ".";
import { computed } from "mobx";

@model("medior/ImportEditor")
export class ImportEditor extends Model({
  filePaths: prop<string[]>(() => []).withSetter(),
  imports: prop<FileImport[]>(() => []).withSetter(),
  isInitDone: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(true).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  rootFolderIndex: prop<number>(0).withSetter(),
  rootFolderPath: prop<string>("").withSetter(),
}) {
  @computed
  get isDisabled() {
    return this.isLoading || this.isSaving;
  }
}
