import fs from "fs/promises";
import path from "path";
import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import {
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  objectToMapTransform,
  prop,
} from "mobx-keystone";
import { checkFileExists, extendFileName } from "trabecula/utils/server";
import { FlatFolder, TagToUpsert } from "medior/components";
import { asyncAction, derefMobx } from "medior/utils/client";
import { Fmt, PromiseQueue } from "medior/utils/common";
import { ImportEditorOptions } from "./editor-options";
import { FileImport } from "./file-import";

export interface Sidecar {
  tags?: TagToUpsert[];
}

const IMPORT_FOLDER_PAGE_SIZE = 20;

@model("medior/ImportEditorStore")
export class ImportEditorStore extends Model({
  filePaths: prop<Record<string, string>>(() => ({}))
    .withTransform(objectToMapTransform<string>())
    .withSetter(),
  flatFolderHierarchy: prop<Record<string, FlatFolder>>(() => ({}))
    .withTransform(objectToMapTransform<FlatFolder>())
    .withSetter(),
  flatTagsToUpsert: prop<TagToUpsert[]>(() => []).withSetter(),
  folderPage: prop<number>(0).withSetter(),
  folderPageSize: prop<number>(IMPORT_FOLDER_PAGE_SIZE).withSetter(),
  folderTotalCount: prop<number>(0).withSetter(),
  hasChangesSinceLastScan: prop<boolean>(false).withSetter(),
  imports: prop<ModelCreationData<FileImport>[]>(() => []).withSetter(),
  ingestCancelToken: prop<number>(0).withSetter(),
  initProgressCompleted: prop<number>(0).withSetter(),
  initProgressStatus: prop<string>("").withSetter(),
  initProgressTotal: prop<number>(0).withSetter(),
  isConfirmDiscardOpen: prop<boolean>(false).withSetter(),
  isInitDone: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(true).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  options: prop<ImportEditorOptions>(() => new ImportEditorOptions({})),
  rootFolderIndex: prop<number>(0).withSetter(),
  rootFolderPath: prop<string>("").withSetter(),
  saveStatus: prop<string>("").withSetter(),
  tagHierarchy: prop<TagToUpsert[]>(() => []).withSetter(),
}) {
  allFlatFolderHierarchy = new Map<string, FlatFolder>();

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
  cancelInit() {
    this.ingestCancelToken++;
    this.setIsOpen(false);
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
  nextFolderPage() {
    this.setFolderPage(this.folderPage + 1);
    this.setVisibleFolderPage();
  }

  @modelAction
  prevFolderPage() {
    this.setFolderPage(this.folderPage - 1);
    this.setVisibleFolderPage();
  }

  @modelAction
  reset() {
    this.allFlatFolderHierarchy = new Map();
    this.filePaths = new Map();
    this.flatFolderHierarchy = new Map();
    this.flatTagsToUpsert = [];
    this.folderPage = 0;
    this.folderPageSize = IMPORT_FOLDER_PAGE_SIZE;
    this.folderTotalCount = 0;
    this.hasChangesSinceLastScan = false;
    this.imports = [];
    this.ingestCancelToken = 0;
    this.initProgressCompleted = 0;
    this.initProgressStatus = "";
    this.initProgressTotal = 0;
    this.isConfirmDiscardOpen = false;
    this.isLoading = false;
    this.isSaving = false;
    this.options = new ImportEditorOptions({});
    this.rootFolderIndex = 0;
    this.rootFolderPath = "";
    this.saveStatus = "";
    this.tagHierarchy = [];
  }

  @modelAction
  setAllFlatFolderHierarchy(folders: Map<string, FlatFolder>) {
    this.allFlatFolderHierarchy = folders;
    this.folderTotalCount = folders.size;
    this.folderPage = 0;
    this.setVisibleFolderPage();
  }

  @modelAction
  setFolderPageFromPagination(page: number) {
    this.folderPage = page - 1;
    this.setVisibleFolderPage();
  }

  @modelAction
  setTagsToUpsert(folderName: string, tagsToUpsert: TagToUpsert[]) {
    const folder = this.flatFolderHierarchy.get(folderName);
    if (!folder) throw new Error(`No such folder: ${folderName}`);

    folder.tags = tagsToUpsert.map(derefMobx);
  }

  @modelAction
  setVisibleFolderPage() {
    const visibleFolders = new Map<string, FlatFolder>();
    const maxPage = this.folderPageCount - 1;
    const page = Math.min(Math.max(this.folderPage, 0), maxPage);
    const startIndex = page * this.folderPageSize;
    const endIndex = startIndex + this.folderPageSize;
    let idx = 0;

    for (const [folderName, folder] of this.allFlatFolderHierarchy) {
      if (idx >= endIndex) break;

      if (idx >= startIndex) visibleFolders.set(folderName, folder);

      idx++;
    }

    this.folderPage = page;
    this.flatFolderHierarchy = visibleFolders;
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
        if (params !== imp.diffusionParams) imp.diffusionParams = params;
      } catch (err) {
        console.error("Error reading diffusion params:", err);
      }
    }
  });

  @modelFlow
  loadSidecar = asyncAction(async () => {
    const queue = new PromiseQueue({ concurrency: 4 });

    const sidecars: {
      folder?: FlatFolder;
      imp?: ModelCreationData<FileImport>;
      paramFileName: string;
    }[] = [];

    for (const imp of this.imports) {
      if (imp.extension === "json") continue;

      queue.add(async () => {
        const paramFileName = extendFileName(imp.path, "json");
        if (await checkFileExists(paramFileName)) sidecars.push({ imp, paramFileName });
      });
    }

    const folders = this.allFlatFolderHierarchy.size
      ? this.allFlatFolderHierarchy.values()
      : this.flatFolderHierarchy.values();

    for (const folder of folders) {
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

            for (let idx = 0; idx < tags.length; idx++) {
              const tag = tags[idx];
              if (!tag) continue;

              tagsToUpsert.push({
                ...tag,
                label: Fmt.decodeHtmlEntities(tag.label),
                parentLabels: tag.parentLabels?.map(Fmt.decodeHtmlEntities),
              });
            }

            if (tagsToUpsert.length) {
              if (folder) this.addTagsToUpsert(folder.folderName, tagsToUpsert);
              else if (imp) this.addTagsToImport(imp, tagsToUpsert);
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

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get folderPageCount() {
    return Math.max(1, Math.ceil(this.folderTotalCount / this.folderPageSize));
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
  private addTagsToImport(imp: ModelCreationData<FileImport>, tagsToUpsert: TagToUpsert[]) {
    const labels = new Set(imp.tagsToUpsert?.map((tag) => tag.label) ?? []);

    imp.tagsToUpsert = [
      ...(imp.tagsToUpsert ?? []),
      ...tagsToUpsert.filter((tag) => !labels.has(tag.label)),
    ];
  }
}
