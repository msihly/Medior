import fs from "fs/promises";
import path from "path";
import autoBind from "auto-bind";
import { computed } from "mobx";
import {
  arrayActions,
  Model,
  model,
  modelAction,
  modelFlow,
  objectToMapTransform,
  prop,
} from "mobx-keystone";
import { FlatFolder, TagToUpsert } from "medior/components";
import { asyncAction } from "medior/store";
import { extendFileName, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { FileImport, ImportEditorOptions } from ".";

@model("medior/Reingester")
export class Reingester extends Model({
  filePaths: prop<string[]>(() => []).withSetter(),
  flatFolderHierarchy: prop<Record<string, FlatFolder>>(() => ({}))
    .withTransform(objectToMapTransform<FlatFolder>())
    .withSetter(),
  flatTagsToUpsert: prop<TagToUpsert[]>(() => []).withSetter(),
  folderFileIds: prop<{ folder: string; fileIds: string[] }[]>(() => []).withSetter(),
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
  tagIds: prop<string[]>(() => []).withSetter(),
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
  removeCurFolder() {
    const folderName = this.getCurFolder().folderName;
    arrayActions.shift(this.folderFileIds);
    this.flatFolderHierarchy.delete(folderName);
  }

  @modelAction
  reset() {
    this.filePaths = [];
    this.flatFolderHierarchy = new Map();
    this.flatTagsToUpsert = [];
    this.folderFileIds = [];
    this.hasChangesSinceLastScan = false;
    this.imports = [];
    this.isConfirmDiscardOpen = false;
    this.isLoading = false;
    this.isSaving = false;
    this.options = new ImportEditorOptions({});
    this.rootFolderIndex = 0;
    this.rootFolderPath = "";
    this.tagHierarchy = [];
    this.tagIds = [];
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

  @modelFlow
  loadFolder = asyncAction(async () => {
    if (!this.curFolderFileIds?.length) {
      this.setIsOpen(false);
      return;
    }

    this.setIsInitDone(false);
    const res = await trpc.listFile.mutate({ args: { filter: { id: this.curFolderFileIds } } });
    if (!res.success) throw new Error(res.error);

    const filePathMap = new Map(
      [...res.data.items]
        .sort((a, b) => {
          const lengthDiff =
            a.originalPath.split(path.sep).length - b.originalPath.split(path.sep).length;
          if (lengthDiff !== 0) return lengthDiff;
          return a.originalName.localeCompare(b.originalName);
        })
        .map((f) => [f.originalPath, f]),
    );

    const filePaths = [...filePathMap.keys()];
    const rootFolderPath = path.dirname(filePaths[0]);
    const newIndex = rootFolderPath.split(path.sep).length - 1;
    const curIndex = this.rootFolderIndex;
    const rootIndex = curIndex > 0 && curIndex <= newIndex ? curIndex : newIndex;
    this.setRootFolderPath(rootFolderPath);
    this.setRootFolderIndex(rootIndex);

    const imports: FileImport[] = [];
    for (const original of filePathMap.values()) {
      imports.push(
        new FileImport({
          dateCreated: original.dateCreated,
          extension: original.ext,
          fileId: original.id,
          name: original.originalName,
          path: original.originalPath,
          size: original.size,
          status: "PENDING",
        }),
      );
    }

    this.setImports(imports);
    this.setFilePaths(filePaths);
    this.setIsInitDone(true);
  });

  @modelFlow
  reingest = asyncAction(async () => {
    const fileTagIds: { fileId: string; tagIds: string[] }[] = [];
    for (const imp of this.imports) {
      fileTagIds.push({
        fileId: imp.fileId,
        tagIds: [...new Set([...this.tagIds, ...(imp.tagIds ?? [])])],
      });
    }

    const res = await trpc.reingestFolder.mutate({
      collectionTitle: this.getCurFolder().collectionTitle,
      fileTagIds,
    });
    if (!res.success) throw new Error(res.error);

    this.removeCurFolder();
    await this.loadFolder();
    toast.success("Folder reingested");
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get curFolderFileIds() {
    return this.folderFileIds[0]?.fileIds;
  }

  @computed
  get isDisabled() {
    return this.isLoading || this.isSaving;
  }

  @computed
  get rootFolder() {
    return this.rootFolderPath.length && this.rootFolderPath.split(path.sep)[this.rootFolderIndex];
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getCurFolder() {
    return this.flatFolderHierarchy.size > 0 ? [...this.flatFolderHierarchy.values()][0] : null;
  }
}
