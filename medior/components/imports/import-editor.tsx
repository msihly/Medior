import path from "path";
import { useEffect, useRef, useState } from "react";
import { RegExMapSchema } from "medior/database";
import { ModelCreationData } from "mobx-keystone";
import { FileImport, RootStore, Tag, observer, useStores } from "medior/store";
import { Divider } from "@mui/material";
import {
  Button,
  Card,
  Checkbox,
  CheckboxProps,
  Chip,
  ConfirmModal,
  Modal,
  NumInput,
  Text,
  View,
} from "medior/components";
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
import { colors, commas, getConfig, makeClasses, makePerfLog, parseDiffParams } from "medior/utils";
import { toast } from "react-toastify";

type RegExMap = { regEx: RegExp; tagId: string };

const DEBUG = false;

const getRegExMaps = (stores: RootStore, type: RegExMapSchema["types"][number]) =>
  stores.tag.listRegExMapsByType(type).map((map) => ({
    regEx: new RegExp(map.regEx, "im"),
    tagId: map.tagId,
  }));

class EditorImportsCache {
  private parentTagsCache = new Map<string, string[]>();
  private regExMapsCache = new Map<string, RegExMap[]>();
  private tagIdCache = new Map<string, Tag>();
  private tagLabelCache = new Map<string, Tag>();
  public diffRegExMaps: RegExMap[];
  public fileRegExMaps: RegExMap[];
  public folderRegExMaps: RegExMap[];
  public tagsToCreateMap = new Map<string, TagToUpsert>();
  public tagsToEditMap = new Map<string, TagToUpsert>();

  constructor(private stores: RootStore) {
    this.stores = stores;
    this.diffRegExMaps = getRegExMaps(stores, "diffusionParams");
    this.fileRegExMaps = getRegExMaps(stores, "fileName");
    this.folderRegExMaps = getRegExMaps(stores, "folderName");
  }

  getParentTags(id: string) {
    if (!this.parentTagsCache.has(id)) {
      const tag = this.getTagById(id);
      const parentTags = tag ? this.stores.tag.getParentTags(tag, true).map((t) => t.label) : [];
      this.parentTagsCache.set(id, parentTags);
    }
    return this.parentTagsCache.get(id);
  }

  getTagByLabel(label: string) {
    if (!this.tagLabelCache.has(label))
      this.tagLabelCache.set(label, this.stores.tag.getByLabel(label));
    return this.tagLabelCache.get(label);
  }

  getTagById(id: string) {
    if (!this.tagIdCache.has(id)) this.tagIdCache.set(id, this.stores.tag.getById(id));
    return this.tagIdCache.get(id);
  }

  getTagIdsByDiffRegEx(label: string) {
    if (!this.regExMapsCache.has(label))
      this.regExMapsCache.set(
        label,
        this.diffRegExMaps.filter((map) => map.regEx.test(label))
      );
    return this.regExMapsCache.get(label)?.map((map) => map.tagId);
  }

  getTagIdsByFileRegEx(label: string) {
    if (!this.regExMapsCache.has(label))
      this.regExMapsCache.set(
        label,
        this.fileRegExMaps.filter((map) => map.regEx.test(label))
      );
    return this.regExMapsCache.get(label)?.map((map) => map.tagId);
  }

  getTagIdsByFolderRegEx(label: string) {
    if (!this.regExMapsCache.has(label))
      this.regExMapsCache.set(
        label,
        this.folderRegExMaps.filter((map) => map.regEx.test(label))
      );
    return this.regExMapsCache.get(label)?.map((map) => map.tagId);
  }
}

