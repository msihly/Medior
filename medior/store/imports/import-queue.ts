import fs from "fs/promises";
import path from "path";
import { useEffect, useRef } from "react";
import { ModelCreationData } from "mobx-keystone";
import { dirToFilePaths, makePerfLog } from "trabecula/utils/server";
import { TagSchema } from "medior/server/database";
import { FlatFolder, TagToUpsert } from "medior/components";
import { FileImport, Ingester, Reingester, RootStore, useStores } from "medior/store";
import { derefMobx, toast } from "medior/utils/client";
import {
  dayjs,
  Fmt,
  ImageExt,
  ImportBatchInput,
  mergeTagDefinitions,
  parseDiffParams,
  preferredTagLabel,
  TagRegExMap,
  TagRegExMatcher,
  VideoExt,
} from "medior/utils/common";
import { getConfig, trpc } from "medior/utils/server";
import { getImportTagIndex } from "./import-tag-index";

const DEBUG = false;
const STAT_BATCH_SIZE = 128;
const TAG_LOOKUP_BATCH_SIZE = 256;

class IngestCancelledError extends Error {
  constructor() {
    super("Import preparation cancelled");
    this.name = "IngestCancelledError";
  }
}

const throwIfIngestCancelled = (isCancelled?: () => boolean) => {
  if (isCancelled?.()) throw new IngestCancelledError();
};

export class EditorImportsCache {
  private ancestorLabels = new Map<string, { count: number; label: string }>();
  private lastYield = performance.now();
  private parentTagsCache = new Map<string, string[]>();
  private regExMapsCache = new Map<string, Promise<TagRegExMap[]>>();
  private regExMatcher = new TagRegExMatcher();
  private tagIdCache = new Map<string, TagSchema | null>();
  private tagLabelCache = new Map<string, TagSchema | null>();
  private tagLabelDirectory: Promise<Map<string, string>>;
  public tagsToCreateMap = new Map<string, TagToUpsert>();
  public tagsToEditMap = new Map<string, TagToUpsert>();

  constructor(
    private stores: RootStore,
    private isCancelled?: () => boolean,
    private onProgress?: (status: string, completed: number, total: number) => void,
  ) {
    this.stores = stores;
  }

  async checkpoint() {
    throwIfIngestCancelled(this.isCancelled);

    if (performance.now() - this.lastYield < 8) return;

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throwIfIngestCancelled(this.isCancelled);
    this.lastYield = performance.now();
  }

  async getParentTags(id: string) {
    if (!this.parentTagsCache.has(id)) {
      const tag = await this.getTagById(id);

      this.tagLabelDirectory ??= this.loadTagLabelDirectory();
      await this.tagLabelDirectory;
      this.parentTagsCache.set(
        id,
        (tag?.ancestorIds ?? [])
          .filter((ancestorId) => ancestorId !== id)
          .map((ancestorId) => this.ancestorLabels.get(ancestorId))
          .filter(Boolean)
          .sort((a, b) => b.count - a.count)
          .map((ancestor) => ancestor.label),
      );
    }

    return this.parentTagsCache.get(id);
  }

  async getTagByLabel(label: string) {
    label = label.toLowerCase();

    if (!this.tagLabelCache.has(label)) await this.preloadTagsByLabels([label]);

    return this.tagLabelCache.get(label);
  }

  async getTagById(id: string) {
    if (!this.tagIdCache.has(id)) {
      await this.preloadTagsByIds([id]);
    }

    return this.tagIdCache.get(id);
  }

  setTagByLabel(tag: Pick<TagSchema, "label"> & { id?: string }) {
    if (!tag.id) return;

    const key = tag.label.toLowerCase();
    const previous = this.tagLabelCache.get(key);

    if (!previous || preferredTagLabel(previous.label, tag.label) === tag.label)
      this.tagLabelCache.set(key, tag as TagSchema);

    this.tagIdCache.set(tag.id, tag as TagSchema);
  }

  async preloadTags(tags: Iterable<TagToUpsert>, withRegEx = false) {
    const ids = new Set<string>();
    const labels = new Set<string>();

    for (const root of tags) {
      const pending = [root];

      while (pending.length) {
        await this.checkpoint();

        const tag = pending.pop();

        if (tag.id) ids.add(tag.id);

        labels.add(tag.label);

        for (const label of tag.parentLabels ?? []) labels.add(label);

        for (const child of tag.children ?? []) pending.push(child);
      }
    }

    await this.preloadTagsByLabels([...labels]);

    const matchingStatus = withRegEx ? "Matching tag regex rules" : "Collecting matched tags";

    this.onProgress?.(matchingStatus, 0, labels.size);

    let completed = 0;

    for (const label of labels) {
      await this.checkpoint();

      const tag = this.tagLabelCache.get(label.toLowerCase());

      if (tag) ids.add(tag.id);

      if (withRegEx) {
        for (const id of await this.getTagIdsByRegEx(label)) ids.add(id);
      }

      if (++completed % STAT_BATCH_SIZE === 0)
        this.onProgress?.(matchingStatus, completed, labels.size);
    }

    this.onProgress?.(matchingStatus, labels.size, labels.size);

    await this.preloadTagsByIds([...ids]);
    this.onProgress?.("Preparing ancestor lookups", 0, ids.size);
    completed = 0;

    for (const id of ids) {
      await this.checkpoint();
      await this.getParentTags(id);

      if (++completed % STAT_BATCH_SIZE === 0)
        this.onProgress?.("Preparing ancestor lookups", completed, ids.size);
    }

    this.onProgress?.("Preparing ancestor lookups", ids.size, ids.size);
  }

  async preloadTagsByIds(ids: string[], status = "Resolving matched tags") {
    const missingIds = [...new Set(ids.filter(Boolean))].filter((id) => !this.tagIdCache.has(id));

    if (!missingIds.length) return;

    for (let idx = 0; idx < missingIds.length; idx += TAG_LOOKUP_BATCH_SIZE) {
      await this.checkpoint();
      this.onProgress?.(status, idx, missingIds.length);

      const batch = missingIds.slice(idx, idx + TAG_LOOKUP_BATCH_SIZE);
      const res = await trpc.listImportTags.mutate({ ids: batch });

      if (!res.success) throw new Error(res.error);

      await this.checkpoint();

      const tagsById = new Map(res.data.map((tag) => [tag.id, tag]));

      for (const id of batch) {
        const tag = tagsById.get(id) ?? null;

        this.tagIdCache.set(id, tag);

        if (tag) this.setTagByLabel(tag);
      }

      this.onProgress?.(status, idx + batch.length, missingIds.length);
    }
  }

