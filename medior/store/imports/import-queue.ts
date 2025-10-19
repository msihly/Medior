import fs from "fs/promises";
import path from "path";
import { useEffect, useRef } from "react";
import md5File from "md5-file";
import { ModelCreationData } from "mobx-keystone";
import { CreateImportBatchesInput, FileSchema, TagSchema } from "medior/server/database";
import { FlatFolder, TagToUpsert } from "medior/components";
import { FileImport, Ingester, Reingester, RootStore, Tag, useStores } from "medior/store";
import {
  checkFileExists,
  copyFile,
  deleteFile,
  extendFileName,
  genFileInfo,
  getAvailableFileStorage,
  getConfig,
  getIsRemuxable,
  toast,
} from "medior/utils/client";
import { dayjs, handleErrors, jstr, parseDiffParams } from "medior/utils/common";
import { dirToFilePaths, makePerfLog, remux, trpc } from "medior/utils/server";

type RegExMap = { regEx: RegExp; tagId: string };

const DEBUG = false;

let targetDir: string;
let targetDirBytesLeft: number;

export class FileImporter {
  private perfLog: (msg: string) => void;
  private perfLogTotal: (msg: string) => void;

  private dateCreated: string;
  private deleteOnImport: boolean;
  private diffParams: string;
  private ext: string;
  private file: FileSchema;
  private hash: string;
  private ignorePrevDeleted: boolean;
  private isDuplicate: boolean;
  private isPrevDeleted: boolean;
  private originalHash: string;
  private originalName: string;
  private originalPath: string;
  private size: number;
  private tagIds: string[];
  private withRemux: boolean;

  constructor(args: {
    dateCreated?: string;
    deleteOnImport: boolean;
    ext: string;
    ignorePrevDeleted: boolean;
    originalName: string;
    originalPath: string;
    size: number;
    tagIds: string[];
    withRemux: boolean;
  }) {
    (this.dateCreated = args.dateCreated ?? dayjs().toISOString()),
      (this.deleteOnImport = args.deleteOnImport);
    this.ext = args.ext;
    this.ignorePrevDeleted = args.ignorePrevDeleted;
    this.originalName = args.originalName;
    this.originalPath = args.originalPath;
    this.size = args.size;
    this.tagIds = args.tagIds;
    this.withRemux = args.withRemux;

    const perf = makePerfLog("[FileImporter]");
    this.perfLog = (msg) => DEBUG && perf.perfLog(msg);
    this.perfLogTotal = (msg) => DEBUG && perf.perfLogTotal(msg);
  }

  private checkHash = async () => {
    const res = await trpc.checkFileImportHashes.mutate({ hash: this.hash });
    if (!res.success) throw new Error(res.error);
    this.file = res.data.file;
    this.isDuplicate = res.data.isDuplicate;
    this.isPrevDeleted = res.data.isPrevDeleted;
    this.perfLog(`isDuplicate: ${this.isDuplicate}, isPrevDeleted: ${this.isPrevDeleted}`);
  };

  private copyFile = async () => {
    const fileExistsAtPath = await checkFileExists(this.getFilePath());
    this.perfLog(`File exists at path: ${fileExistsAtPath}`);

    if (!fileExistsAtPath) {
      await copyFile(this.getDirPath(), this.originalPath, this.getFilePath());
      this.perfLog("Copied file");
    }

    if (this.deleteOnImport) await this.deleteOriginal();
  };

  private createFileSchema = async (file?: FileSchema) => {
    const res = await trpc.importFile.mutate({
      ...(await genFileInfo({ file, filePath: this.getFilePath(), hash: this.hash })),
      dateCreated: this.dateCreated,
      diffusionParams: this.diffParams,
      originalHash: this.originalHash,
      originalName: this.originalName,
      originalPath: this.originalPath,
      path: this.getFilePath(),
      size: this.size,
      tagIds: this.tagIds,
    });
    if (!res.success) throw new Error(res.error);
    this.perfLog("Imported file");
    return res.data;
  };

  private deleteOriginal = async () => {
    await deleteFile(this.originalPath, this.getFilePath());
    this.perfLog("Deleted original file");

    if (this.diffParams?.length > 0) {
      await deleteFile(extendFileName(this.originalPath, "txt"));
      this.perfLog("Deleted diffusion params file");
    }
  };

