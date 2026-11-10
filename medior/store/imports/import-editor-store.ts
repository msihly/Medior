import fs from "fs/promises";
import path from "path";
import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { extendFileName } from "trabecula/utils/server";
import { FlatFolder, TagToUpsert } from "medior/components";
import { asyncAction, derefMobx } from "medior/utils/client";
import {
  AudioFileTags,
  chunkArray,
  dayjs,
  FILE_IMPORT_SIDECAR_FIELDS,
  FileImportSidecar,
  FileImportSidecarField,
  FileSidecar,
  FileSidecarCollection,
  Fmt,
  ImportMusicPreview,
  makeSeasonTitle,
  MediaProgramPlan,
  mergeTagDefinitions,
  parseFileMusic,
  PromiseQueue,
  sleep,
} from "medior/utils/common";
import {
  getConfig,
  getIsAudio,
  getNtfsFileIdentity,
  NtfsFileIdentity,
  rpc,
  sortByStoredNtfsIdentity,
} from "medior/utils/server";
import { ImportEditorOptions } from "./editor-options";
import { FileImport } from "./file-import";

export interface Sidecar extends FileSidecar {
  tags?: TagToUpsert[];
}

/** Files each request reads the tags of, so the scan's progress and cancellation follow along. */
const AUDIO_TAG_BATCH_SIZE = 25;

const IMPORT_FOLDER_PAGE_SIZE = 20;

const STAT_BATCH_SIZE = 128;

const isString = (value: unknown): value is string => typeof value === "string";

const isObjectId = (value: unknown) => isString(value) && /^[0-9a-f]{24}$/i.test(value);

/** Sidecars may come from other tools, so values of unexpected shapes are dropped. */
const SIDECAR_VALIDATORS: Record<FileImportSidecarField, (value: any) => boolean> = {
  collections: Array.isArray,
  dateCreated: (value) => isString(value) && dayjs(value).isValid(),
  diffusionParams: isString,
  isArchived: (value) => typeof value === "boolean",
  originalName: isString,
  rating: (value) => Number.isInteger(value) && value >= 0 && value <= 9,
  timestamps: (value) =>
    Array.isArray(value) &&
    value.every((timestamp) => isString(timestamp?.id) && Array.isArray(timestamp.pairs)),
  transcription: (value) => isString(value?.text) && Array.isArray(value.segments),
};

const getValidCollections = (collections: any[]): FileSidecarCollection[] =>
  collections
    .filter(
      (collection) =>
        isObjectId(collection?.id) && Number.isInteger(collection.index) && collection.index >= 0,
    )
    .map(({ id, index }) => ({ id, index }));

const getValidIds = (ids: unknown): string[] => (Array.isArray(ids) ? ids.filter(isObjectId) : []);

