import path from "path";
import { useEffect, useRef, useState } from "react";
import { Divider } from "@mui/material";
import { CreateImportBatchesInput, TagSchema } from "medior/_generated";
import { ModelCreationData } from "mobx-keystone";
import {
  Button,
  Card,
  Checkbox,
  CheckboxProps,
  Chip,
  Comp,
  ConfirmModal,
  Modal,
  NumInput,
  Text,
  View,
} from "medior/components";
import { FileImport, RootStore, Tag, useStores } from "medior/store";
import { colors, getConfig, makeClasses, toast } from "medior/utils/client";
import { commas, parseDiffParams } from "medior/utils/common";
import { makePerfLog } from "medior/utils/server";
import {
  FlatFolder,
  FlatFolderHierarchy,
  FolderToCollMode,
  FolderToTagsMode,
  ImportFoldersList,
  RootFolderButton,
  TagHierarchy,
  TagToUpsert,
} from ".";

type RegExMap = { regEx: RegExp; tagId: string };

const DEBUG = false;

class EditorImportsCache {
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
    if (!this.tagLabelCache.has(label))
      this.tagLabelCache.set(label, (await this.stores.tag.getByLabel(label)).data);
    return this.tagLabelCache.get(label);
  }

  async getTagById(id: string) {
    if (!this.tagIdCache.has(id))
      this.tagIdCache.set(id, (await this.stores.tag.listByIds({ ids: [id] })).data.items?.[0]);
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

export const ImportEditor = Comp(() => {
  const config = getConfig();

  const { css } = useClasses(null);

  const stores = useStores();

  const cache = useRef<EditorImportsCache>();

  const [deleteOnImport, setDeleteOnImport] = useState(config.imports.deleteOnImport);
  const [flatFolderHierarchy, setFlatFolderHierarchy] = useState<FlatFolderHierarchy>(new Map());
  const [flatTagsToUpsert, setFlatTagsToUpsert] = useState<TagToUpsert[]>([]);
  const [folderToCollectionMode, setFolderToCollectionMode] = useState<FolderToCollMode>(
    config.imports.folderToCollMode,
  );
  const [folderToTagsMode, setFolderToTagsMode] = useState<FolderToTagsMode>(
    config.imports.folderToTagsMode,
  );
  const [ignorePrevDeleted, setIgnorePrevDeleted] = useState(config.imports.ignorePrevDeleted);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [tagHierarchy, setTagHierarchy] = useState<TagToUpsert[]>([]);
  const [withDelimiters, setWithDelimiters] = useState(config.imports.withDelimiters);
  const [withDiffusionModel, setWithDiffusionModel] = useState(config.imports.withDiffModel);
  const [withDiffusionParams, setWithDiffusionParams] = useState(config.imports.withDiffParams);
  const [withDiffusionRegExMaps, setWithDiffusionRegExMaps] = useState(
    config.imports.withDiffRegEx,
  );
  const [withDiffusionTags, setWithDiffusionTags] = useState(config.imports.withDiffTags);
  const [withFlattenTo, setWithFlattenTo] = useState(false);
  const [withFileNameToTags, setWithFileNameToTags] = useState(config.imports.withFileNameToTags);
  const [withFolderNameRegEx, setWithFolderNameRegEx] = useState(
    config.imports.withFolderNameRegEx,
  );
  const [withNewTagsToRegEx, setWithNewTagsToRegEx] = useState(config.imports.withNewTagsToRegEx);
  const [withRemux, setWithRemux] = useState(false);

  const [hasChangesSinceLastScan, setHasChangesSinceLastScan] = useState(false);

  const isInitMount = useRef(true);
  useEffect(() => {
    if (isInitMount.current) isInitMount.current = false;
    else setHasChangesSinceLastScan(true);
  }, [
    folderToCollectionMode,
    folderToTagsMode,
    stores.import.editor.flattenTo,
    stores.import.editor.rootFolderIndex,
    withDelimiters,
    withDiffusionModel,
    withDiffusionParams,
    withDiffusionRegExMaps,
    withDiffusionTags,
    withFileNameToTags,
    withFlattenTo,
    withFolderNameRegEx,
  ]);

  useEffect(() => {
    if (!stores.import.editor.isInitDone) return;
    scan();
  }, [stores.import.editor.isInitDone]);

  const confirmDiscard = async () => {
    stores.import.editor.setIsOpen(false);
    stores.file.search.reloadIfQueued();
    return true;
  };

  const handleCancel = () => setIsConfirmDiscardOpen(true);

  const handleFolderToCollection = (checked: boolean) =>
    setFolderToCollectionMode(checked ? "withTag" : "none");

  const handleFoldersToTags = (checked: boolean) =>
    setFolderToTagsMode(checked ? "hierarchical" : "none");

  const handleTagManager = () => {
    if (stores.tag.manager.isOpen) stores.tag.manager.setIsOpen(false);
    setTimeout(() => stores.tag.manager.setIsOpen(true), 0);
  };

  const setFlattenTo = (value: number) => stores.import.editor.setFlattenTo(value);

  const toggleFolderToCollWithTag = () =>
    setFolderToCollectionMode((prev) => (prev === "withTag" ? "withoutTag" : "withTag"));

  const toggleFoldersToTagsCascading = () => setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () => setFolderToTagsMode("hierarchical");

  const checkboxProps: Partial<CheckboxProps> = {
    disabled: stores.import.editor.isDisabled,
    flex: "initial",
    padding: { all: "0.5rem" },
  };

  /* -------------------------------------------------------------------------- */
  /*                                INGEST LOGIC                                */
  /* -------------------------------------------------------------------------- */
  const createFolder = async ({
    fileImport,
    folderName,
  }: {
    fileImport: ModelCreationData<FileImport>;
    folderName: string;
  }) => {
    const { perfLog } = makePerfLog("[ImportEditor.createFolder]");

    const folderTags: TagToUpsert[] = [];

    const depth = withFlattenTo
      ? stores.import.editor.rootFolderIndex + stores.import.editor.flattenTo
      : undefined;
    const folderNameParts = folderName
      .split(path.sep)
      .slice(stores.import.editor.rootFolderIndex, depth);
    const collectionTitle =
      folderToCollectionMode !== "none"
        ? (folderToCollectionMode === "withTag" ? folderNameParts.slice() : folderNameParts).pop()
        : null;

    const tagLabel = folderNameParts.slice().pop()!;
    const tagParentLabel = folderNameParts.slice(0, -1).pop();

    if (folderToTagsMode !== "none") {
      if (folderToTagsMode === "cascading") {
        const labels = withDelimiters ? folderNameParts.flatMap(delimit) : folderNameParts;
        for (const label of labels) {
          if (label === collectionTitle) continue;
          const tag = await cache.current.getTagByLabel(label);
          if (!tag && !cache.current.tagsToCreateMap.has(label)) {
            cache.current.tagsToCreateMap.set(label, { label, withRegEx: withNewTagsToRegEx });
            folderTags.push({ label });
          } else folderTags.push({ id: tag?.id, label });
        }

        if (DEBUG) perfLog("Parsed cascading tags");
      }

      if (folderToTagsMode === "hierarchical" && tagLabel) {
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
                withRegEx: withNewTagsToRegEx,
              });
            else if (tag && !cache.current.tagsToEditMap.has(tag.id))
              cache.current.tagsToEditMap.set(tag.id, { id: tag.id, label, parentLabels });
          }
        }

        if (DEBUG) perfLog("Parsed hierarchical tags");
      }

      if (withFolderNameRegEx) {
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
      if (collectionTitle && folderToCollectionMode === "withTag") {
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
          const tagToPush = withFolderNameRegEx ? await replaceTagsFromRegEx(tag) : tag;
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

  const createTagHierarchy = (tags: TagToUpsert[], label: string): TagToUpsert[] =>
    tags
      .filter((c) => c.parentLabels?.includes(label))
      .map((c) => ({ ...c, children: createTagHierarchy(tags, c.label) }));

  const delimit = (str: string) =>
    withDelimiters ? str.split(config.imports.folderDelimiter).map((l) => l.trim()) : [str];

  const fileToTagsAndDiffParams = async () => {
    const { perfLog } = makePerfLog("[ImportEditor.fileToTagsAndDiffParams]");

    if (!withDiffusionParams)
      stores.import.editor.clearValues({ diffusionParams: true, tagIds: true, tagsToUpsert: true });
    else {
      await stores.import.editor.loadDiffusionParams();
      if (DEBUG) perfLog("Loaded diffusion params");
    }

    /** Create meta tags for diffusion params if not found. */
    const { diffMetaTagsToEdit, originalTag, upscaledTag } = await upsertDiffMetaTags();
    if (DEBUG) perfLog("Upserted diffusion meta tags");

    const tagsToUpsert: TagToUpsert[] = [];

    /** Directly update file imports with their own tags derived from RegEx maps and diffusion params. */
    const editorImports = await Promise.all(
      stores.import.editor.imports.map(async (imp) => {
        const fileTagIds: string[] = [];
        const fileTagsToUpsert: TagToUpsert[] = [];

        if (withFileNameToTags) {
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

  const handleConfirm = async () => {
    stores.import.editor.setIsSaving(true);

    if (flatTagsToUpsert.length > 0) {
      const res = await stores.tag.upsertTags(flatTagsToUpsert);
      if (!res.success) {
        console.error(res.error);
        toast.error("Failed to create tags");
        return stores.import.editor.setIsSaving(false);
      }
    }

    const getIdsFromTags = async (tags: TagToUpsert[], tagIds: string[] = []) => {
      const tagsFromCache = await Promise.all(
        tags.map((t) => cache.current.getTagByLabel(t.label)),
      );
      return [...new Set([...tagIds, ...tagsFromCache.map((t) => t.id)])].filter(Boolean);
    };

    const importBatches: CreateImportBatchesInput = [];
    for (const folder of flatFolderHierarchy.values()) {
      const imports: CreateImportBatchesInput[number]["imports"] = [];
      for (const imp of folder.imports) {
        imports.push({
          ...imp,
          tagIds: await getIdsFromTags(imp.tagsToUpsert, imp.tagIds),
        });
      }

      importBatches.push({
        collectionTitle: folder.collectionTitle,
        deleteOnImport,
        ignorePrevDeleted,
        imports,
        rootFolderPath: folder.folderName
          .split(path.sep)
          .slice(0, stores.import.editor.rootFolderIndex + 1)
          .join(path.sep),
        tagIds: await getIdsFromTags(folder.tags),
        remux: withRemux,
      });
    }

    const res = await stores.import.manager.createImportBatches(importBatches);
    if (!res.success) throw new Error(res.error);

    stores.import.editor.setIsSaving(false);
    toast.success(`Queued ${flatFolderHierarchy.size} import batches`);
    stores.import.editor.setIsOpen(false);
    stores.import.manager.setIsOpen(true);
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

    if (withDiffusionRegExMaps) {
      diffFileTagIds.push(...cache.current.getTagIdsByRegEx(parsedParams.prompt));
      if (DEBUG) perfLog(`Parsed tag ids from diffusion params via regEx`);
    }

    if (withDiffusionModel) {
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

    if (!withDiffusionTags) stores.import.editor.clearValues({ tagIds: true, tagsToUpsert: true });
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

      const hasImportsWithDiff = stores.import.editor.imports.some(
        (imp) => imp.diffusionParams?.length,
      );
      if (hasImportsWithDiff) {
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiff));
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiffModel, true));
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiffOriginal, true));
        diffMetaTagsToEdit.push(await upsertTag(config.imports.labelDiffUpscaled, true));
      }
    }

    return { diffMetaTagsToEdit, modelTag, originalTag, upscaledTag };
  };

  const scan = async () => {
    if (stores.import.editor.isSaving) return;
    stores.import.editor.setIsLoading(true);

    setTimeout(async () => {
      const { perfLog, perfLogTotal } = makePerfLog("[ImportEditor.scan]");
      if (DEBUG)
        perfLog("/* ------------------------------- New Scan ------------------------------ */");
      cache.current = new EditorImportsCache(stores);

      /* ---------------------------------- Files --------------------------------- */
      const { diffMetaTagsToEdit, editorImports, fileTagsToUpsert } =
        await fileToTagsAndDiffParams();
      diffMetaTagsToEdit.forEach((tag) => cache.current.tagsToEditMap.set(tag.id, tag));
      if (DEBUG) perfLog("Parsed file tags and diffusion params");

      /* --------------------------------- Folders -------------------------------- */
      const folderMap = new Map<string, FlatFolder>();

      for (let idx = 0; idx < editorImports.length; idx++) {
        const imp = editorImports[idx];
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
        if (DEBUG) perfLog(`Parsed import #${idx + 1} / ${editorImports.length}`);
      }

      if (DEBUG) perfLog("Parsed flat folder hierarchy");

      const sortedFolderMap = new Map(
        [...folderMap.entries()].sort(
          (a, b) => a[1].folderNameParts.length - b[1].folderNameParts.length,
        ),
      );
      if (DEBUG) perfLog("Sorted flat folder hierarchy");

      setFlatFolderHierarchy(sortedFolderMap);
      if (DEBUG) perfLog("Set flat folder hierarchy");

      /* ----------------------------------- Tags ---------------------------------- */
      const tagsToUpsertMap = new Map<string, TagToUpsert>();

      const tagsToReplace = [
        ...fileTagsToUpsert,
        ...cache.current.tagsToCreateMap.values(),
        ...cache.current.tagsToEditMap.values(),
      ];
      for (const t of tagsToReplace) {
        const tag = withFolderNameRegEx ? await replaceTagsFromRegEx(t) : t;
        if (!tagsToUpsertMap.has(tag.label)) tagsToUpsertMap.set(tag.label, tag);
      }
      if (DEBUG) perfLog("Parsed flat tags to upsert");

      const tagsToUpsert = [...tagsToUpsertMap.values()];
      setFlatTagsToUpsert(tagsToUpsert);
      if (DEBUG) perfLog("Set flat tags to upsert");

      setTagHierarchy(
        tagsToUpsert
          .filter((t) => !t.parentLabels?.length)
          .map((t) => ({ ...t, children: createTagHierarchy(tagsToUpsert, t.label) })),
      );
      if (DEBUG) perfLog("Created tag hierarchy");

      stores.import.editor.setIsLoading(false);
      setHasChangesSinceLastScan(false);
      perfLogTotal("Scan completed");
    }, 50);
  };

  return (
    <Modal.Container isLoading={stores.import.editor.isDisabled} width="100%" height="100%">
      <Modal.Header
        leftNode={<Button text="Tag Manager" icon="More" onClick={handleTagManager} />}
        rightNode={
          <Chip
            label={`${commas(stores.import.editor.imports.length)} Files / ${commas(flatFolderHierarchy.size)} Folders`}
          />
        }
      >
        <Text preset="title">{"Import Editor"}</Text>
      </Modal.Header>

      <Modal.Content row column={false} flex={1} height="100%" width="100%">
        <Card width="17rem" overflow="hidden auto">
          <Button
            text="Scan"
            icon="Cached"
            onClick={scan}
            disabled={stores.import.editor.isDisabled}
            color={hasChangesSinceLastScan ? colors.custom.purple : colors.custom.blue}
          />

          <Checkbox
            {...checkboxProps}
            label="Delete on Import"
            checked={deleteOnImport}
            setChecked={setDeleteOnImport}
          />

          <Checkbox
            {...checkboxProps}
            label="Ignore Prev. Deleted"
            checked={ignorePrevDeleted}
            setChecked={setIgnorePrevDeleted}
          />

          <Divider />

          <Checkbox
            {...checkboxProps}
            label="New Tags to RegEx"
            checked={withNewTagsToRegEx}
            setChecked={setWithNewTagsToRegEx}
          />

          <Divider />

          <Checkbox
            {...checkboxProps}
            label="File to Tags (RegEx)"
            checked={withFileNameToTags}
            setChecked={setWithFileNameToTags}
          />

          <Divider />

          <Checkbox
            {...checkboxProps}
            label="Folder to Tags"
            checked={folderToTagsMode !== "none"}
            setChecked={handleFoldersToTags}
          />

          <View column margins={{ left: "1rem" }}>
            <Checkbox
              {...checkboxProps}
              label="Hierarchical"
              checked={folderToTagsMode.includes("hierarchical")}
              setChecked={toggleFoldersToTagsHierarchical}
              disabled={checkboxProps.disabled || folderToTagsMode === "none"}
            />

            <Checkbox
              {...checkboxProps}
              label="Cascading"
              checked={folderToTagsMode === "cascading"}
              setChecked={toggleFoldersToTagsCascading}
              disabled={checkboxProps.disabled || folderToTagsMode === "none"}
            />

            <Checkbox
              {...checkboxProps}
              label="Delimited"
              checked={withDelimiters}
              setChecked={setWithDelimiters}
              disabled={checkboxProps.disabled || folderToTagsMode === "none"}
            />

            <Checkbox
              {...checkboxProps}
              label="With RegEx"
              checked={withFolderNameRegEx}
              setChecked={setWithFolderNameRegEx}
              disabled={checkboxProps.disabled || folderToTagsMode === "none"}
            />
          </View>

          <Divider />

          <Checkbox
            {...checkboxProps}
            label="Folder to Collection"
            checked={folderToCollectionMode !== "none"}
            setChecked={handleFolderToCollection}
          />

          <View column margins={{ left: "1rem" }}>
            <Checkbox
              {...checkboxProps}
              label="With Tag"
              checked={folderToCollectionMode === "withTag"}
              setChecked={toggleFolderToCollWithTag}
            />

            <View row align="center" spacing="0.5rem">
              <Checkbox
                {...checkboxProps}
                label="Flatten to"
                checked={withFlattenTo}
                setChecked={setWithFlattenTo}
                disabled={checkboxProps.disabled || folderToCollectionMode === "none"}
              />

              <NumInput
                placeholder="Depth"
                value={stores.import.editor.flattenTo}
                setValue={setFlattenTo}
                disabled={folderToCollectionMode === "none" || !withFlattenTo}
                hasHelper={false}
                textAlign="center"
                dense
              />
            </View>
          </View>

          <Divider />

          <Checkbox
            {...checkboxProps}
            label="Diffusion Params"
            checked={withDiffusionParams}
            setChecked={setWithDiffusionParams}
          />

          <View column margins={{ left: "1rem" }}>
            <Checkbox
              {...checkboxProps}
              label="With Tags"
              checked={withDiffusionTags}
              setChecked={setWithDiffusionTags}
              disabled={checkboxProps.disabled || !withDiffusionParams}
            />

            <View column margins={{ left: "1rem" }}>
              <Checkbox
                {...checkboxProps}
                label="Model"
                checked={withDiffusionModel}
                setChecked={setWithDiffusionModel}
                disabled={checkboxProps.disabled || !withDiffusionParams || !withDiffusionTags}
              />

              <Checkbox
                {...checkboxProps}
                label="With RegEx"
                checked={withDiffusionRegExMaps}
                setChecked={setWithDiffusionRegExMaps}
                disabled={checkboxProps.disabled || !withDiffusionParams || !withDiffusionTags}
              />
            </View>
          </View>

          <Divider />

          <Checkbox
            {...checkboxProps}
            label="Remux to MP4"
            checked={withRemux}
            setChecked={setWithRemux}
          />
        </Card>

        <View column width="100%" spacing="0.5rem" overflow="hidden">
          {(folderToTagsMode !== "none" ||
            folderToCollectionMode === "withTag" ||
            (withDiffusionParams && withDiffusionTags)) && (
            <Card width="100%">
              <View className={css.rootTagSelector}>
                <Text fontWeight={500} fontSize="0.9em" marginRight="0.5rem">
                  {"Select Root Tag"}
                </Text>

                {[...stores.import.editor.rootFolderPath.split(path.sep), "*"].map((p, i) => (
                  <RootFolderButton key={i} index={i} folderPart={p} />
                ))}
              </View>

              <View className={css.tags}>
                {tagHierarchy.map((t) => (
                  <TagHierarchy key={t.label} tag={t} />
                ))}
              </View>
            </Card>
          )}

          <ImportFoldersList flatFolderHierarchy={flatFolderHierarchy} />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Cancel"
          icon="Delete"
          onClick={handleCancel}
          disabled={stores.import.editor.isDisabled}
          colorOnHover={colors.custom.red}
        />

        <Button
          text="Confirm"
          icon="Check"
          onClick={handleConfirm}
          disabled={stores.import.editor.isDisabled || hasChangesSinceLastScan}
          color={colors.custom.blue}
        />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to cancel importing?"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={confirmDiscard}
        />
      )}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  rootTagSelector: {
    display: "flex",
    flexFlow: "row wrap",
    alignItems: "center",
    marginBottom: "0.3rem",
  },
  tags: {
    display: "flex",
    flexDirection: "row",
    maxHeight: "35vh",
    overflowX: "auto",
  },
});