  private getIsIgnored = () => {
    return this.isPrevDeleted && this.ignorePrevDeleted;
  };

  private getDirPath = () =>
    `${targetDir}\\${this.hash.substring(0, 2)}\\${this.hash.substring(2, 4)}`;

  private getFilePath = () => `${this.getDirPath()}\\${this.hash}.${this.ext}`;

  private hashFile = async (filePath: string) => {
    this.hash = await md5File(path.toNamespacedPath(filePath));
    this.perfLog(`Hashed file: ${this.hash}`);
  };

  private remux = async () => {
    const remuxed = await remux(this.originalPath, targetDir);
    if (this.deleteOnImport) await deleteFile(this.originalPath);
    this.perfLog(`Remuxed to MP4: ${remuxed.path}`);
    this.ext = "mp4";
    this.hash = remuxed.hash;
  };

  private setTargetDir = async () => {
    this.perfLog(`Available bytes: ${targetDirBytesLeft}. File bytes: ${this.size}.`)

    if (targetDirBytesLeft - 500000 > this.size) {
      this.perfLog(
        `Re-used target dir: ${targetDir}. Bytes left: ${targetDirBytesLeft}.`,
      );
      return;
    }

    const res = await getAvailableFileStorage(this.size);
    if (!res.success) throw new Error(res.error);
    targetDir = res.data.location;
    targetDirBytesLeft = res.data.bytesLeft;
    this.perfLog(`Set target dir: ${targetDir}. Bytes left: ${targetDirBytesLeft}.`);
  };

  private updateDupeFile = async () => {
    const id = this.file.id;

    if (this.tagIds?.length > 0) {
      const res = await trpc.editFileTags.mutate({
        addedTagIds: this.tagIds,
        fileIds: [id],
        withSub: false,
      });
      if (!res.success) throw new Error(res.error);
      this.perfLog("Added tags to duplicate file");
    }

    const res = await trpc.updateFile.mutate({ id, ...this.file });
    if (!res.success) throw new Error(res.error);
    this.perfLog("Updated duplicate file");
  };

  /* ----------------------------------------------------------------------- */
  public import = async (): Promise<{
    error?: string;
    file?: FileSchema;
    status: FileImport["status"];
    success: boolean;
  }> => {
    try {
      await this.setTargetDir();
      await this.hashFile(this.originalPath);
      this.originalHash = this.hash;
    } catch (err) {
      this.perfLogTotal("Failed to import file.");
      console.error(`Error hashing ${this.originalPath}:`, err.stack);
      return { success: false, error: err.message, status: "ERROR" };
    }

    try {
      if (this.withRemux && getIsRemuxable(this.ext)) await this.remux();
      await this.checkHash();
    } catch (err) {
      this.perfLogTotal("Failed to import file.");
      console.error(`Error remuxing / checking hash ${this.originalPath}:`, err.stack);
      return { success: false, error: err.message, status: "ERROR" };
    }

    try {
      await this.copyFile();
      targetDirBytesLeft -= this.size;
    } catch (err) {
      if (err.code === "EEXIST") {
        await this.checkHash();
        if (this.isDuplicate) await this.updateDupeFile();
        if (this.deleteOnImport) await this.deleteOriginal();
        this.perfLogTotal("Duplicate file imported.");
        return { success: true, file: this.file, status: "DUPLICATE" };
      }
    }

    try {
      if (this.isDuplicate) {
        await this.updateDupeFile();
        if (this.deleteOnImport) await this.deleteOriginal();
        return { success: true, file: this.file, status: "DUPLICATE" };
      } else if (this.getIsIgnored()) {
        if (this.deleteOnImport) await this.deleteOriginal();
        return { success: true, status: "DELETED" };
      }

      this.file = await this.createFileSchema();
      this.perfLogTotal("New file imported.");
      return { success: true, file: this.file, status: "COMPLETE" };
    } catch (err) {
      if (err.message.includes("duplicate key")) {
        this.perfLogTotal("File imported with duplicate hash error.");
        return { success: true, file: this.file, status: "DUPLICATE" };
      } else {
        this.perfLogTotal("Failed to import file.");
        console.error(`Error importing ${this.originalPath}:`, err.stack);
        return { success: false, error: err.message, status: "ERROR" };
      }
    }
  };

