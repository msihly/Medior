import autoBind from "auto-bind";
import { Model, model, modelAction, prop } from "mobx-keystone";
import { FolderToCollMode, FolderToTagsMode } from "medior/components";
import { derefMobx } from "medior/utils/client";
import { getConfig } from "medior/utils/server";

@model("medior/ImportEditorOptions")
export class ImportEditorOptions extends Model({
  deleteOnImport: prop<boolean>(false).withSetter(),
  flattenTo: prop<number>(null).withSetter(),
  folderToCollectionMode: prop<FolderToCollMode>("none").withSetter(),
  folderToTagsMode: prop<FolderToTagsMode>("none").withSetter(),
  ignorePrevDeleted: prop<boolean>(false).withSetter(),
  useSavedConfigs: prop<boolean>(true).withSetter(),
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
  applySavedConfig(config: Partial<ReturnType<this["toSavedConfig"]>>) {
    Object.entries(config).forEach(([key, value]) => {
      if (key in this) this[key] = value;
    });
  }

  @modelAction
  reset() {
    const config = getConfig();
    this.setDeleteOnImport(config.imports.deleteOnImport);
    this.setFlattenTo(null);
    this.setFolderToCollectionMode(config.imports.folderToCollMode);
    this.setFolderToTagsMode(config.imports.folderToTagsMode);
    this.setIgnorePrevDeleted(config.imports.ignorePrevDeleted);
    this.setUseSavedConfigs(true);
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

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  toSavedConfig() {
    return derefMobx({
      deleteOnImport: this.deleteOnImport,
      flattenTo: this.flattenTo,
      folderToCollectionMode: this.folderToCollectionMode,
      folderToTagsMode: this.folderToTagsMode,
      ignorePrevDeleted: this.ignorePrevDeleted,
      withDelimiters: this.withDelimiters,
      withDiffusionModel: this.withDiffusionModel,
      withDiffusionParams: this.withDiffusionParams,
      withDiffusionRegExMaps: this.withDiffusionRegExMaps,
      withDiffusionTags: this.withDiffusionTags,
      withFileNameToTags: this.withFileNameToTags,
      withFlattenTo: this.withFlattenTo,
      withFolderNameRegEx: this.withFolderNameRegEx,
      withNewTagsToRegEx: this.withNewTagsToRegEx,
      withSidecar: this.withSidecar,
    });
  }
}