export const ImportEditor = observer(() => {
  const config = getConfig();

  const { css } = useClasses(null);

  const stores = useStores();

  const [deleteOnImport, setDeleteOnImport] = useState(config.imports.deleteOnImport);
  const [flatFolderHierarchy, setFlatFolderHierarchy] = useState<FlatFolderHierarchy>(new Map());
  const [flatTagsToUpsert, setFlatTagsToUpsert] = useState<TagToUpsert[]>([]);
  const [folderToCollectionMode, setFolderToCollectionMode] = useState<FolderToCollMode>(
    config.imports.folderToCollMode
  );
  const [folderToTagsMode, setFolderToTagsMode] = useState<FolderToTagsMode>(
    config.imports.folderToTagsMode
  );
  const [ignorePrevDeleted, setIgnorePrevDeleted] = useState(config.imports.ignorePrevDeleted);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [tagHierarchy, setTagHierarchy] = useState<TagToUpsert[]>([]);
  const [withDelimiters, setWithDelimiters] = useState(config.imports.withDelimiters);
  const [withDiffusionModel, setWithDiffusionModel] = useState(config.imports.withDiffModel);
  const [withDiffusionParams, setWithDiffusionParams] = useState(config.imports.withDiffParams);
  const [withDiffusionRegExMaps, setWithDiffusionRegExMaps] = useState(
    config.imports.withDiffRegEx
  );
  const [withDiffusionTags, setWithDiffusionTags] = useState(config.imports.withDiffTags);
  const [withFlattenTo, setWithFlattenTo] = useState(false);
  const [withFileNameToTags, setWithFileNameToTags] = useState(config.imports.withFileNameToTags);
  const [withFolderNameRegEx, setWithFolderNameRegEx] = useState(
    config.imports.withFolderNameRegEx
  );
  const [withNewTagsToRegEx, setWithNewTagsToRegEx] = useState(config.imports.withNewTagsToRegEx);

  const [hasChangesSinceLastScan, setHasChangesSinceLastScan] = useState(false);

  const isInitMount = useRef(true);
  useEffect(() => {
    if (isInitMount.current) isInitMount.current = false;
    else setHasChangesSinceLastScan(true);
  }, [
    stores.import.editorRootFolderIndex,
    stores.tag.tags,
    folderToCollectionMode,
    folderToTagsMode,
    withDelimiters,
    withDiffusionModel,
    withDiffusionParams,
    withDiffusionRegExMaps,
    withDiffusionTags,
    withFileNameToTags,
    withFolderNameRegEx,
  ]);

  useEffect(() => {
    if (!stores.import.editor.isInitDone) return;
    scan();
  }, [stores.import.editor.isInitDone]);

  const confirmDiscard = () => {
    stores.import.setIsImportEditorOpen(false);
    stores.file.search.reloadIfQueued();
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

  const setFlattenTo = (value: number) => stores.import.setEditorFlattenTo(value);

  const toggleFolderToCollWithTag = () =>
    setFolderToCollectionMode((prev) => (prev === "withTag" ? "withoutTag" : "withTag"));

  const toggleFoldersToTagsCascading = () => setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () => setFolderToTagsMode("hierarchical");

  const toggleWithFolderNameRegEx = () => setWithFolderNameRegEx((prev) => !prev);

  const checkboxProps: Partial<CheckboxProps> = {
    disabled: stores.import.editor.isDisabled,
    flex: "initial",
    padding: { all: "0.5rem" },
  };

  /* -------------------------------------------------------------------------- */
  /*                                INGEST LOGIC                                */
  /* -------------------------------------------------------------------------- */
  const createFolder = ({
    cache,
    fileImport,
    folderName,
  }: {
    cache: EditorImportsCache;
    fileImport: ModelCreationData<FileImport>;
    folderName: string;
  }) => {
    const { perfLog } = makePerfLog("[ImportEditor.createFolder]");

    const folderTags: TagToUpsert[] = [];

    const depth = withFlattenTo
      ? stores.import.editorRootFolderIndex + stores.import.editorFlattenTo
      : undefined;
    const folderNameParts = folderName
      .split(path.sep)
      .slice(stores.import.editorRootFolderIndex, depth);
    const collectionTitle =
      folderToCollectionMode !== "none"
        ? (folderToCollectionMode === "withTag" ? folderNameParts.slice() : folderNameParts).pop()
        : null;

    const tagLabel = folderNameParts.slice().pop()!;
    const tagParentLabel = folderNameParts.slice(0, -1).pop();

    if (folderToTagsMode !== "none") {
      if (folderToTagsMode === "cascading") {
        const labels = withDelimiters ? folderNameParts.flatMap(delimit) : folderNameParts;
        labels.forEach((label) => {
          if (label === collectionTitle) return;
          const tag = cache.getTagByLabel(label);
          if (!tag && !cache.tagsToCreateMap.has(label)) {
            cache.tagsToCreateMap.set(label, { label, withRegEx: withNewTagsToRegEx });
            folderTags.push({ label });
          } else folderTags.push({ id: tag?.id, label });
        });

        if (DEBUG) perfLog("Parsed cascading tags");
      }

      if (folderToTagsMode === "hierarchical" && tagLabel) {
        delimit(tagLabel).forEach((label) => {
          if (label === collectionTitle) return;
          const id = cache.getTagByLabel(label)?.id;
          const parentLabels = tagParentLabel ? delimit(tagParentLabel) : [];
          folderTags.push({ id, label, parentLabels });
        });

        folderNameParts.forEach((label, idx) => {
          delimit(label).forEach((label) => {
            if (label === collectionTitle) return;
            const tag = cache.getTagByLabel(label);
            const parentLabel = folderNameParts[idx - 1];
            const parentLabels = parentLabel ? delimit(parentLabel) : [];

            if (!tag && !cache.tagsToCreateMap.has(label))
              cache.tagsToCreateMap.set(label, {
                label,
                parentLabels,
                withRegEx: withNewTagsToRegEx,
              });
            else if (tag && !cache.tagsToEditMap.has(tag.id))
              cache.tagsToEditMap.set(tag.id, { id: tag.id, label, parentLabels });
          });
        });

        if (DEBUG) perfLog("Parsed hierarchical tags");
      }

      if (withFolderNameRegEx) {
        const existingLabels = new Set(folderTags.map((tag) => tag.label));

        folderTags.push(
          ...folderNameParts.reduce((acc, folderNamePart) => {
            const tagIds = cache.getTagIdsByFolderRegEx(folderNamePart);
            if (!tagIds?.length) return acc;

            tagIds.forEach((id) => {
              const label = cache.getTagById(id)?.label;
              if (!label) return acc;
              if (!existingLabels.has(label)) {
                acc.push({ id, label });
                existingLabels.add(label);
              }
            });

            return acc;
          }, [] as TagToUpsert[])
        );

        if (DEBUG) perfLog("Parsed tags from folder name RegEx maps");
      }

      /** Parse tags from collectionTitle via folder regex maps */
      if (collectionTitle) {
        const collectionTitleTags = cache.getTagIdsByFolderRegEx(collectionTitle);
        if (collectionTitleTags?.length) {
          collectionTitleTags.forEach((tagId) => {
            const tag = cache.getTagById(tagId);
            if (tag && !folderTags.some((t) => t.label === tag.label)) folderTags.push(tag);
          });
        }
      }
    }

    const tags = (() => {
      const descendantMap = new Map<string, Set<string>>();
      const processedTags = new Map<string, TagToUpsert>();

      folderTags.forEach((tag) => {
        const parentLabels = new Set([
          ...(tag.parentLabels ?? []),
          ...(tag.id ? cache.getParentTags(tag.id) : []),
        ]);

        parentLabels.forEach((parentLabel) => {
          if (!descendantMap.has(parentLabel)) descendantMap.set(parentLabel, new Set());
          descendantMap.get(parentLabel)!.add(tag.label);
        });

        if (!descendantMap.has(tag.label)) {
          const tagToPush = withFolderNameRegEx ? replaceTagsFromRegEx(cache, tag) : tag;
          if (!processedTags.has(tagToPush.label)) processedTags.set(tagToPush.label, tagToPush);
        }
      });

      return Array.from(processedTags.values());
    })();

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

  const fileToTagsAndDiffParams = async (cache: EditorImportsCache) => {
    const { perfLog } = makePerfLog("[ImportEditor.fileToTagsAndDiffParams]");

    if (!withDiffusionParams)
      stores.import.clearValues({ diffusionParams: true, tagIds: true, tagsToUpsert: true });
    else {
      await stores.import.loadDiffusionParams();
      if (DEBUG) perfLog("Loaded diffusion params");
    }

    /** Create meta tags for diffusion params if not found. */
    const { diffMetaTagsToEdit, originalTag, upscaledTag } = await upsertDiffMetaTags();
    if (DEBUG) perfLog("Upserted diffusion meta tags");

    const tagsToUpsert: TagToUpsert[] = [];

    /** Directly update file imports with their own tags derived from RegEx maps and diffusion params. */
    const editorImports = stores.import.editorImports.map((imp) => {
      const fileTagIds: string[] = [];
      const fileTagsToUpsert: TagToUpsert[] = [];

      if (withFileNameToTags) {
        const tagIds = cache.getTagIdsByFileRegEx(imp.name);
        if (tagIds?.length) fileTagIds.push(...tagIds);
        if (DEBUG) perfLog(`Parsed tag ids from file name via regEx`);
      }

      if (imp.diffusionParams?.length) {
        const { diffFileTagIds, diffFileTagsToUpsert } = parseDiffTags({
          cache,
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

        const tag = cache.getTagById(id);
        if (!tag) continue;

        const hasDescendants = fileTagIds.some((otherId) => {
          const otherTag = cache.getTagById(otherId);
          const parentIds = new Set(
            [otherTag?.parentIds ?? [], otherTag ? cache.getParentTags(otherTag.id) : []].flat()
          );
          return parentIds.has(id);
        });

        if (!hasDescendants) tagIdsSet.add(id);
      }

      const tagIds = [...tagIdsSet];
      if (DEBUG) perfLog(`Parsed tagIds for ${imp.name}`);

      tagsToUpsert.push(...fileTagsToUpsert);
      const updates = { tagIds, tagsToUpsert: fileTagsToUpsert };
      imp.setTags(tagIds, fileTagsToUpsert);
      if (DEBUG) perfLog(`Updated file import with tags for ${imp.name}`);
      return { ...imp.$, ...updates };
    });

    if (DEBUG) perfLog("Updated editor imports with tags");
    return { diffMetaTagsToEdit, editorImports, fileTagsToUpsert: tagsToUpsert };
  };

  const handleConfirm = async () => {
    stores.import.editor.setIsSaving(true);

    if (flatTagsToUpsert.length > 0) {
      const res = await stores.tag.upsertTags(flatTagsToUpsert);
      await stores.tag.loadTags();

      if (!res.success) {
        console.error(res.error);
        toast.error("Failed to create tags");
        return stores.import.editor.setIsSaving(false);
      }
    }

    const batches = [...flatFolderHierarchy.values()].map((folder) => ({
      collectionTitle: folder.collectionTitle,
      deleteOnImport,
      ignorePrevDeleted,
      imports: folder.imports.map((imp) => ({
        ...imp,
        tagIds: [
          ...new Set(
            [
              ...imp.tagIds,
              ...imp.tagsToUpsert.map((t) => stores.tag.getByLabel(t.label)?.id),
            ].filter(Boolean)
          ),
        ],
      })),
      rootFolderPath: folder.folderName
        .split(path.sep)
        .slice(0, stores.import.editorRootFolderIndex + 1)
        .join(path.sep),
      tagIds: folder.tags.map((t) => stores.tag.getByLabel(t.label)?.id).filter(Boolean),
    }));

    const res = await stores.import.createImportBatches(batches);
    if (!res.success) throw new Error(res.error);

    stores.import.editor.setIsSaving(false);
    toast.success(`Queued ${flatFolderHierarchy.size} import batches`);
    stores.import.setIsImportEditorOpen(false);
    stores.import.setIsImportManagerOpen(true);
  };

  const parseDiffTags = ({
    cache,
    diffusionParams,
    originalTagId,
    upscaledTagId,
  }: {
    cache: EditorImportsCache;
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
      diffFileTagIds.push(...cache.getTagIdsByDiffRegEx(parsedParams.prompt));
      if (DEBUG) perfLog(`Parsed tag ids from diffusion params via regEx`);
    }

    if (withDiffusionModel) {
      const modelTagLabel = `Diff Model: ${parsedParams.model}`;
      const modelTag = cache.getTagByLabel(modelTagLabel);
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

  const replaceTagsFromRegEx = (cache: EditorImportsCache, tag: TagToUpsert) => {
    const copy = { ...tag };

    const tagIds = cache.getTagIdsByFolderRegEx(copy.label);
    if (tagIds?.length) {
      tagIds.forEach((tagId) => {
        const label = cache.getTagById(tagId)?.label;
        if (label && !copy.parentLabels?.includes(label)) {
          copy.id = tagId;
          copy.label = label;
        }
      });
    }

    if (copy.parentLabels) {
      copy.parentLabels.forEach((parentLabel, idx) => {
        const parentTagIds = cache.getTagIdsByFolderRegEx(parentLabel);
        if (parentTagIds?.length) {
          parentTagIds.forEach((tagId) => {
            const parentLabel = cache.getTagById(tagId)?.label;
            if (
              parentLabel &&
              parentLabel !== copy.label &&
              !copy.parentLabels.includes(parentLabel)
            )
              copy.parentLabels[idx] = parentLabel;
          });
        }
      });
    }

    return copy;
  };

  const upsertDiffMetaTags = async () => {
    const diffMetaTagsToEdit: TagToUpsert[] = [];
    let modelTag: Tag;
    let originalTag: Tag;
    let upscaledTag: Tag;

    if (!withDiffusionTags) stores.import.clearValues({ tagIds: true, tagsToUpsert: true });
    else {
      let diffTag = stores.tag.getByLabel(config.imports.labelDiff);
      if (!diffTag) {
        const res = await stores.tag.createTag({ label: config.imports.labelDiff });
        if (!res.success) throw new Error(res.error);
        diffTag = stores.tag.getById(res.data.id);
      }

      await Promise.all(
        [
          config.imports.labelDiffModel,
          config.imports.labelDiffOriginal,
          config.imports.labelDiffUpscaled,
        ].map(async (label) => {
          const tag = stores.tag.getByLabel(label);
          if (!tag) await stores.tag.createTag({ label, parentIds: [diffTag.id] });
        })
      );

      modelTag = stores.tag.getByLabel(config.imports.labelDiffModel);
      originalTag = stores.tag.getByLabel(config.imports.labelDiffOriginal);
      upscaledTag = stores.tag.getByLabel(config.imports.labelDiffUpscaled);

      const importsWithParams = stores.import.editorImports.filter(
        (imp) => imp.diffusionParams?.length
      );

      if (importsWithParams.length > 0) {
        diffMetaTagsToEdit.push(
          ...[
            { id: diffTag.id, label: config.imports.labelDiff },
            {
              id: modelTag.id,
              label: config.imports.labelDiffModel,
              parentLabels: [config.imports.labelDiff],
            },
            {
              id: originalTag.id,
              label: config.imports.labelDiffOriginal,
              parentLabels: [config.imports.labelDiff],
            },
            {
              id: upscaledTag.id,
              label: config.imports.labelDiffUpscaled,
              parentLabels: [config.imports.labelDiff],
            },
          ]
        );
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
        console.log(
          "/* ------------------------------- New Scan ------------------------------ */"
        );
      const cache = new EditorImportsCache(stores);

      /* ---------------------------------- Files --------------------------------- */
      const { diffMetaTagsToEdit, editorImports, fileTagsToUpsert } =
        await fileToTagsAndDiffParams(cache);
      diffMetaTagsToEdit.forEach((tag) => cache.tagsToEditMap.set(tag.id, tag));
      if (DEBUG) perfLog("Parsed file tags and diffusion params");

      /* --------------------------------- Folders -------------------------------- */
      const folderMap = new Map<string, FlatFolder>();

      editorImports.forEach((imp, idx) => {
        const folderName = path.dirname(imp.path);
        const folderInMap = folderMap.get(folderName);

        if (folderInMap) folderInMap.imports.push(imp);
        else {
          const folder = createFolder({ cache, fileImport: imp, folderName });
          folderMap.set(folderName, folder);
          if (DEBUG) perfLog(`Created folder #${folderMap.size}`);
        }

        if (imp.tagsToUpsert)
          imp.tagsToUpsert.forEach((tag) => cache.tagsToCreateMap.set(tag.label, tag));
        if (DEBUG) perfLog(`Parsed import #${idx + 1} / ${editorImports.length}`);
      });
      if (DEBUG) perfLog("Parsed flat folder hierarchy");

      const sortedFolderMap = new Map(
        [...folderMap.entries()].sort(
          (a, b) => a[1].folderNameParts.length - b[1].folderNameParts.length
        )
      );
      if (DEBUG) perfLog("Sorted flat folder hierarchy");

      setFlatFolderHierarchy(sortedFolderMap);
      if (DEBUG) perfLog("Set flat folder hierarchy");

      /* ----------------------------------- Tags ---------------------------------- */
      const tagsToUpsertMap = new Map<string, TagToUpsert>();

      [
        ...fileTagsToUpsert,
        ...cache.tagsToCreateMap.values(),
        ...cache.tagsToEditMap.values(),
      ].forEach((cur) => {
        const tag = withFolderNameRegEx ? replaceTagsFromRegEx(cache, cur) : cur;
        if (!tagsToUpsertMap.has(tag.label)) tagsToUpsertMap.set(tag.label, tag);
      });
      if (DEBUG) perfLog("Parsed flat tags to upsert");

      const tagsToUpsert = [...tagsToUpsertMap.values()];
      setFlatTagsToUpsert(tagsToUpsert);
      if (DEBUG) perfLog("Set flat tags to upsert");

      setTagHierarchy(
        tagsToUpsert
          .filter((t) => !t.parentLabels?.length)
          .map((t) => ({ ...t, children: createTagHierarchy(tagsToUpsert, t.label) }))
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
            label={`${commas(stores.import.editorImports.length)} Files / ${commas(flatFolderHierarchy.size)} Folders`}
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
              setChecked={toggleWithFolderNameRegEx}
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
                value={stores.import.editorFlattenTo}
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

                {[...stores.import.editorRootFolderPath.split(path.sep), "*"].map((p, i) => (
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