  public refresh = (file: FileSchema) =>
    handleErrors(async () => {
      this.file = file;
      this.hash = file.hash;
      this.originalPath = file.path;

      if (this.withRemux && getIsRemuxable(this.ext)) {
        this.deleteOnImport = true;
        await this.remux();
        await this.checkHash();

        if (this.isDuplicate) {
          const res = await trpc.updateFile.mutate({
            ...this.file,
            hash: file.hash,
            isArchived: true,
          });
          if (!res.success) throw new Error(res.error);
          return { success: true, status: "DUPLICATE" };
        }
      }

      this.file = {
        ...this.file,
        ...(await genFileInfo({ file, filePath: file.path, hash: this.hash })),
      };

      const res = await trpc.updateFile.mutate(this.file);
      if (!res.success) throw new Error(res.error);
      this.perfLog("Refreshed file");
      return { success: true, status: "COMPLETE" };
    });
}

export class EditorImportsCache {
  private parentTagsCache = new Map<string, string[]>();
  private regExMapsCache = new Map<string, RegExMap[]>();
  private tagIdCache = new Map<string, TagSchema>();
  private tagLabelCache = new Map<string, TagSchema>();
  private regExMaps: { regEx: RegExp; tagId: string }[] = [];
  public tagsToCreateMap = new Map<string, TagToUpsert>();
  public tagsToEditMap = new Map<string, TagToUpsert>();

  constructor(private stores: RootStore) {
    this.stores = stores;
    this.loadRegExMaps();
  }

  async getParentTags(id: string) {
    if (!this.parentTagsCache.has(id)) {
      this.parentTagsCache.set(
        id,
        this.tagIdCache.has(id) ? (await this.stores.tag.listTagAncestorLabels({ id })).data : [],
      );
    }
    return this.parentTagsCache.get(id);
  }

  async getTagByLabel(label: string) {
    if (!this.tagLabelCache.has(label)) {
      const tag = (await this.stores.tag.getByLabel(label)).data;
      if (tag) this.tagLabelCache.set(label, tag);
    }
    return this.tagLabelCache.get(label);
  }

  async getTagById(id: string) {
    if (!this.tagIdCache.has(id)) {
      const tag = (await this.stores.tag.listByIds({ ids: [id] })).data.items?.[0];
      if (tag) this.tagIdCache.set(id, tag);
    }
    return this.tagIdCache.get(id);
  }

  getTagIdsByRegEx(label: string) {
    if (!this.regExMapsCache.has(label))
      this.regExMapsCache.set(
        label,
        this.regExMaps.filter((map) => map.regEx.test(label)),
      );
    return this.regExMapsCache.get(label)?.map((map) => map.tagId);
  }

  async loadRegExMaps() {
    this.regExMaps = (await this.stores.tag.listRegExMaps()).data;
  }
}

export const dirToFileImports = async (dirPath: string) => {
  const filePaths = await dirToFilePaths(dirPath);
  const imports = await filePathsToImports(filePaths);
  return { filePaths, imports };
};

export const filePathsToImports = async (filePaths: string[]) => {
  const config = getConfig();
  const validExts = new Set([...config.file.imageExts, ...config.file.videoExts]);

  return (
    await Promise.all(
      filePaths.map(async (filePath) => {
        const extension = path.extname(filePath).slice(1).toLowerCase();
        if (!validExts.has(extension)) return null;

        const stats = await fs.stat(filePath);
        return new FileImport({
          dateCreated: dayjs(
            Math.min(stats.birthtime.valueOf(), stats.ctime.valueOf(), stats.mtime.valueOf()),
          ).toISOString(),
          extension,
          name: path.parse(filePath).name,
          path: filePath,
          size: stats.size,
          status: "PENDING",
        });
      }),
    )
  ).filter(Boolean);
};

export const handleIngest = async ({
  fileList,
  store,
}: {
  fileList: FileList;
  store: Ingester;
}) => {
  try {
    const { perfLog, perfLogTotal } = makePerfLog("[Ingest]");
    store.setIsInitDone(false);
    store.setIsOpen(true);

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
    store.setFilePaths([]);
    store.setImports([]);
    perfLog("Init");

    const folders: { filePaths: string[]; imports: FileImport[] }[] = [];
    for (const folderPath of folderPaths) folders.push(await dirToFileImports(folderPath));
    const importsFromFilePaths = await filePathsToImports(filePaths);

    const editorFilePaths = [...filePaths, ...folders.flatMap((f) => f.filePaths)];
    const editorImports = [...importsFromFilePaths, ...folders.flatMap((f) => f.imports)];
    perfLog("Created editor file paths and imports");

    store.setFilePaths(editorFilePaths);
    store.setImports(editorImports);
    perfLog("Re-render");

    perfLogTotal("Init done");
    setTimeout(() => store.setIsInitDone(true), 0);
  } catch (err) {
    toast.error("Error queuing imports");
    console.error(err);
  }
};

