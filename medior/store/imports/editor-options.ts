import autoBind from "auto-bind";
import { Model, model, modelAction, prop } from "mobx-keystone";
import { FolderToCollMode, FolderToTagsMode } from "medior/components";
import { getConfig } from "medior/utils/client";

@model("medior/ImportEditorOptions")
export class ImportEditorOptions extends Model({
  deleteOnImport: prop<boolean>(false).withSetter(),
  flattenTo: prop<number>(null).withSetter(),
  folderToCollectionMode: prop<FolderToCollMode>("none").withSetter(),
  folderToTagsMode: prop<FolderToTagsMode>("none").withSetter(),
  ignorePrevDeleted: prop<boolean>(false).withSetter(),
  withDelimiters: prop<boolean>(false).withSetter(),
  withDiffusionModel: prop<boolean>(false).withSetter(),
  withDiffusionParams: prop<boolean>(false).withSetter(),
  withDiffusionRegExMaps: prop<boolean>(false).withSetter(),
  withDiffusionTags: prop<boolean>(false).withSetter(),
  withFileNameToTags: prop<boolean>(false).withSetter(),
  withFlattenTo: prop<boolean>(false).withSetter(),
  withFolderNameRegEx: prop<boolean>(false).withSetter(),
  withNewTagsToRegEx: prop<boolean>(false).withSetter(),
  withSidecar: prop<boolean>(false).withSetter(),
}) {
  onInit() {
    autoBind(this);
    this.reset();
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    const config = getConfig();
    this.setDeleteOnImport(config.imports.deleteOnImport);
    this.setFlattenTo(null);
    this.setFolderToCollectionMode(config.imports.folderToCollMode);
    this.setFolderToTagsMode(config.imports.folderToTagsMode);
    this.setIgnorePrevDeleted(config.imports.ignorePrevDeleted);
    this.setWithDelimiters(config.imports.withDelimiters);
    this.setWithDiffusionModel(config.imports.withDiffModel);
    this.setWithDiffusionParams(config.imports.withDiffParams);
    this.setWithDiffusionRegExMaps(config.imports.withDiffRegEx);
    this.setWithDiffusionTags(config.imports.withDiffTags);
    this.setWithFileNameToTags(config.imports.withFileNameToTags);
    this.setWithFlattenTo(false);
    this.setWithFolderNameRegEx(config.imports.withFolderNameRegEx);
    this.setWithNewTagsToRegEx(config.imports.withNewTagsToRegEx);
    this.setWithSidecar(false);
  }

  @modelAction
  toggleFolderToCollection(checked: boolean) {
    this.setFolderToCollectionMode(checked ? "withTag" : "none");
  }

  @modelAction
  toggleFolderToCollWithTag() {
    this.setFolderToCollectionMode(
      this.folderToCollectionMode === "withTag" ? "withoutTag" : "withTag",
    );
  }

  @modelAction
  toggleFolderToTags(checked: boolean) {
    this.setFolderToTagsMode(checked ? "hierarchical" : "none");
  }

  @modelAction
  toggleFolderToTagsCascading() {
    this.setFolderToTagsMode("cascading");
  }

  @modelAction
  toggleFolderToTagsHierarchical() {
    this.setFolderToTagsMode("hierarchical");
  }
}