  async preloadTagsByLabels(labels: string[]) {
    const missingLabels = [
      ...new Set(labels.filter(Boolean).map((label) => label.toLowerCase())),
    ].filter((label) => !this.tagLabelCache.has(label));

    if (!missingLabels.length) return;

    this.tagLabelDirectory ??= this.loadTagLabelDirectory();

    const directory = await this.tagLabelDirectory;
    const ids = new Set<string>();

    for (const label of missingLabels) {
      await this.checkpoint();

      const id = directory.get(label.toLowerCase());

      if (id) ids.add(id);
    }

    await this.preloadTagsByIds([...ids], "Loading matched tag details");

    for (let idx = 0; idx < missingLabels.length; idx++) {
      await this.checkpoint();

      const label = missingLabels[idx];

      this.tagLabelCache.set(
        label,
        this.tagIdCache.get(directory.get(label.toLowerCase())) ?? null,
      );

      if (idx % STAT_BATCH_SIZE === 0)
        this.onProgress?.("Resolving tag labels", idx, missingLabels.length);
    }

    this.onProgress?.("Resolving tag labels", missingLabels.length, missingLabels.length);
  }

  private async loadTagLabelDirectory() {
    this.onProgress?.("Loading tag label directory", 0, 0);

    const index = await getImportTagIndex(this.stores).getDirectory();

    await this.checkpoint();
    this.ancestorLabels = index.ancestorLabels;

    return index.labels;
  }

  async getTagIdsByRegEx(label: string) {
    if (!this.regExMapsCache.has(label))
      this.regExMapsCache.set(
        label,
        this.regExMatcher.match(label, () => this.checkpoint()),
      );

    return (await this.regExMapsCache.get(label)).map((map) => map.tagId);
  }

  async loadRegExMaps() {
    this.regExMatcher = await getImportTagIndex(this.stores).getMatcher(this.onProgress);
    await this.checkpoint();
    this.regExMapsCache.clear();
  }
}

export interface FilePathsToImportsOptions {
  isCancelled?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}

export const dirToFileImports = async (
  dirPath: string,
  options: FilePathsToImportsOptions = {},
) => {
  throwIfIngestCancelled(options.isCancelled);

  const filePaths = await dirToFilePaths(dirPath, makeImportPathFilter());

  throwIfIngestCancelled(options.isCancelled);

  const imports = await filePathsToImports(filePaths, options);

  return { filePaths, imports };
};

const getValidExts = () => {
  const config = getConfig();

  return new Set([...config.file.imageExts, ...config.file.videoExts]);
};

const makeImportPathFilter = () => {
  const validExts = getValidExts();

  return (filePath: string) => {
    const ext = path.extname(filePath).slice(1).toLowerCase();

    return validExts.has(ext as ImageExt | VideoExt) || ext === "json" || ext === "txt";
  };
};

export const filePathsToImports = async (
  filePaths: string[],
  { isCancelled, onProgress }: FilePathsToImportsOptions = {},
): Promise<ModelCreationData<FileImport>[]> => {
  const validExts = getValidExts();
  const imports: ModelCreationData<FileImport>[] = [];

  const validFilePaths = filePaths.filter((filePath) =>
    validExts.has(path.extname(filePath).slice(1).toLowerCase() as ImageExt | VideoExt),
  );

  onProgress?.(0, validFilePaths.length);

  for (let idx = 0; idx < validFilePaths.length; idx += STAT_BATCH_SIZE) {
    throwIfIngestCancelled(isCancelled);
    imports.push(
      ...(
        await Promise.all(
          validFilePaths.slice(idx, idx + STAT_BATCH_SIZE).map(async (filePath) => {
            const stats = await fs.stat(filePath);

            return {
              dateCreated: dayjs(
                Math.min(stats.birthtime.valueOf(), stats.ctime.valueOf(), stats.mtime.valueOf()),
              ).toISOString(),
              extension: path.extname(filePath).slice(1).toLowerCase() as ImageExt | VideoExt,
              name: path.parse(filePath).name,
              path: filePath,
              size: stats.size,
              status: "PENDING",
            };
          }),
        )
      ).filter(Boolean),
    );
    onProgress?.(Math.min(idx + STAT_BATCH_SIZE, validFilePaths.length), validFilePaths.length);
  }

  return imports;
};