export const handleReingest = async ({
  fileIds,
  store,
}: {
  fileIds: string[];
  store: Reingester;
}) => {
  try {
    store.setIsInitDone(false);
    store.setIsOpen(true);

    const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });
    if (!res.success) throw new Error(res.error);
    const files = res.data.items;

    const folders = new Map<string, string[]>();
    for (const file of files) {
      const folder = path.dirname(file.originalPath);
      if (!folders.has(folder)) folders.set(folder, [file.id]);
      else folders.get(folder).push(file.id);
    }

    store.setFolderFileIds(
      [...folders.entries()].map(([folder, fileIds]) => ({ folder, fileIds })),
    );
    await store.loadFolder();
  } catch (err) {
    toast.error("Error queuing imports");
    console.error(err);
  }
};

export const useImportEditor = (store: Ingester | Reingester) => {
  const config = getConfig();

  const stores = useStores();

  const cache = useRef<EditorImportsCache>();

  const isInitMount = useRef(true);
  useEffect(() => {
    if (isInitMount.current) {
      isInitMount.current = false;
      store.options.reset();
    } else store.setHasChangesSinceLastScan(true);
  }, [
    store.options.flattenTo,
    store.options.folderToCollectionMode,
    store.options.folderToTagsMode,
    store.options.withDelimiters,
    store.options.withDiffusionModel,
    store.options.withDiffusionParams,
    store.options.withDiffusionRegExMaps,
    store.options.withDiffusionTags,
    store.options.withFileNameToTags,
    store.options.withFlattenTo,
    store.options.withFolderNameRegEx,
    store.rootFolderIndex,
  ]);

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

    const folderTags: TagToUpsert[] = [];

    const depth = store.options.withFlattenTo
      ? store.rootFolderIndex + store.options.flattenTo
      : undefined;
    const folderNameParts = folderName.split(path.sep).slice(store.rootFolderIndex, depth);
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
          } else folderTags.push({ id: tag?.id, label });
        }

        if (DEBUG) perfLog("Parsed cascading tags");
      }

      if (store.options.folderToTagsMode === "hierarchical" && tagLabel) {
        for (const label of delimit(tagLabel)) {
          if (label === collectionTitle) continue;
          const id = (await cache.current.getTagByLabel(label))?.id;
          const parentLabels = tagParentLabel ? delimit(tagParentLabel) : [];
          folderTags.push({ id, label, parentLabels });
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
              cache.current.tagsToEditMap.set(tag.id, { id: tag.id, label, parentLabels });
          }
        }

        if (DEBUG) perfLog("Parsed hierarchical tags");
      }

      if (store.options.withFolderNameRegEx) {
        const existingLabels = new Set(folderTags.map((tag) => tag.label));
        const tagsToPush: TagToUpsert[] = [];

        for (const folderNamePart of folderNameParts) {
          const tagIds = cache.current.getTagIdsByRegEx(folderNamePart);
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

        if (DEBUG) perfLog("Parsed tags from folder name RegEx maps");
      }

      /** Parse tags from collectionTitle via folder regex maps */
      if (collectionTitle && store.options.folderToCollectionMode === "withTag") {
        const collectionTitleTags = cache.current.getTagIdsByRegEx(collectionTitle);
        if (collectionTitleTags?.length) {
          for (const tagId of collectionTitleTags) {
            const tag = await cache.current.getTagById(tagId);
            if (tag && !folderTags.some((t) => t.label === tag.label)) folderTags.push(tag);
          }
        }
      }
    }

    const dedupeTags = async () => {
      const descendantMap = new Map<string, Set<string>>();
      const processedTags = new Map<string, TagToUpsert>();

      for (const tag of folderTags) {
        const parentLabels = new Set([
          ...(tag.parentLabels ?? []),
          ...(tag.id ? await cache.current.getParentTags(tag.id) : []),
        ]);

        parentLabels.forEach((parentLabel) => {
          if (!descendantMap.has(parentLabel)) descendantMap.set(parentLabel, new Set());
          descendantMap.get(parentLabel)!.add(tag.label);
        });

        if (!descendantMap.has(tag.label)) {
          const tagToPush = store.options.withFolderNameRegEx
            ? await replaceTagsFromRegEx(tag)
            : tag;
          if (!processedTags.has(tagToPush.label)) processedTags.set(tagToPush.label, tagToPush);
        }
      }

      return Array.from(processedTags.values());
    };

    const tags = await dedupeTags();
    if (DEBUG) perfLog("Filtered out duplicate / ancestor tags");

    return {
      collectionTitle,
      folderName,
      folderNameParts,
      imports: [fileImport],
      tags,
    };
  };

  const createFolderHierarchy = async (
    imports: ModelCreationData<FileImport>[],
    perfLog: (str: string) => void,
  ) => {
    const folderMap = new Map<string, FlatFolder>();

    for (let idx = 0; idx < imports.length; idx++) {
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

  const createFolderTagIds = async (folder: FlatFolder) => {
    const imports: CreateImportBatchesInput[number]["imports"] = [];

    for (const imp of folder.imports) {
      const tagIds = await getIdsFromTags(imp.tagsToUpsert, imp.tagIds);
      if (tagIds.length !== (imp.tagsToUpsert?.length ?? 0) + (imp.tagIds?.length ?? 0)) {
        console.debug({
          tagIds,
          fileTagsToUpsert: jstr(imp.tagsToUpsert),
          fileTagIds: jstr(imp.tagIds),
        });
        throw new Error("Failed to get tagIds from file tags");
      } else imports.push({ ...imp, tagIds });
    }

    const tagIds = await getIdsFromTags(folder.tags);
    if (tagIds.length !== folder.tags?.length) {
      console.debug({ tagIds, folderTags: jstr(folder.tags) });
      throw new Error("Failed to get tagIds from folder tags");
    }

    return { imports, tagIds };
  };

  const createImportBatches = async () => {
    const importBatches: CreateImportBatchesInput = [];

    for (const folder of store.flatFolderHierarchy.values()) {
      const { imports, tagIds } = await createFolderTagIds(folder);

      importBatches.push({
        collectionTitle: folder.collectionTitle,
        deleteOnImport: store.options.deleteOnImport,
        ignorePrevDeleted: store.options.ignorePrevDeleted,
        imports,
        rootFolderPath: folder.folderName
          .split(path.sep)
          .slice(0, store.rootFolderIndex + 1)
          .join(path.sep),
        tagIds,
        remux: store.options.withRemux,
      });
    }

    return importBatches;
  };

  const createTagHierarchy = (tags: TagToUpsert[], label: string): TagToUpsert[] =>
    tags
      .filter((c) => c.parentLabels?.includes(label))
      .map((c) => ({ ...c, children: createTagHierarchy(tags, c.label) }));

  const createTagsToUpsert = async (tags: TagToUpsert[], perfLog: (str: string) => void) => {
    const tagsToUpsertMap = new Map<string, TagToUpsert>();

    const tagsToReplace = [
      ...tags,
      ...cache.current.tagsToCreateMap.values(),
      ...cache.current.tagsToEditMap.values(),
    ];
    for (const t of tagsToReplace) {
      const tag = store.options.withFolderNameRegEx ? await replaceTagsFromRegEx(t) : t;
      if (!tagsToUpsertMap.has(tag.label)) tagsToUpsertMap.set(tag.label, tag);
    }
    if (DEBUG) perfLog("Parsed flat tags to upsert");

    return [...tagsToUpsertMap.values()];
  };

  const delimit = (str: string) =>
    store.options.withDelimiters
      ? str.split(config.imports.folderDelimiter).map((l) => l.trim())
      : [str];

  const fileToTagsAndDiffParams = async () => {
    const { perfLog } = makePerfLog("[ImportEditor.fileToTagsAndDiffParams]");

    if (!store.options.withDiffusionParams)
      store.clearValues({ diffusionParams: true, tagIds: true, tagsToUpsert: true });
    else {
      await store.loadDiffusionParams();
      if (DEBUG) perfLog("Loaded diffusion params");
    }

    /** Create meta tags for diffusion params if not found. */
    const { diffMetaTagsToEdit, originalTag, upscaledTag } = await upsertDiffMetaTags();
    if (DEBUG) perfLog("Upserted diffusion meta tags");

    const tagsToUpsert: TagToUpsert[] = [];

    /** Directly update file imports with their own tags derived from RegEx maps and diffusion params. */
    const editorImports: ModelCreationData<FileImport>[] = await Promise.all(
      store.imports.map(async (imp) => {
        const fileTagIds: string[] = [];
        const fileTagsToUpsert: TagToUpsert[] = [];

        if (store.options.withFileNameToTags) {
          const tagIds = cache.current.getTagIdsByRegEx(imp.name);
          if (tagIds?.length) fileTagIds.push(...tagIds);
          if (DEBUG) perfLog(`Parsed tag ids from file name via regEx`);
        }

        if (imp.diffusionParams?.length) {
          const { diffFileTagIds, diffFileTagsToUpsert } = await parseDiffTags({
            diffusionParams: imp.diffusionParams,
            originalTagId: originalTag.id,
            upscaledTagId: upscaledTag.id,
          });
          if (DEBUG) perfLog(`Parsed diffusion params for ${imp.name}`);

          fileTagIds.push(...diffFileTagIds);
          fileTagsToUpsert.push(...diffFileTagsToUpsert);
        }

        const tagIdsSet = new Set<string>();
        for (const id of fileTagIds) {
          if (tagIdsSet.has(id)) continue;

          const tag = cache.current.getTagById(id);
          if (!tag) continue;

          let hasDescendants = false;
          for (const otherId of fileTagIds) {
            const otherTag = await cache.current.getTagById(otherId);
            const parentIds = new Set(
              [
                otherTag?.parentIds ?? [],
                otherTag ? await cache.current.getParentTags(otherTag.id) : [],
              ].flat(),
            );
            if (parentIds.has(id)) {
              hasDescendants = true;
              break;
            }
          }

          if (!hasDescendants) tagIdsSet.add(id);
        }

        const tagIds = [...tagIdsSet];
        if (DEBUG) perfLog(`Parsed tagIds for ${imp.name}`);

        tagsToUpsert.push(...fileTagsToUpsert);
        const updates = { tagIds, tagsToUpsert: fileTagsToUpsert };
        imp.setTags(tagIds, fileTagsToUpsert);
        if (DEBUG) perfLog(`Updated file import with tags for ${imp.name}`);
        return { ...imp.$, ...updates };
      }),
    );

    if (DEBUG) perfLog("Updated editor imports with tags");
    return { diffMetaTagsToEdit, editorImports, fileTagsToUpsert: tagsToUpsert };
  };

  const getIdsFromTags = async (tags: TagToUpsert[], tagIds: string[] = []) => {
    const tagsFromCache = await Promise.all(tags.map((t) => cache.current.getTagByLabel(t.label)));
    return [...new Set([...tagIds, ...tagsFromCache.map((t) => t?.id)])].filter(Boolean);
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
      diffFileTagIds.push(...cache.current.getTagIdsByRegEx(parsedParams.prompt));
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
    if (!diffFileTagIds.includes(upscaledTypeTagId)) diffFileTagIds.push(upscaledTypeTagId);

    perfLogTotal("Parsed diffusion tags");
    return { diffFileTagIds, diffFileTagsToUpsert };
  };

  const replaceTagsFromRegEx = async (tag: TagToUpsert) => {
    const copy = { ...tag };

    const tagIds = cache.current.getTagIdsByRegEx(copy.label);
    if (tagIds?.length) {
      for (const tagId of tagIds) {
        const label = (await cache.current.getTagById(tagId))?.label;
        if (label && !copy.parentLabels?.includes(label)) {
          copy.id = tagId;
          copy.label = label;
        }
      }
    }

    if (copy.parentLabels) {
      for (let idx = 0; idx < copy.parentLabels.length; idx++) {
        const parentTagIds = cache.current.getTagIdsByRegEx(copy.parentLabels[idx]);
        if (parentTagIds?.length) {
          for (const tagId of parentTagIds) {
            const parentLabel = (await cache.current.getTagById(tagId))?.label;
            if (
              parentLabel &&
              parentLabel !== copy.label &&
              !copy.parentLabels.includes(parentLabel)
            )
              copy.parentLabels[idx] = parentLabel;
          }
        }
      }
    }

    return copy;
  };

  const upsertDiffMetaTags = async () => {
    const diffMetaTagsToEdit: TagToUpsert[] = [];
    let modelTag: Tag;
    let originalTag: Tag;
    let upscaledTag: Tag;

    if (!store.options.withDiffusionTags) store.clearValues({ tagIds: true, tagsToUpsert: true });
    else {
      const upsertTag = async (label: string, isChild = false): Promise<TagToUpsert> => {
        const existsRes = await stores.tag.getByLabel(label);
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
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiffOriginal, true));
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiffUpscaled, true));
      }
    }

    return { diffMetaTagsToEdit, modelTag, originalTag, upscaledTag };
  };

  const upsertTags = async (perfLog: (logStr: string) => void) => {
    if (store.flatTagsToUpsert.length > 0) {
      if (DEBUG) perfLog(`Creating tags: ${jstr(store.flatTagsToUpsert.filter((t) => !t.id))}`);

      const res = await stores.tag.upsertTags(store.flatTagsToUpsert);
      if (!res.success) {
        console.error(res.error);
        toast.error("Failed to create tags");
        return store.setIsSaving(false);
      }

      if (DEBUG) perfLog("Created tags");
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                   EXPORTS                                  */
  /* -------------------------------------------------------------------------- */
  const ingest = async () => {
    try {
      const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.ingest]");
      if (DEBUG) perfLog("START");
      store.setIsSaving(true);

      await upsertTags(perfLog);

      const importBatches = await createImportBatches();
      const res = await stores.import.manager.createImportBatches(importBatches);
      if (!res.success) throw new Error(res.error);

      store.setIsSaving(false);
      if (DEBUG) perfLogTotal("Import batches created");
      toast.success(`Queued ${store.flatFolderHierarchy.size} import batches`);
      store.setIsOpen(false);
      stores.import.manager.setIsOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const reingest = async () => {
    try {
      const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.reingest]");
      if (DEBUG) perfLog("START");
      store.setIsSaving(true);

      await upsertTags(perfLog);

      store.options.setDeleteOnImport(false);
      store.options.setIgnorePrevDeleted(false);
      store.options.setWithRemux(false);
      stores.import.reingester.setTagIds(
        (await createFolderTagIds(stores.import.reingester.getCurFolder())).tagIds,
      );

      const res = await stores.import.reingester.reingest();
      if (!res.success) throw new Error(res.error);

      store.setIsSaving(false);
      if (DEBUG) perfLogTotal("Folder reingested");
    } catch (err) {
      console.error(err);
    }
  };

  const scan = async () => {
    if (store.isSaving) return;
    store.setIsLoading(true);

    setTimeout(async () => {
      try {
        const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.scan]");
        if (DEBUG) perfLog("START");
        cache.current = new EditorImportsCache(stores);

        /* ---------------------------------- Files --------------------------------- */
        const { diffMetaTagsToEdit, editorImports, fileTagsToUpsert } =
          await fileToTagsAndDiffParams();
        diffMetaTagsToEdit.forEach((tag) => cache.current.tagsToEditMap.set(tag.id, tag));
        if (DEBUG) perfLog("Parsed file tags and diffusion params");

        /* --------------------------------- Folders -------------------------------- */
        const folders = await createFolderHierarchy(editorImports, perfLog);
        store.setFlatFolderHierarchy(folders);
        if (DEBUG) perfLog("Set flat folder hierarchy");

        /* ----------------------------------- Tags ---------------------------------- */
        const tagsToUpsert = await createTagsToUpsert(fileTagsToUpsert, perfLog);
        store.setFlatTagsToUpsert(tagsToUpsert);
        if (DEBUG) perfLog("Set flat tags to upsert");

        store.setTagHierarchy(
          tagsToUpsert
            .filter((t) => !t.parentLabels?.length)
            .map((t) => ({ ...t, children: createTagHierarchy(tagsToUpsert, t.label) })),
        );
        if (DEBUG) perfLog("Created tag hierarchy");

        store.setIsLoading(false);
        store.setHasChangesSinceLastScan(false);
        perfLogTotal("Scan completed");
      } catch (err) {
        console.error(err);
      }
    }, 50);
  };

  return { ingest, reingest, scan };
};