@model("medior/ImportEditorStore")
export class ImportEditorStore extends Model({
  flatTagsToUpsert: prop<TagToUpsert[]>(() => []).withSetter(),
  folderPage: prop<number>(0),
  folderPageSize: prop<number>(IMPORT_FOLDER_PAGE_SIZE),
  folderTotalCount: prop<number>(0),
  hasChangesSinceLastScan: prop<boolean>(false).withSetter(),
  importCount: prop<number>(0),
  importSize: prop<number>(0),
  ingestCancelToken: prop<number>(0),
  initProgressCompleted: prop<number>(0).withSetter(),
  initProgressStatus: prop<string>("").withSetter(),
  initProgressTotal: prop<number>(0).withSetter(),
  isConfirmDiscardOpen: prop<boolean>(false).withSetter(),
  isInitDone: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(true).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  mediaPrograms: prop<MediaProgramPlan[]>(() => []).withSetter(),
  options: prop<ImportEditorOptions>(() => new ImportEditorOptions({})),
  rootFolderIndex: prop<number>(0).withSetter(),
  rootFolderPath: prop<string>("").withSetter(),
  saveStatus: prop<string>("").withSetter(),
  /** The root level the import started from, kept when a saved config moves the root above it. */
  sourceRootIndex: prop<number>(0).withSetter(),
  visibleFolderNames: prop<string[]>(() => []),
}) {
  allFlatFolderHierarchy = new Map<string, FlatFolder>();
  /** Tags read by earlier scans while the editor is open, so rescans only read new files. */
  audioTags = new Map<string, AudioFileTags>();
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
        this.options.ignoreMusicAlbumTags,
        this.options.useSavedConfigs,
        this.options.withDelimiters,
        this.options.withDiffusionModel,
        this.options.withDiffusionParams,
        this.options.withDiffusionRegExMaps,
        this.options.withDiffusionTags,
        this.options.withFileNameToTags,
        this.options.withFlattenTo,
        this.options.withFolderNameRegEx,
        this.options.withMediaPrograms,
        this.options.withMusic,
        this.options.withMusicFeaturedArtists,
        this.options.withMusicFileNames,
        this.options.withSidecar,
        this.options.subtitleMode,
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
  private addSidecarToImport(imp: ModelCreationData<FileImport>, sidecar: Sidecar) {
    const fields = FILE_IMPORT_SIDECAR_FIELDS.filter((field) =>
      SIDECAR_VALIDATORS[field](sidecar[field]),
    );
    const tagIds = getValidIds(sidecar.tagIds);

    if (tagIds.length) imp.tagIds = [...new Set([...(imp.tagIds ?? []), ...tagIds])];

    if (fields.length)
      imp.sidecar = Object.fromEntries(
        fields.map((field) => [
          field,
          field === "collections" ? getValidCollections(sidecar.collections) : sidecar[field],
        ]),
      ) as FileImportSidecar;
  }

  @modelAction
  private addTagsToImport(imp: ModelCreationData<FileImport>, tagsToUpsert: TagToUpsert[]) {
    imp.tagsToUpsert = mergeTagDefinitions([...(imp.tagsToUpsert ?? []), ...tagsToUpsert]);
  }

  @modelAction
  private setMusicPreviews(
    previews: { imp: ModelCreationData<FileImport>; musicPreview: ImportMusicPreview }[],
  ) {
    for (const { imp, musicPreview } of previews) imp.musicPreview = musicPreview;
  }

  @modelAction
  addTagsToUpsert(folderName: string, tagsToUpsert: TagToUpsert[]) {
    const folder =
      this.allFlatFolderHierarchy.get(folderName) ?? this.flatFolderHierarchy.get(folderName);

    if (!folder) throw new Error(`No such folder: ${folderName}`);

    folder.tags = mergeTagDefinitions([...folder.tags, ...tagsToUpsert]);
  }

  @modelAction
  cacheAudioTags(results: AudioFileTags[]) {
    for (const result of results) this.audioTags.set(result.path, result);
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
  reset() {
    this.allFlatFolderHierarchy = new Map();
    this.audioTags = new Map();
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
    this.mediaPrograms = [];
    this.options = new ImportEditorOptions({});
    this.rootFolderIndex = 0;
    this.rootFolderPath = "";
    this.saveStatus = "";
    this.sourceRootIndex = 0;
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
  setCreatedTagId(tag: Pick<TagToUpsert, "id" | "label">) {
    this.flatTagsToUpsert = this.flatTagsToUpsert.map((candidate) =>
      candidate.label.toLowerCase() === tag.label.toLowerCase()
        ? { ...derefMobx(candidate), id: tag.id, label: tag.label }
        : candidate,
    );
  }

  @modelAction
  setFilePaths(filePaths: Map<string, string>) {
    this.filePaths = filePaths;
  }

  @modelAction
  setFolderPageFromPagination(page: number) {
    this.folderPage = page - 1;
    this.setVisibleFolderPage();
  }

  @modelAction
  setImports(imports: ModelCreationData<FileImport>[]) {
    this.imports = imports;
    this.importCount = imports.length;
    this.importSize = imports.reduce((total, imp) => total + imp.size, 0);
  }

  /** Default program fields chosen in the options apply to every detected program. */
  @modelAction
  setMediaProgramDefaults(
    updates: Partial<Pick<MediaProgramPlan, "language" | "medium" | "type">>,
  ) {
    // Programs that already exist keep their saved classification unless edited individually.
    this.mediaPrograms.forEach((plan) => {
      if (!plan.existingId) Object.assign(plan, updates);
    });
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

  @modelAction
  updateMediaProgram(folderPath: string, updates: Partial<MediaProgramPlan>) {
    const plan = this.getMediaProgram(folderPath);

    if (plan) Object.assign(plan, updates);
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
        await sleep(0);
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

  /**
   * Previews the music each new audio file's import would read with the Music options, reading the
   * files no earlier scan read one after another in disk order, so a hard drive doesn't seek between
   * them. Nothing is read with Music off, and re-imported files keep the music they have.
   */
  @modelFlow
  loadMusicPreviews = asyncAction(async (imports: ModelCreationData<FileImport>[]) => {
    const cancelToken = this.ingestCancelToken;

    const isCancelled = () => !this.isOpen || this.ingestCancelToken !== cancelToken;

    const options = this.options.musicOptions;
    const audioImports = options
      ? imports.filter((imp) => !imp.fileId && getIsAudio(imp.extension))
      : [];
    const unreadPaths = [...new Set(audioImports.map((imp) => imp.path))].filter(
      (filePath) => !this.audioTags.has(filePath),
    );

    if (unreadPaths.length) {
      const identities = new Map<string, Partial<NtfsFileIdentity>>();
      let completed = 0;

      this.setInitProgressStatus("Reading music tags");
      this.setInitProgressCompleted(0);
      this.setInitProgressTotal(unreadPaths.length);

      for (const paths of chunkArray(unreadPaths, STAT_BATCH_SIZE)) {
        if (isCancelled()) return;

        await Promise.all(
          paths.map(async (filePath) => {
            try {
              identities.set(filePath, await getNtfsFileIdentity(filePath));
            } catch {
              // A file that can't be found is read last, where the read reports why.
              identities.set(filePath, {});
            }
          }),
        );
      }

      const orderedPaths = sortByStoredNtfsIdentity(unreadPaths, (filePath) =>
        identities.get(filePath),
      );

      for (const paths of chunkArray(orderedPaths, AUDIO_TAG_BATCH_SIZE)) {
        if (isCancelled()) return;

        const res = await rpc.listAudioFileTags({ paths });
        if (!res.success) throw new Error(res.error);

        completed += paths.length;
        this.cacheAudioTags(res.data);
        this.setInitProgressCompleted(completed);
      }
    }

    if (isCancelled()) return;

    const settings = getConfig().music;

    this.setMusicPreviews(
      audioImports.map((imp) => {
        const tags = this.audioTags.get(imp.path);

        const readMusic = (withFileNames: boolean) =>
          tags.error
            ? null
            : parseFileMusic({
                // The import names the file as its sidecar does, when it has one.
                fileName: imp.sidecar?.originalName ?? imp.name,
                hasCover: tags.hasCover,
                options: { ...options, withFileNames },
                settings,
                tagSets: tags.musicTags,
              });

        // Read again without the name, to tell what the name added.
        const music = readMusic(options.withFileNames);
        const tagMusic = readMusic(false);

        return {
          imp,
          musicPreview: {
            error: tags.error,
            isFromName:
              !!music && (music.artist !== tagMusic?.artist || music.title !== tagMusic?.title),
            music,
          },
        };
      }),
    );
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

          if (imp) this.addSidecarToImport(imp, params);
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
          await sleep(0);
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

  /**
   * Programs are grouped from the editor's root, but never from above the folders the import
   * started from, such as a saved config's root.
   */
  @computed
  get programRootIndex() {
    return Math.max(this.rootFolderIndex, this.sourceRootIndex);
  }

  @computed
  get rootFolder() {
    return this.rootFolderPath.length && this.rootFolderPath.split(path.sep)[this.rootFolderIndex];
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  /** A folder's collection title, or for a program's season, its title after the program's name. */
  getFolderCollectionTitle(folder: FlatFolder) {
    const plan = folder.mediaProgram && this.getMediaProgram(folder.mediaProgram.folderPath);

    return plan
      ? makeSeasonTitle(plan.name, folder.mediaProgram.seasonLabel)
      : folder.collectionTitle;
  }

  getMediaProgram(folderPath: string) {
    return this.mediaPrograms.find((program) => program.folderPath === folderPath);
  }
}