export const handleIngest = async ({
  fileList,
  store,
}: {
  fileList: FileList;
  store: Ingester;
}) => {
  const cancelToken = store.ingestCancelToken;

  const isCancelled = () => !store.isOpen || store.ingestCancelToken !== cancelToken;

  const setInitProgress = (status: string, completed = 0, total = 0) => {
    if (isCancelled()) return;

    store.setInitProgressStatus(status);
    store.setInitProgressCompleted(completed);
    store.setInitProgressTotal(total);
  };

  try {
    const { perfLog, perfLogTotal } = makePerfLog("[Ingest]");

    store.setIsInitDone(false);
    store.setIsOpen(true);
    store.setIsLoading(true);
    setInitProgress("Preparing import");

    const [filePaths, folderPaths] = [...fileList]
      .sort((a, b) => {
        const lengthDiff = a.path.split(path.sep).length - b.path.split(path.sep).length;

        if (lengthDiff !== 0) return lengthDiff;

        return a.name.localeCompare(b.name);
      })
      .reduce((acc, cur) => (acc[cur.type === "" ? 1 : 0].push(cur.path), acc), [
        [],
        [],
      ] as string[][]);

    const rootFolderPath = filePaths[0] ? path.dirname(filePaths[0]) : folderPaths[0];
    const initialRootIndex = rootFolderPath.split(path.sep).length - 1;

    store.setRootFolderPath(rootFolderPath);
    store.setRootFolderIndex(initialRootIndex);
    store.setFilePaths(new Map());
    store.setImports([]);
    perfLog("Init");

    let completedFolders = 0;

    setInitProgress("Scanning folders", completedFolders, folderPaths.length);

    const editorPaths = new Set(filePaths);
    const filter = makeImportPathFilter();

    for (let idx = 0; idx < folderPaths.length; idx += 4) {
      const folders = await Promise.all(
        folderPaths.slice(idx, idx + 4).map(async (folderPath) => {
          throwIfIngestCancelled(isCancelled);

          const paths = await dirToFilePaths(folderPath, filter);

          setInitProgress("Scanning folders", ++completedFolders, folderPaths.length);

          return paths;
        }),
      );

      for (const paths of folders) {
        for (const filePath of paths) editorPaths.add(filePath);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    throwIfIngestCancelled(isCancelled);

    const editorFilePaths = [...editorPaths];

    const editorImports = await filePathsToImports(editorFilePaths, {
      isCancelled,
      onProgress: (completed, total) => setInitProgress("Preparing files", completed, total),
    });

    throwIfIngestCancelled(isCancelled);
    perfLog(
      `Created editor file paths and imports (${Fmt.commas(editorFilePaths.length)} paths, ${Fmt.commas(editorImports.length)} imports)`,
    );

    setInitProgress("Opening editor", editorImports.length, editorImports.length);
    store.setFilePaths(new Map(editorFilePaths.map((p) => [path.resolve(p), p])));
    store.setImports(editorImports);
    perfLog("Re-render");

    perfLogTotal("Init done");
    setTimeout(() => {
      store.setIsInitDone(true);
      store.setIsLoading(false);
    }, 0);
  } catch (err) {
    if (err?.name === "IngestCancelledError") return;

    toast.error("Error queuing imports");
    console.error(err);
  } finally {
    store.setInitProgressStatus("");
    store.setInitProgressCompleted(0);
    store.setInitProgressTotal(0);
  }
};

export const handleReingest = async ({
  fileIds,
  store,
}: {
  fileIds: string[];
  store: Reingester;
}) => {
  const cancelToken = store.ingestCancelToken;

  const isCancelled = () => !store.isOpen || store.ingestCancelToken !== cancelToken;

  const setInitProgress = (status: string, completed = 0, total = 0) => {
    if (isCancelled()) return;

    store.setInitProgressStatus(status);
    store.setInitProgressCompleted(completed);
    store.setInitProgressTotal(total);
  };

  try {
    store.setIsInitDone(false);
    store.setIsOpen(true);
    store.setIsLoading(true);
    setInitProgress("Preparing re-import", 0, fileIds.length);

    const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });

    if (!res.success) throw new Error(res.error);

    throwIfIngestCancelled(isCancelled);

    const files = res.data.items;

    setInitProgress("Grouping folders", 0, files.length);

    const folders = new Map<string, string[]>();

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      const folder = path.dirname(file.originalPath);

      if (!folders.has(folder)) folders.set(folder, [file.id]);
      else folders.get(folder).push(file.id);

      setInitProgress("Grouping folders", idx + 1, files.length);
    }

    store.setFolderFileIds(
      [...folders.entries()].map(([folder, fileIds]) => ({ fileIds, folder })),
    );

    setInitProgress("Opening editor", files.length, files.length);
    await store.loadFolder();
  } catch (err) {
    if (err?.name === "IngestCancelledError") return;

    toast.error("Error queuing imports");
    console.error(err);
  } finally {
    store.setInitProgressStatus("");
    store.setInitProgressCompleted(0);
    store.setInitProgressTotal(0);
  }
};

