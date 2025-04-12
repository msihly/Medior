import fs from "fs/promises";
import path from "path";
import { computed } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "medior/store";
import { extendFileName } from "medior/utils/client";
import { FileImport } from ".";

@model("medior/ImportEditor")
export class ImportEditor extends Model({
  filePaths: prop<string[]>(() => []).withSetter(),
  flattenTo: prop<number>(null).withSetter(),
  imports: prop<FileImport[]>(() => []).withSetter(),
  isInitDone: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(true).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  rootFolderIndex: prop<number>(0).withSetter(),
  rootFolderPath: prop<string>("").withSetter(),
  withFlattenTo: prop<boolean>(false).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  clearValues({ diffusionParams = false, tagIds = false, tagsToUpsert = false } = {}) {
    this.imports.forEach((imp) => {
      if (diffusionParams && imp.diffusionParams?.length) imp.diffusionParams = null;
      if (tagIds && imp.tagIds?.length) imp.tagIds = null;
      if (tagsToUpsert && imp.tagsToUpsert?.length) imp.tagsToUpsert = null;
    });
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
