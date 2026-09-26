import fs from "fs/promises";
import path from "path";
import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { extendFileName } from "trabecula/utils/server";
import { FlatFolder, TagToUpsert } from "medior/components";
import { asyncAction, derefMobx } from "medior/utils/client";
import { Fmt, mergeTagDefinitions, PromiseQueue } from "medior/utils/common";
import { ImportEditorOptions } from "./editor-options";
import { FileImport } from "./file-import";

export interface Sidecar {
  tags?: TagToUpsert[];
}

const IMPORT_FOLDER_PAGE_SIZE = 20;

@model("medior/ImportEditorStore")
export class ImportEditorStore extends Model({
  flatTagsToUpsert: prop<TagToUpsert[]>(() => []).withSetter(),
  folderPage: prop<number>(0).withSetter(),
  folderPageSize: prop<number>(IMPORT_FOLDER_PAGE_SIZE).withSetter(),
  folderTotalCount: prop<number>(0).withSetter(),
  hasChangesSinceLastScan: prop<boolean>(false).withSetter(),
  importCount: prop<number>(0),
  importSize: prop<number>(0),
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
  visibleFolderNames: prop<string[]>(() => []),
}) {
  allFlatFolderHierarchy = new Map<string, FlatFolder>();
  filePaths = new Map<string, string>();
  imports: ModelCreationData<FileImport>[] = [];

  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => !this.isOpen && this.reset(),
    );

    reaction(
      () => [
        this.options.flattenTo,
        this.options.folderToCollectionMode,
        this.options.folderToTagsMode,
        this.options.useSavedConfigs,
        this.options.withDelimiters,
        this.options.withDiffusionModel,
        this.options.withDiffusionParams,
        this.options.withDiffusionRegExMaps,
        this.options.withDiffusionTags,
        this.options.withFileNameToTags,
        this.options.withFlattenTo,
        this.options.withFolderNameRegEx,
        this.options.withSidecar,
        this.rootFolderIndex,
      ],
      () => {
        if (this.isOpen && this.isInitDone && !this.isDisabled)
          this.setHasChangesSinceLastScan(true);
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addTagsToUpsert(folderName: string, tagsToUpsert: TagToUpsert[]) {
    const folder =
      this.allFlatFolderHierarchy.get(folderName) ?? this.flatFolderHierarchy.get(folderName);
    if (!folder) throw new Error(`No such folder: ${folderName}`);

    folder.tags = mergeTagDefinitions([...folder.tags, ...tagsToUpsert]);
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
    this.flatTagsToUpsert = [];
    this.folderPage = 0;
    this.folderPageSize = IMPORT_FOLDER_PAGE_SIZE;
    this.folderTotalCount = 0;
    this.hasChangesSinceLastScan = false;
    this.imports = [];
    this.importCount = 0;
    this.importSize = 0;
    this.ingestCancelToken++;
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
    this.visibleFolderNames = [];
  }

  @modelAction
  setAllFlatFolderHierarchy(folders: Map<string, FlatFolder>) {
    this.allFlatFolderHierarchy = folders;
    this.folderTotalCount = folders.size;
    this.folderPage = 0;
    this.setVisibleFolderPage();
  }

  @modelAction
  setFilePaths(filePaths: Map<string, string>) {
    this.filePaths = filePaths;
  }

  @modelAction
  setImports(imports: ModelCreationData<FileImport>[]) {
    this.imports = imports;
    this.importCount = imports.length;
    this.importSize = imports.reduce((total, imp) => total + imp.size, 0);
  }

  @modelAction
  setCreatedTagId(tag: Pick<TagToUpsert, "id" | "label">) {
    this.flatTagsToUpsert = this.flatTagsToUpsert.map((candidate) =>
      candidate.label.toLowerCase() === tag.label.toLowerCase()
        ? { ...candidate, id: tag.id, label: tag.label }
        : candidate,
    );
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
    this.setVisibleFolderPage();
  }

  @modelAction
  setVisibleFolderPage() {
    const visibleFolderNames: string[] = [];
    const maxPage = this.folderPageCount - 1;
    const page = Math.min(Math.max(this.folderPage, 0), maxPage);
    const startIndex = page * this.folderPageSize;
    const endIndex = startIndex + this.folderPageSize;
    let idx = 0;

    for (const folderName of this.allFlatFolderHierarchy.keys()) {
      if (idx >= endIndex) break;

      if (idx >= startIndex) visibleFolderNames.push(folderName);

      idx++;
    }

    this.folderPage = page;
    this.visibleFolderNames = visibleFolderNames;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadDiffusionParams = asyncAction(async () => {
    const cancelToken = this.ingestCancelToken;
    const isCancelled = () => !this.isOpen || this.ingestCancelToken !== cancelToken;
    const queue = new PromiseQueue({ concurrency: 4 });
    this.setInitProgressStatus("Reading diffusion parameters");
    this.setInitProgressTotal(this.imports.length);

    for (let idx = 0; idx < this.imports.length; idx++) {
      if (isCancelled()) return;

      if (idx % 128 === 0) {
        await queue.resolve();
        if (isCancelled()) return;

        this.setInitProgressCompleted(idx);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      const imp = this.imports[idx];
      if (imp.extension !== "jpg") continue;

      const paramFileName = path.resolve(extendFileName(imp.path, "txt"));
      if (!this.filePaths.has(paramFileName)) continue;

      queue.add(async () => {
        try {
          if (isCancelled()) return;

          const params = await fs.readFile(paramFileName, { encoding: "utf8" });
          if (isCancelled()) return;
          if (params !== imp.diffusionParams) imp.diffusionParams = params;
        } catch (err) {
          console.error("Error reading diffusion params:", err);
        }
      });
    }

    await queue.resolve();
  });

  @modelFlow
  loadSidecar = asyncAction(
    async ({
      folderPaths,
      imports,
    }: {
      folderPaths: Set<string>;
      imports: ModelCreationData<FileImport>[];
    }) => {
      const cancelToken = this.ingestCancelToken;
      const isCancelled = () => !this.isOpen || this.ingestCancelToken !== cancelToken;
      const queue = new PromiseQueue({ concurrency: 4 });
      let failedCount = 0;
      let firstError: string;
      let queued = 0;

      const readSidecar = async ({
        folder,
        imp,
        paramFileName,
      }: {
        folder?: FlatFolder;
        imp?: ModelCreationData<FileImport>;
        paramFileName: string;
      }) => {
        try {
          if (isCancelled()) return;

          const params: Sidecar = JSON.parse(await fs.readFile(paramFileName, "utf8"));
          if (isCancelled()) return;

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
            }
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            failedCount++;
            firstError ??= `${paramFileName}: ${err.message}`;
          }
        }
      };
      this.setInitProgressStatus("Reading file sidecars");
      this.setInitProgressTotal(imports.length);

      for (let idx = 0; idx < imports.length; idx++) {
        if (isCancelled()) return;

        const imp = imports[idx];

        if (imp.extension !== "json" && folderPaths.has(path.dirname(imp.path))) {
          queue.add(() => readSidecar({ imp, paramFileName: extendFileName(imp.path, "json") }));
          queued++;
        }

        if (idx % 128 === 0) {
          await queue.resolve();
          if (isCancelled()) return;

          this.setInitProgressCompleted(idx);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }

      await queue.resolve();
      if (isCancelled()) return;

      this.setInitProgressStatus("Reading collection sidecars");
      this.setInitProgressCompleted(0);
      this.setInitProgressTotal(this.allFlatFolderHierarchy.size);

      let completed = 0;

      for (const folder of this.allFlatFolderHierarchy.values()) {
        if (isCancelled()) return;

        const folderPath = path.dirname(folder.imports[0].path);
        if (!folderPaths.has(folderPath)) continue;

        queue.add(() =>
          readSidecar({ folder, paramFileName: path.resolve(folderPath, "[[Collection]].json") }),
        );
        if (++queued % 128 === 0) await queue.resolve();

        this.setInitProgressCompleted(++completed);
      }

      await queue.resolve();
      if (!isCancelled() && failedCount)
        throw new Error(`Failed to read ${failedCount} sidecars. ${firstError}`);
    },
  );

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get flatFolderHierarchy() {
    return new Map(
      this.visibleFolderNames.map((folderName) => [
        folderName,
        this.allFlatFolderHierarchy.get(folderName),
      ]),
    );
  }

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
  @modelAction
  private addTagsToImport(imp: ModelCreationData<FileImport>, tagsToUpsert: TagToUpsert[]) {
    imp.tagsToUpsert = mergeTagDefinitions([...(imp.tagsToUpsert ?? []), ...tagsToUpsert]);
  }
}
