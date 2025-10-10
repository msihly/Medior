import fs from "fs/promises";
import path from "path";
import autoBind from "auto-bind";
import { computed } from "mobx";
import { Model, model, modelAction, modelFlow, objectToMapTransform, prop } from "mobx-keystone";
import { FlatFolder, TagToUpsert } from "medior/components";
import { asyncAction } from "medior/store";
import { extendFileName } from "medior/utils/client";
import { FileImport, ImportEditorOptions } from ".";

@model("medior/Ingester")
export class Ingester extends Model({
  filePaths: prop<string[]>(() => []).withSetter(),
  flatFolderHierarchy: prop<Record<string, FlatFolder>>(() => ({}))
    .withTransform(objectToMapTransform<FlatFolder>())
    .withSetter(),
  flatTagsToUpsert: prop<TagToUpsert[]>(() => []).withSetter(),
  hasChangesSinceLastScan: prop<boolean>(false).withSetter(),
  imports: prop<FileImport[]>(() => []).withSetter(),
  isConfirmDiscardOpen: prop<boolean>(false).withSetter(),
  isInitDone: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(true).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  options: prop<ImportEditorOptions>(() => new ImportEditorOptions({})),
  rootFolderIndex: prop<number>(0).withSetter(),
  rootFolderPath: prop<string>("").withSetter(),
  tagHierarchy: prop<TagToUpsert[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  clearValues({ diffusionParams = false, tagIds = false, tagsToUpsert = false } = {}) {
    this.imports.forEach((imp) => {
      if (diffusionParams && imp.diffusionParams?.length) imp.diffusionParams = null;
      if (tagIds && imp.tagIds?.length) imp.tagIds = null;
      if (tagsToUpsert && imp.tagsToUpsert?.length) imp.tagsToUpsert = null;
    });
  }

  @modelAction
  reset() {
    this.filePaths = [];
    this.flatFolderHierarchy = new Map();
    this.flatTagsToUpsert = [];
    this.hasChangesSinceLastScan = false;
    this.imports = [];
    this.isConfirmDiscardOpen = false;
    this.isLoading = false;
    this.isSaving = false;
    this.options = new ImportEditorOptions({});
    this.rootFolderIndex = 0;
    this.rootFolderPath = "";
    this.tagHierarchy = [];
  }

  /* ---------------------------- ASYNC ACTIONS ---------------------------- */
  @modelFlow
  loadDiffusionParams = asyncAction(async () => {
    const editorFilePathMap = new Map(this.filePaths.map((p) => [path.resolve(p), p]));

    for (const imp of this.imports) {
      if (imp.extension !== "jpg") continue;

      const paramFileName = path.resolve(extendFileName(imp.path, "txt"));
      if (!editorFilePathMap.has(paramFileName)) continue;

      try {
        const params = await fs.readFile(paramFileName, { encoding: "utf8" });
        imp.setDiffusionParams(params);
      } catch (err) {
        console.error("Error reading diffusion params:", err);
      }
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get isDisabled() {
    return this.isLoading || this.isSaving;
  }

  @computed
  get rootFolder() {
    return this.rootFolderPath.length && this.rootFolderPath.split(path.sep)[this.rootFolderIndex];
  }
}
