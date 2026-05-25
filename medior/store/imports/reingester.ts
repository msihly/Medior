import fs from "fs/promises";
import path from "path";
import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import {
  arrayActions,
  Model,
  model,
  modelAction,
  modelFlow,
  objectToMapTransform,
  prop,
} from "mobx-keystone";
import { checkFileExists, extendFileName } from "trabecula/utils/server";
import { FlatFolder, TagToUpsert } from "medior/components";
import { asyncAction, derefMobx, toast } from "medior/utils/client";
import { Fmt, PromiseQueue } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { FileImport, ImportEditorOptions, Sidecar } from ".";

@model("medior/Reingester")
export class Reingester extends Model({
  filePaths: prop<Record<string, string>>(() => ({}))
    .withTransform(objectToMapTransform<string>())
    .withSetter(),
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

    reaction(
      () => this.isOpen,
      () => !this.isOpen && this.reset(),
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addTagsToUpsert(folderName: string, tagsToUpsert: TagToUpsert[]) {
    const folder = this.flatFolderHierarchy.get(folderName);
    if (!folder) throw new Error(`No such folder: ${folderName}`);
    for (const tag of tagsToUpsert) {
      if (folder.tags.find((t) => t.label === tag.label)) continue;
      folder.tags.push(...tagsToUpsert);
      this.flatTagsToUpsert.push(...tagsToUpsert);
    }
  }

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
    this.filePaths = new Map();
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

  @modelAction
  setTagsToUpsert(folderName: string, tagsToUpsert: TagToUpsert[]) {
    const folder = this.flatFolderHierarchy.get(folderName);
    if (!folder) throw new Error(`No such folder: ${folderName}`);
    folder.tags = tagsToUpsert.map(derefMobx);
  }

  /* ---------------------------- ASYNC ACTIONS ---------------------------- */
  @modelFlow
  loadDiffusionParams = asyncAction(async () => {
    for (const imp of this.imports) {
      if (imp.extension !== "jpg") continue;

      const paramFileName = path.resolve(extendFileName(imp.path, "txt"));
      if (!this.filePaths.has(paramFileName)) continue;

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
    this.setFilePaths(new Map(filePaths.map((p) => [path.resolve(p), p])));
    this.setIsInitDone(true);
  });

  @modelFlow
  loadSidecar = asyncAction(async () => {
    const queue = new PromiseQueue({ concurrency: 4 });

    const sidecars: { folder?: FlatFolder; imp?: FileImport; paramFileName: string }[] = [];
    for (const imp of this.imports) {
      if (imp.extension === "json") continue;
      queue.add(async () => {
        const paramFileName = extendFileName(imp.path, "json");
        if (await checkFileExists(paramFileName)) sidecars.push({ imp, paramFileName });
      });
    }

    for (const folder of this.flatFolderHierarchy.values()) {
      queue.add(async () => {
        const folderPath = path.dirname(folder.imports[0].path);
        const paramFileName = path.resolve(folderPath, "[[Collection]].json");
        if (await checkFileExists(paramFileName)) sidecars.push({ folder, paramFileName });
      });
    }

    await queue.resolve();
    if (!sidecars.length) return;

    for (const { folder, imp, paramFileName } of sidecars) {
      queue.add(async () => {
        try {
          const params: Sidecar = JSON.parse(await fs.readFile(paramFileName, "utf8"));
          const tags = params.tags;

          if (tags) {
            const tagsToUpsert: TagToUpsert[] = [];
            for (let j = 0; j < tags.length; j++) {
              const t = tags[j];
              if (!t) continue;

              tagsToUpsert.push({
                ...t,
                label: Fmt.decodeHtmlEntities(t.label),
                parentLabels: t.parentLabels?.map(Fmt.decodeHtmlEntities),
              });
            }

            if (tagsToUpsert.length) {
              if (folder) this.addTagsToUpsert(folder.folderName, tagsToUpsert);
              else if (imp) imp.addTagsToUpsert(tagsToUpsert);
              else throw new Error("Invalid sidecar params");
            } else throw new Error("No tagsToUpsert found in sidecar tags");
          }
        } catch (err) {
          console.error("Error reading sidecar:", err);
        }
      });
    }

    await queue.resolve();
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