export const useImportEditor = (store: Ingester | Reingester) => {
  const config = getConfig();

  const stores = useStores();

  const cache = useRef<EditorImportsCache>();

  useEffect(() => {
    store.options.reset();
  }, [store]);

  useEffect(() => {
    if (store.isInitDone) scan();
  }, [store.isInitDone]);

  const createFolder = async ({
    fileImport,
    folderName,
  }: {
    fileImport: ModelCreationData<FileImport>;
    folderName: string;
  }): Promise<FlatFolder> => {
    const { perfLog } = makePerfLog("[ImportEditor.createFolder]");

    const savedConfig = store.options.useSavedConfigs
      ? stores.import.getSavedConfigForFolder(folderName)
      : null;

    const originalOptions = store.options.toSavedConfig();

    if (savedConfig) store.options.applySavedConfig(savedConfig.options);

    try {
      const folderTags: TagToUpsert[] = [];

      const folderNameParts = createFolderNameParts(folderName);

      const collectionTitle =
        store.options.folderToCollectionMode !== "none"
          ? (store.options.folderToCollectionMode === "withTag"
              ? folderNameParts.slice()
              : folderNameParts
            ).pop()
          : null;

      const tagLabel = folderNameParts.slice().pop()!;
      const tagParentLabel = folderNameParts.slice(0, -1).pop();

      if (store.options.folderToTagsMode !== "none") {
        if (store.options.folderToTagsMode === "cascading") {
          const labels = store.options.withDelimiters
            ? folderNameParts.flatMap(delimit)
            : folderNameParts;

          for (const label of labels) {
            if (label === collectionTitle) continue;

            const tag = await cache.current.getTagByLabel(label);

            if (!tag && !cache.current.tagsToCreateMap.has(label)) {
              cache.current.tagsToCreateMap.set(label, {
                label,
                withRegEx: store.options.withNewTagsToRegEx,
              });

              folderTags.push({ label });
            } else folderTags.push({ ...tag, label });
          }

          if (DEBUG) perfLog("Parsed cascading tags");
        }

        if (store.options.folderToTagsMode === "hierarchical" && tagLabel) {
          const labels = store.options.withDelimiters
            ? folderNameParts.flatMap(delimit)
            : folderNameParts;

          for (const label of labels) {
            if (label === collectionTitle) continue;

            const tag = await cache.current.getTagByLabel(label);

            const parentLabels = tagParentLabel ? delimit(tagParentLabel) : [];

            folderTags.push({ ...tag, label, parentLabels });
          }

          for (let idx = 0; idx < folderNameParts.length; idx++) {
            const namePart = folderNameParts[idx];

            for (const label of delimit(namePart)) {
              if (label === collectionTitle) continue;

              const tag = await cache.current.getTagByLabel(label);
              const parentLabel = folderNameParts[idx - 1];
              const parentLabels = parentLabel ? delimit(parentLabel) : [];

              if (!tag && !cache.current.tagsToCreateMap.has(label))
                cache.current.tagsToCreateMap.set(label, {
                  label,
                  parentLabels,
                  withRegEx: store.options.withNewTagsToRegEx,
                });
              else if (tag && !cache.current.tagsToEditMap.has(tag.id))
                cache.current.tagsToEditMap.set(tag.id, { ...tag, label, parentLabels });
            }
          }

          if (DEBUG) perfLog("Parsed hierarchical tags");
        }

        if (store.options.withFolderNameRegEx) {
          const existingLabels = new Set(folderTags.map((tag) => tag.label));
          const tagsToPush: TagToUpsert[] = [];

          for (const folderNamePart of folderNameParts) {
            const tagIds = await cache.current.getTagIdsByRegEx(folderNamePart);

            if (!tagIds?.length) continue;

            for (const id of tagIds) {
              const label = (await cache.current.getTagById(id))?.label;

              if (!label) continue;

              if (!existingLabels.has(label)) {
                tagsToPush.push({ id, label });
                existingLabels.add(label);
              }
            }
          }

          folderTags.push(...tagsToPush);

          if (DEBUG) perfLog("Parsed tags from folder name RegEx maps");
        }

        /** Parse tags from collectionTitle via folder regex maps */
        if (collectionTitle && store.options.folderToCollectionMode === "withTag") {
          const collectionTitleTags = await cache.current.getTagIdsByRegEx(collectionTitle);

          if (collectionTitleTags?.length) {
            for (const tagId of collectionTitleTags) {
              const tag = await cache.current.getTagById(tagId);

              if (tag && !folderTags.some((t) => t.label === tag.label)) folderTags.push(tag);
            }
          }
        }
      }

      const tags = await dedupeTags(folderTags);

      if (DEBUG) perfLog("Filtered out duplicate / ancestor tags");

      return {
        collectionTitle,
        folderName,
        folderNameParts,
        imports: [fileImport],
        savedConfigLabel: savedConfig?.label,
        tags,
      };
    } finally {
      if (savedConfig) store.options.applySavedConfig(originalOptions);
    }
  };

  const cloneFileImportSnapshot = (imp: ModelCreationData<FileImport>) =>
    derefMobx("$" in imp ? imp.$ : imp) as ModelCreationData<FileImport>;

  const createFolderHierarchy = async (
    imports: ModelCreationData<FileImport>[],
    perfLog: (str: string) => void,
  ) => {
    const folderMap = new Map<string, FlatFolder>();

    for (let idx = 0; idx < imports.length; idx++) {
      await cache.current.checkpoint();

      const imp = imports[idx];
      const folderName = path.dirname(imp.path);
      const folderInMap = folderMap.get(folderName);

      if (folderInMap) folderInMap.imports.push(imp);
      else {
        const folder = await createFolder({ fileImport: imp, folderName });

        folderMap.set(folderName, folder);

        if (DEBUG) perfLog(`Created folder #${folderMap.size}`);
      }

      if (imp.tagsToUpsert)
        imp.tagsToUpsert.forEach((tag) => cache.current.tagsToCreateMap.set(tag.label, tag));

      if (DEBUG) perfLog(`Parsed import #${idx + 1} / ${imports.length}`);
    }

    if (DEBUG) perfLog("Parsed flat folder hierarchy");

    const sortedFolderMap = new Map(
      [...folderMap.entries()].sort(
        (a, b) => a[1].folderNameParts.length - b[1].folderNameParts.length,
      ),
    );

    if (DEBUG) perfLog("Sorted flat folder hierarchy");

    return sortedFolderMap;
  };

  const createFolderNameParts = (folderName: string, options = store.options.toSavedConfig()) => {
    const depth = options.withFlattenTo ? store.rootFolderIndex + options.flattenTo : undefined;

    return folderName
      .split(path.sep)
      .slice(store.rootFolderIndex, depth)
      .map(Fmt.decodeHtmlEntities)
      .filter((part, idx, arr) => arr.indexOf(part) === idx);
  };

  const createFolderTagIds = async (folder: FlatFolder) => {
    const imports: ImportBatchInput["imports"] = [];

    for (const imp of folder.imports) {
      await cache.current.checkpoint();

      const tagIds = await getIdsFromTags(imp.tagsToUpsert, imp.tagIds);
      const fileImport = { ...imp };
      delete fileImport.tagsToUpsert;
      imports.push({ ...fileImport, tagIds });
    }

    const tagIds = await getIdsFromTags(folder.tags);

    return { imports, tagIds };
  };

  const createImportBatches = async (isCancelled?: () => boolean) => {
    const importBatches: ImportBatchInput[] = [];
    const folders = [...store.allFlatFolderHierarchy.values()];

    store.setInitProgressCompleted(0);
    store.setInitProgressTotal(folders.length);

    for (let idx = 0; idx < folders.length; idx++) {
      throwIfIngestCancelled(isCancelled);

      const folder = folders[idx];
      const { imports, tagIds } = await createFolderTagIds(folder);

      const savedConfig = store.options.useSavedConfigs
        ? stores.import.getSavedConfigForFolder(folder.folderName)
        : null;

      importBatches.push({
        collectionSourceFolderPath: folder.collectionTitle ? folder.folderName : null,
        collectionTitle: folder.collectionTitle,
        deleteOnImport: store.options.deleteOnImport || !!savedConfig?.options.deleteOnImport,
        ignorePrevDeleted:
          savedConfig?.options.ignorePrevDeleted ?? store.options.ignorePrevDeleted,
        imports,
        rootFolderPath: folder.folderName
          .split(path.sep)
          .slice(0, store.rootFolderIndex + 1)
          .join(path.sep),
        tagIds,
      });

      store.setInitProgressCompleted(idx + 1);
    }

    return importBatches;
  };

  const createTagsToUpsert = async (tags: TagToUpsert[], perfLog: (str: string) => void) => {
    const tagsToUpsertMap = new Map<string, TagToUpsert>();

    const tagsToReplace = mergeTagDefinitions([
      ...tags,
      ...cache.current.tagsToCreateMap.values(),
      ...cache.current.tagsToEditMap.values(),
    ]);

    for (const t of tagsToReplace) {
      await cache.current.checkpoint();

      const replacedTags = store.options.withFolderNameRegEx ? await replaceTagsFromRegEx(t) : [t];

      for (const tag of replacedTags) {
        const existing = tag.id ? null : await cache.current.getTagByLabel(tag.label);

        tagsToUpsertMap.set(
          tag.label,
          existing
            ? {
                ...tag,
                category: tag.category ?? existing.category,
                count: existing.count,
                id: existing.id,
                label: preferredTagLabel(existing.label, tag.label),
              }
            : tag,
        );
      }
    }

    if (DEBUG) perfLog("Parsed flat tags to upsert");

    return await dedupeTags(mergeTagDefinitions([...tagsToUpsertMap.values()]));
  };

  const dedupeTags = async (folderTags: TagToUpsert[]) => {
    const ancestorLabels = new Set<string>();
    const processedTags = new Map<string, TagToUpsert[]>();

    for (const tag of mergeTagDefinitions(folderTags)) {
      await cache.current.checkpoint();

      const parentLabels = new Set([
        ...(tag.parentLabels ?? []),
        ...(tag.id ? await cache.current.getParentTags(tag.id) : []),
      ]);

      parentLabels.forEach((parentLabel) => ancestorLabels.add(parentLabel.toLowerCase()));

      if (!ancestorLabels.has(tag.label.toLowerCase())) {
        const tagsToPush = store.options.withFolderNameRegEx
          ? await replaceTagsFromRegEx(tag)
          : [derefMobx(tag)];

        for (const tagToPush of tagsToPush) {
          if (!processedTags.has(tagToPush.label))
            processedTags.set(
              tagToPush.label,
              store.options.withFolderNameRegEx
                ? await replaceTagsFromRegEx(tagToPush)
                : [tagToPush],
            );
        }
      }
    }

    const tagsToUpsert: TagToUpsert[] = [];
    const ids = new Set<string>();
    const labels = new Set<string>();
    const labelsWithoutIds = new Set<string>();

    for (const tags of processedTags.values()) {
      for (const tag of tags) {
        await cache.current.checkpoint();

        if (tag.id ? ids.has(tag.id) || labelsWithoutIds.has(tag.label) : labels.has(tag.label))
          continue;

        if (tag.id) ids.add(tag.id);
        else labelsWithoutIds.add(tag.label);

        labels.add(tag.label);
        tagsToUpsert.push(tag);
      }
    }

    return mergeTagDefinitions(tagsToUpsert);
  };

  const delimit = (str: string) =>
    store.options.withDelimiters
      ? str.split(config.imports.folderDelimiter).map((l) => l.trim())
      : [str];

  const fileToTagsAndDiffParams = async () => {
    const { perfLog } = makePerfLog("[ImportEditor.fileToTagsAndDiffParams]");

    if (!store.options.withDiffusionParams && !store.options.withSidecar) {
      store.clearValues({ diffusionParams: true, tagIds: true, tagsToUpsert: true });

      if (DEBUG) perfLog("Cleared diffParams and tags");
    } else {
      if (store.options.withDiffusionParams) {
        const res = await store.loadDiffusionParams();

        if (!res.success) throw new Error(res.error);

        if (DEBUG) perfLog("Loaded diffusion params");
      }
    }

    /** Create meta tags for diffusion params if not found. */
    const { diffMetaTagsToEdit, originalTag, upscaledTag } = await upsertDiffMetaTags();

    if (DEBUG) perfLog("Upserted diffusion meta tags");

    const tagsToUpsert: TagToUpsert[] = [];
    const hasImportsWithDiff = store.imports.some((imp) => imp.diffusionParams?.length);

    if (hasImportsWithDiff && store.options.withDiffusionModel) {
      const labels = new Set<string>();

      for (const imp of store.imports) {
        await cache.current.checkpoint();

        if (imp.diffusionParams)
          labels.add(`Diff Model: ${parseDiffParams(imp.diffusionParams).model}`);
      }

      await cache.current.preloadTagsByLabels([...labels]);
    }

    const editorImports: ModelCreationData<FileImport>[] = [];
    const matchedIds = new Set<string>();

    store.setInitProgressStatus("Parsing file tags");
    store.setInitProgressTotal(store.imports.length);

    for (const imp of store.imports) {
      await cache.current.checkpoint();

      const fileTagIds: string[] = imp.tagIds ? [...imp.tagIds] : [];

      const fileTagsToUpsert: TagToUpsert[] = imp.tagsToUpsert
        ? [...derefMobx(imp.tagsToUpsert)]
        : [];

      if (store.options.withFileNameToTags) {
        const tagIds = await cache.current.getTagIdsByRegEx(imp.name);

        if (tagIds?.length) fileTagIds.push(...tagIds);

        if (DEBUG) perfLog(`Parsed tag ids from file name via regEx`);
      }

      if (store.options.withDiffusionTags && imp.diffusionParams?.length) {
        const { diffFileTagIds, diffFileTagsToUpsert } = await parseDiffTags({
          diffusionParams: imp.diffusionParams,
          originalTagId: originalTag?.id,
          upscaledTagId: upscaledTag?.id,
        });

        if (DEBUG) perfLog(`Parsed diffusion params for ${imp.name}`);

        fileTagIds.push(...diffFileTagIds);
        fileTagsToUpsert.push(...diffFileTagsToUpsert);
      }

      const tagIds = [...new Set(fileTagIds.filter(Boolean))];

      for (const id of tagIds) matchedIds.add(id);

      if (DEBUG) perfLog(`Parsed tagIds for ${imp.name}`);

      tagsToUpsert.push(...fileTagsToUpsert);

      const updates = { tagIds, tagsToUpsert: fileTagsToUpsert };

      if (DEBUG) perfLog(`Updated file import with tags for ${imp.name}`);

      editorImports.push({
        ...cloneFileImportSnapshot(imp),
        ...updates,
      });

      if (editorImports.length % STAT_BATCH_SIZE === 0)
        store.setInitProgressCompleted(editorImports.length);
    }

    await cache.current.preloadTagsByIds([...matchedIds]);
    store.setInitProgressStatus("Filtering file tag ancestors");
    store.setInitProgressTotal(editorImports.length);

    for (let idx = 0; idx < editorImports.length; idx++) {
      await cache.current.checkpoint();

      const imp = editorImports[idx];
      const ancestors = new Set<string>();
      const existingIds: string[] = [];

      for (const id of imp.tagIds) {
        const tag = await cache.current.getTagById(id);

        if (!tag) continue;

        existingIds.push(id);

        for (const ancestorId of tag.ancestorIds ?? tag.parentIds ?? []) {
          if (ancestorId !== id) ancestors.add(ancestorId);
        }
      }

      imp.tagIds = existingIds.filter((id) => !ancestors.has(id));

      if (idx % STAT_BATCH_SIZE === 0) store.setInitProgressCompleted(idx);
    }

    if (DEBUG) perfLog("Updated editor imports with tags");

    return { diffMetaTagsToEdit, editorImports, fileTagsToUpsert: tagsToUpsert };
  };

  const getIdsFromTags = async (tags: TagToUpsert[] = [], tagIds: string[] = []) => {
    const resolvedIds = new Set(tagIds);

    for (const tag of tags) {
      await cache.current.checkpoint();

      const id = tag.id ?? (await cache.current.getTagByLabel(tag.label))?.id;

      if (id) resolvedIds.add(id);
      else {
        const mappedIds = store.options.withFolderNameRegEx
          ? await cache.current.getTagIdsByRegEx(tag.label)
          : [];

        if (!mappedIds.length) throw new Error(`Failed to resolve import tag: ${tag.label}`);

        for (const mappedId of mappedIds) resolvedIds.add(mappedId);
      }
    }

    return [...resolvedIds].filter(Boolean);
  };

  const parseDiffTags = async ({
    diffusionParams,
    originalTagId,
    upscaledTagId,
  }: {
    diffusionParams: string;
    originalTagId: string;
    upscaledTagId: string;
  }) => {
    const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.parseDiffTags]");

    const diffFileTagIds: string[] = [];
    const diffFileTagsToUpsert: TagToUpsert[] = [];

    const parsedParams = parseDiffParams(diffusionParams);

    if (DEBUG) perfLog(`Parsed diffusion params`);

    if (store.options.withDiffusionRegExMaps) {
      diffFileTagIds.push(...(await cache.current.getTagIdsByRegEx(parsedParams.prompt)));

      if (DEBUG) perfLog(`Parsed tag ids from diffusion params via regEx`);
    }

    if (store.options.withDiffusionModel) {
      const modelTagLabel = `Diff Model: ${parsedParams.model}`;
      const modelTag = await cache.current.getTagByLabel(modelTagLabel);

      if (modelTag) diffFileTagIds.push(modelTag.id);
      else
        diffFileTagsToUpsert.push({
          aliases: [`Model Hash: ${parsedParams.modelHash}`],
          label: modelTagLabel,
          parentLabels: [config.imports.labelDiffModel],
          withRegEx: true,
        });

      if (DEBUG) perfLog(`Parsed model tag from diffusion params`);
    }

    const upscaledTypeTagId = parsedParams.isUpscaled ? upscaledTagId : originalTagId;

    if (upscaledTypeTagId && !diffFileTagIds.includes(upscaledTypeTagId))
      diffFileTagIds.push(upscaledTypeTagId);

    perfLogTotal("Parsed diffusion tags");

    return { diffFileTagIds, diffFileTagsToUpsert };
  };

  const preloadScanTags = async () => {
    const labels = new Set<string>();
    const regexLabels = new Set<string>();
    const folderNames = new Set(store.imports.map((imp) => path.dirname(imp.path)));

    for (const folderName of folderNames) {
      await cache.current.checkpoint();

      const saved = store.options.useSavedConfigs
        ? stores.import.getSavedConfigForFolder(folderName)
        : null;

      const options = { ...store.options.toSavedConfig(), ...saved?.options };
      const parts = createFolderNameParts(folderName, options);

      if (options.folderToTagsMode === "none") continue;

      for (const part of parts) {
        for (const label of options.withDelimiters
          ? part.split(config.imports.folderDelimiter).map((label) => label.trim())
          : [part]) {
          labels.add(label);

          if (options.withFolderNameRegEx) regexLabels.add(label);
        }

        if (options.withFolderNameRegEx || options.folderToCollectionMode === "withTag")
          regexLabels.add(part);
      }
    }

    for (const imp of store.imports) {
      await cache.current.checkpoint();

      if (!imp.tagsToUpsert?.length) continue;

      for (const tag of imp.tagsToUpsert) {
        labels.add(tag.label);

        for (const label of tag.parentLabels ?? []) labels.add(label);
      }
    }

    await cache.current.preloadTagsByLabels([...labels]);

    const ids = new Set<string>();

    for (const label of regexLabels) {
      await cache.current.checkpoint();

      for (const id of await cache.current.getTagIdsByRegEx(label)) ids.add(id);
    }

    await cache.current.preloadTagsByIds([...ids]);
  };

  const replaceTagsFromRegEx = async (_tag: TagToUpsert) => {
    const copy = {
      ...derefMobx(_tag),
      parentLabels: _tag.parentLabels ? [..._tag.parentLabels] : undefined,
    };

    const tags: TagToUpsert[] = [];

    const tagIds = await cache.current.getTagIdsByRegEx(copy.label);

    if (tagIds?.length) {
      for (const tagId of tagIds) {
        const tag = await cache.current.getTagById(tagId);

        if (tag?.label && !copy.parentLabels?.includes(tag.label)) {
          tags.push({
            ...copy,
            category: tag.category,
            id: tagId,
            label:
              tag.label.toLowerCase() === copy.label.toLowerCase()
                ? preferredTagLabel(tag.label, copy.label)
                : tag.label,
            parentLabels: copy.parentLabels?.slice(),
          });
        }
      }
    } else tags.push(copy);

    for (const tag of tags) {
      if (tag.parentLabels) {
        const parentLabels = new Set(tag.parentLabels);
        const resolvedParents: string[] = [];

        for (const label of tag.parentLabels) {
          await cache.current.checkpoint();

          const parentTagIds = await cache.current.getTagIdsByRegEx(label);

          if (parentTagIds?.length) {
            for (const tagId of parentTagIds) {
              const parentLabel = (await cache.current.getTagById(tagId))?.label;

              const hasNewParentLabel =
                parentLabel && parentLabel !== tag.label && !parentLabels.has(parentLabel);

              if (hasNewParentLabel) {
                parentLabels.add(parentLabel);
                resolvedParents.push(parentLabel);
              }
            }
          }

          resolvedParents.push(label);
        }

        tag.parentLabels = resolvedParents;
      }
    }

    return tags;
  };

  const upsertDiffMetaTags = async () => {
    const diffMetaTagsToEdit: TagToUpsert[] = [];
    let originalTag: TagToUpsert;
    let upscaledTag: TagToUpsert;

    if (store.options.withDiffusionTags) {
      const upsertTag = async (label: string, isChild = false): Promise<TagToUpsert> => {
        const existsRes = await stores.tag.getByLabel({ label });

        if (!existsRes.success) throw new Error(existsRes.error);

        let tag: TagSchema = existsRes.data;

        if (!tag) {
          const createRes = await stores.tag.createTag({ label });

          if (!createRes.success) throw new Error(createRes.error);

          tag = createRes.data;
        }

        return {
          id: tag.id,
          label: tag.label,
          parentLabels: isChild ? [config.imports.labelDiff] : [],
        };
      };

      const hasImportsWithDiff = store.imports.some((imp) => imp.diffusionParams?.length);

      if (hasImportsWithDiff) {
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiff));
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiffModel, true));
        originalTag = await upsertTag(config.imports.labelDiffOriginal, true);
        upscaledTag = await upsertTag(config.imports.labelDiffUpscaled, true);
        diffMetaTagsToEdit.push(originalTag, upscaledTag);
      }
    }

    return { diffMetaTagsToEdit, originalTag, upscaledTag };
  };

  const upsertTags = async (perfLog: (logStr: string) => void) => {
    const changedLabels = new Set<string>();

    for (const tag of store.flatTagsToUpsert) {
      await cache.current.checkpoint();

      if (!tag.id) continue;

      const existing = await cache.current.getTagById(tag.id);

      if (existing && existing.label !== tag.label) changedLabels.add(tag.id);

      cache.current.setTagByLabel(tag);
    }

    const tagsToUpsert = store.flatTagsToUpsert.filter(
      (tag) =>
        !tag.id ||
        changedLabels.has(tag.id) ||
        tag.aliases?.length ||
        tag.parentLabels?.length ||
        tag.withRegEx,
    );

    if (tagsToUpsert.length > 0) {
      if (DEBUG) perfLog(`Creating tags: ${Fmt.jstr(tagsToUpsert.filter((t) => !t.id))}`);

      const res = await stores.tag.upsertTags({
        onProgress: (completed, total) => {
          throwIfIngestCancelled(() => !store.isOpen);
          store.setInitProgressCompleted(completed);
          store.setInitProgressTotal(total);
        },
        tagsToUpsert,
      });

      if (!res.success) {
        console.error(res.error);
        toast.error("Failed to create tags");

        throw new Error(res.error);
      }

      res.data.forEach((tag) => cache.current.setTagByLabel(tag));

      if (DEBUG) perfLog("Created tags");
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                   EXPORTS                                  */
  /* -------------------------------------------------------------------------- */
  const getIsCancelled = (cancelToken: number) => {
    return () => !store.isOpen || store.ingestCancelToken !== cancelToken;
  };

  const setSaveProgress = (status: string, completed = 0, total = 0) => {
    store.setSaveStatus(status);
    store.setInitProgressCompleted(completed);
    store.setInitProgressTotal(total);
  };

  const ingest = async () => {
    const isCancelled = getIsCancelled(store.ingestCancelToken);

    try {
      const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.ingest]");

      if (DEBUG) perfLog("START");

      store.setIsSaving(true);
      setSaveProgress("Creating tags");

      await upsertTags(perfLog);
      throwIfIngestCancelled(isCancelled);

      setSaveProgress("Preparing batches");

      const importBatches = await createImportBatches(isCancelled);

      throwIfIngestCancelled(isCancelled);

      setSaveProgress("Queueing files");

      const res = await stores.import.manager.createImportBatches({
        batches: importBatches,
        isCancelled,
        onProgress: (completed, total) => {
          throwIfIngestCancelled(isCancelled);
          setSaveProgress("Queueing files", completed, total);
        },
      });

      if (!res.success) throw new Error(res.error);

      throwIfIngestCancelled(isCancelled);

      if (DEBUG) perfLogTotal("Import batches created");

      toast.success(`Queued ${res.data.count} import batches`);
      store.setIsOpen(false);
      stores.import.manager.setIsOpen(true);
      stores.import.manager.runImporter();
    } catch (err) {
      if (err?.name === "IngestCancelledError") return;

      toast.error("Failed to queue imports");
      console.error(err);
    } finally {
      store.setIsSaving(false);
      store.setSaveStatus("");
      store.setInitProgressCompleted(0);
      store.setInitProgressTotal(0);
    }
  };

  const reingest = async () => {
    const isCancelled = getIsCancelled(store.ingestCancelToken);

    try {
      const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.reingest]");

      if (DEBUG) perfLog("START");

      store.setIsSaving(true);
      setSaveProgress("Creating tags");

      await upsertTags(perfLog);
      throwIfIngestCancelled(isCancelled);

      setSaveProgress("Preparing folder");
      store.options.setDeleteOnImport(false);
      store.options.setIgnorePrevDeleted(false);
      stores.import.reingester.setTagIds(
        (await createFolderTagIds(stores.import.reingester.getCurFolder())).tagIds,
      );

      throwIfIngestCancelled(isCancelled);

      setSaveProgress("Re-importing folder");

      const res = await stores.import.reingester.reingest();

      if (!res.success) throw new Error(res.error);

      throwIfIngestCancelled(isCancelled);

      if (DEBUG) perfLogTotal("Folder reingested");
    } catch (err) {
      if (err?.name === "IngestCancelledError") return;

      toast.error("Failed to re-import folder");
      console.error(err);
    } finally {
      store.setIsSaving(false);
      store.setSaveStatus("");
      store.setInitProgressCompleted(0);
      store.setInitProgressTotal(0);
    }
  };

  const scan = async () => {
    if (store.isSaving) return;

    const cancelToken = store.ingestCancelToken;

    const isCancelled = () => !store.isOpen || store.ingestCancelToken !== cancelToken;

    store.setIsLoading(true);
    store.setInitProgressStatus("Scanning imports");
    store.setInitProgressCompleted(0);
    store.setInitProgressTotal(0);

    setTimeout(async () => {
      try {
        const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.scan]");

        if (DEBUG) perfLog("START");

        cache.current = new EditorImportsCache(stores, isCancelled, (status, completed, total) => {
          if (isCancelled()) return;

          store.setInitProgressStatus(status);
          store.setInitProgressCompleted(completed);
          store.setInitProgressTotal(total);
        });

        await cache.current.checkpoint();

        if (store.options.useSavedConfigs) {
          await stores.import.loadSavedConfigs();
          throwIfIngestCancelled(isCancelled);

          const savedConfigMatch = stores.import.getSavedConfigMatchForFolder(store.rootFolderPath);

          if (
            !store.allFlatFolderHierarchy.size &&
            savedConfigMatch?.config.options.withSidecar != null
          )
            store.options.setWithSidecar(savedConfigMatch.config.options.withSidecar);

          if (savedConfigMatch?.rootFolderPath) {
            store.setRootFolderPath(savedConfigMatch.rootFolderPath);
            store.setRootFolderIndex(savedConfigMatch.rootFolderPath.split(path.sep).length - 1);
          }
        }

        const hasRegExScan =
          store.options.withFileNameToTags ||
          store.options.withFolderNameRegEx ||
          store.options.folderToCollectionMode === "withTag" ||
          (store.options.useSavedConfigs &&
            stores.import.savedConfigs.some(
              (savedConfig) =>
                savedConfig.options.withFolderNameRegEx ||
                savedConfig.options.folderToCollectionMode === "withTag",
            )) ||
          (store.options.withDiffusionParams &&
            store.options.withDiffusionTags &&
            store.options.withDiffusionRegExMaps);

        if (hasRegExScan) await cache.current.loadRegExMaps();

        store.setInitProgressStatus("Loading tags");
        await preloadScanTags();

        if (DEBUG) perfLog("Preloaded scan tags");

        const tagsToUpsert: TagToUpsert[] = [];
        const tagsToUpsertLabels = new Map<string, number>();

        const appendTagsToUpsert = (tags: TagToUpsert[] = []) => {
          for (const tag of tags) {
            const key = tag.label.toLowerCase();
            const index = tagsToUpsertLabels.get(key);

            if (index === undefined) {
              tagsToUpsertLabels.set(key, tagsToUpsert.length);
              tagsToUpsert.push(tag);
            } else if (tagsToUpsert[index] !== tag) {
              tagsToUpsert[index] = mergeTagDefinitions([tagsToUpsert[index], tag])[0];
            }
          }
        };

        /* ---------------------------------- Files --------------------------------- */
        const { diffMetaTagsToEdit, editorImports, fileTagsToUpsert } =
          await fileToTagsAndDiffParams();

        throwIfIngestCancelled(isCancelled);
        diffMetaTagsToEdit.forEach((tag) => cache.current.tagsToEditMap.set(tag.id, tag));
        appendTagsToUpsert(fileTagsToUpsert);

        if (DEBUG) perfLog("Parsed file tags and diffusion params");

        /* --------------------------------- Folders -------------------------------- */
        store.setInitProgressStatus("Grouping folders");

        const folders = await createFolderHierarchy(editorImports, perfLog);

        throwIfIngestCancelled(isCancelled);

        /* -------------------------------- Sidecars -------------------------------- */
        const sidecarFolderPaths = new Set(
          [...folders.keys()].filter((folderPath) => {
            const savedConfig = store.options.useSavedConfigs
              ? stores.import.getSavedConfigForFolder(folderPath)
              : null;

            return savedConfig?.options.withSidecar ?? store.options.withSidecar;
          }),
        );

        if (sidecarFolderPaths.size) {
          store.setAllFlatFolderHierarchy(folders);

          const sidecarRes = await store.loadSidecar({
            folderPaths: sidecarFolderPaths,
            imports: editorImports,
          });

          if (!sidecarRes.success) throw new Error(sidecarRes.error);

          throwIfIngestCancelled(isCancelled);
          await cache.current.checkpoint();
          store.setInitProgressStatus("Resolving sidecar tags");

          const sidecarTags = function* () {
            for (const imp of editorImports) yield* imp.tagsToUpsert ?? [];

            for (const folder of store.allFlatFolderHierarchy.values()) yield* folder.tags;
          };

          await cache.current.preloadTags(sidecarTags(), store.options.withFolderNameRegEx);
          store.setInitProgressCompleted(0);
          store.setInitProgressTotal(0);

          if (DEBUG) perfLog("Loaded sidecar");
        }

        store.setInitProgressStatus("Preparing folder tags");

        for (const folder of folders.values()) {
          await cache.current.checkpoint();

          const dedupedTags = await dedupeTags(folder.tags);

          folder.tags = dedupedTags;

          appendTagsToUpsert(dedupedTags);

          for (const imp of folder.imports) {
            await cache.current.checkpoint();
            appendTagsToUpsert(imp.tagsToUpsert);
          }
        }

        store.setInitProgressStatus("Building folder pages");
        store.setAllFlatFolderHierarchy(folders);

        if (DEBUG) perfLog(`Set flat folder hierarchy (${Fmt.commas(folders.size)} folders)`);

        /* ----------------------------------- Tags ---------------------------------- */
        store.setInitProgressStatus("Preparing import tags");
        store.setInitProgressCompleted(0);
        store.setInitProgressTotal(0);

        const flatTagsToUpsert = await createTagsToUpsert(tagsToUpsert, perfLog);
        const labels = new Set(flatTagsToUpsert.map((t) => t.label.toLowerCase()));

        for (const tag of [...flatTagsToUpsert]) {
          await cache.current.checkpoint();

          for (const parentLabel of tag.parentLabels ?? []) {
            if (labels.has(parentLabel.toLowerCase())) continue;

            const parentTags = store.options.withFolderNameRegEx
              ? await replaceTagsFromRegEx({ label: parentLabel })
              : [{ label: parentLabel }];

            for (const parentTag of parentTags) {
              if (labels.has(parentTag.label.toLowerCase())) continue;

              labels.add(parentTag.label.toLowerCase());

              const existing = await cache.current.getTagByLabel(parentTag.label);

              flatTagsToUpsert.push(
                existing
                  ? {
                      ...parentTag,
                      category: existing.category,
                      count: existing.count,
                      id: existing.id,
                      label: preferredTagLabel(existing.label, parentTag.label),
                    }
                  : parentTag,
              );
            }
          }
        }

        store.setFlatTagsToUpsert(mergeTagDefinitions(flatTagsToUpsert));

        if (DEBUG) perfLog("Set flat tags to upsert");

        store.setIsLoading(false);
        store.setInitProgressStatus("");
        store.setInitProgressCompleted(0);
        store.setInitProgressTotal(0);
        store.setHasChangesSinceLastScan(false);
        perfLogTotal("Scan completed");
      } catch (err) {
        if (err?.name === "IngestCancelledError" || isCancelled()) return;

        toast.error("Failed to scan imports");
        console.error(err);
        store.setIsLoading(false);
        store.setInitProgressStatus("");
        store.setInitProgressCompleted(0);
        store.setInitProgressTotal(0);
      }
    }, 50);
  };

  return { ingest, reingest, scan };
};
