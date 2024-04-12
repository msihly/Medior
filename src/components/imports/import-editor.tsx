import path from "path";
import { useState } from "react";
import { RegExMapType } from "database";
import { observer } from "mobx-react-lite";
import { ModelCreationData } from "mobx-keystone";
import { FileImport, Tag, useStores } from "store";
import { Divider } from "@mui/material";
import {
  Button,
  Checkbox,
  CheckboxProps,
  ConfirmModal,
  LoadingOverlay,
  Modal,
  Text,
  View,
} from "components";
import {
  FlatFolderHierarchy,
  FolderToCollMode,
  FolderToTagsMode,
  ImportFolderList,
  RootFolderButton,
  TagHierarchy,
  TagToUpsert,
} from ".";
import {
  colors,
  getConfig,
  makeClasses,
  parseDiffParam,
  parseDiffParams,
  useDeepEffect,
} from "utils";
import { toast } from "react-toastify";

type RegExMaps = { regEx: RegExp; tagId: string }[];

export const ImportEditor = observer(() => {
  const config = getConfig();

  const { css, cx } = useClasses(null);

  const { importStore, tagStore } = useStores();

  const [deleteOnImport, setDeleteOnImport] = useState(config.imports.deleteOnImport);
  const [flatFolderHierarchy, setFlatFolderHierarchy] = useState<FlatFolderHierarchy>([]);
  const [flatTagsToUpsert, setFlatTagsToUpsert] = useState<TagToUpsert[]>([]);
  const [folderToCollectionMode, setFolderToCollectionMode] = useState<FolderToCollMode>(
    config.imports.folderToCollMode
  );
  const [folderToTagsMode, setFolderToTagsMode] = useState<FolderToTagsMode>(
    config.imports.folderToTagsMode
  );
  const [ignorePrevDeleted, setIgnorePrevDeleted] = useState(config.imports.ignorePrevDeleted);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tagHierarchy, setTagHierarchy] = useState<TagToUpsert[]>([]);
  const [withDelimiters, setWithDelimiters] = useState(config.imports.withDelimiters);
  const [withDiffusionModel, setWithDiffusionModel] = useState(config.imports.withDiffModel);
  const [withDiffusionParams, setWithDiffusionParams] = useState(config.imports.withDiffParams);
  const [withDiffusionRegExMaps, setWithDiffusionRegExMaps] = useState(
    config.imports.withDiffRegEx
  );
  const [withDiffusionTags, setWithDiffusionTags] = useState(config.imports.withDiffTags);
  const [withFileNameToTags, setWithFileNameToTags] = useState(config.imports.withFileNameToTags);
  const [withFolderNameRegEx, setWithFolderNameRegEx] = useState(
    config.imports.withFolderNameRegEx
  );
  const [withNewTagsToRegEx, setWithNewTagsToRegEx] = useState(config.imports.withNewTagsToRegEx);

  const isDisabled = isLoading || isSaving;

  const confirmDiscard = () => setIsConfirmDiscardOpen(true);

  const handleClose = () => importStore.setIsImportEditorOpen(false);

  const handleFolderToCollection = (checked: boolean) =>
    setFolderToCollectionMode(checked ? "withoutTag" : "none");

  const handleFoldersToTags = (checked: boolean) =>
    setFolderToTagsMode(checked ? "hierarchical" : "none");

  const handleTagManager = () => {
    if (tagStore.isTagManagerOpen) tagStore.setIsTagManagerOpen(false);
    setTimeout(() => tagStore.setIsTagManagerOpen(true), 0);
  };

  const toggleFolderToCollWithTag = () =>
    setFolderToCollectionMode((prev) => (prev === "withTag" ? "withoutTag" : "withTag"));

  const toggleFoldersToTagsCascading = () => setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () => setFolderToTagsMode("hierarchical");

  const toggleWithFolderNameRegEx = () => setWithFolderNameRegEx((prev) => !prev);

  const checkboxProps: Partial<CheckboxProps> = { disabled: isDisabled, flex: "initial" };

  /* -------------------------------------------------------------------------- */
  /*                                INGEST LOGIC                                */
  /* -------------------------------------------------------------------------- */
  const createFolder = ({
    fileImport,
    folderName,
    folderNameRegExMaps,
    tagsToCreate,
    tagsToEdit,
  }: {
    fileImport: ModelCreationData<FileImport>;
    folderName: string;
    folderNameRegExMaps: RegExMaps;
    tagsToCreate: TagToUpsert[];
    tagsToEdit: TagToUpsert[];
  }) => {
    const _tagsToCreate = [];
    const _tagsToEdit = [];
    const folderTags: TagToUpsert[] = [];

    const folderNameParts = folderName.split(path.sep).slice(importStore.editorRootFolderIndex);
    const collectionTitle =
      folderToCollectionMode !== "none"
        ? (folderToCollectionMode === "withTag" ? folderNameParts.slice() : folderNameParts).pop()
        : null;

    const tagLabel = folderNameParts.slice().pop()!;
    const tagParentLabel = folderNameParts.slice(0, -1).pop();

    if (folderToTagsMode !== "none") {
      /** Parse cascading tags from folder hierarchy */
      if (folderToTagsMode === "cascading") {
        const labels = withDelimiters ? folderNameParts.flatMap(delimit) : folderNameParts;
        labels.forEach((label) => {
          const tag = tagStore.getByLabel(label);
          if (!tag && !tagsToCreate.find((t) => t.label === label)) {
            _tagsToCreate.push({ label, withRegEx: withNewTagsToRegEx });
            folderTags.push({ label });
          } else folderTags.push({ id: tag?.id, label });
        });
      }

      /** Parse hierarchical tags from folder hierarchy */
      if (folderToTagsMode === "hierarchical" && tagLabel) {
        delimit(tagLabel).forEach((label) => {
          const id = tagStore.getByLabel(label)?.id;
          const parentLabels = tagParentLabel ? delimit(tagParentLabel) : [];
          folderTags.push({ id, label, parentLabels });
        });

        folderNameParts.forEach((label, idx) => {
          delimit(label).forEach((label) => {
            const tag = tagStore.getByLabel(label);
            const parentLabel = folderNameParts[idx - 1];
            const parentLabels = parentLabel ? delimit(parentLabel) : [];

            if (!tag && !tagsToCreate.find((t) => t.label === label))
              _tagsToCreate.push({ label, parentLabels, withRegEx: withNewTagsToRegEx });
            else if (tag && !tagsToEdit.find((t) => t.id === tag.id))
              _tagsToEdit.push({ id: tag.id, label, parentLabels });
          });
        });
      }

      /** Parse folder name regex mappings; replace duplicate tags to upsert */
      if (withFolderNameRegEx) {
        folderTags.push(
          ...parseTagsFromRegEx(folderNameRegExMaps, folderName).reduce((acc, id) => {
            const label = tagStore.getById(id)?.label;
            if (!label) {
              console.error(`Tag with id ${id} not found in tagStore`);
              return acc;
            }

            const hasFolderTag = [...acc, ...folderTags].find((t) => t.label === label);
            if (!hasFolderTag) acc.push({ id, label });

            return acc;
          }, [] as TagToUpsert[])
        );
      }
    }

    /** Filter out ancestors of other tags in the folder or duplicates from regex maps */
    const tags = folderTags.reduce((acc, tag) => {
      const hasDescendants = folderTags.some((otherTag) => {
        const parentLabels = [
          ...new Set([
            otherTag.parentLabels ?? [],
            otherTag.id
              ? tagStore.getParentTags(tagStore.getById(otherTag.id), true).map((t) => t.label)
              : [],
          ]),
        ].flat();

        return parentLabels.includes(tag.label);
      });

      if (hasDescendants) return acc;

      const tagToPush = withFolderNameRegEx ? replaceTagsFromRegEx(tag, folderNameRegExMaps) : tag;
      if (acc.find((t) => t.label === tagToPush.label)) return acc;
      else acc.push(tagToPush);

      return acc;
    }, [] as TagToUpsert[]);

    return {
      _tagsToCreate,
      _tagsToEdit,
      /** The folder to be added to the hierarchy */
      folder: {
        collectionTitle,
        folderName,
        folderNameParts,
        imports: [fileImport],
        tags,
      },
    };
  };

  const createTagHierarchy = (tags: TagToUpsert[], label: string): TagToUpsert[] =>
    tags
      .filter((c) => c.parentLabels?.includes(label))
      .map((c) => ({ ...c, children: createTagHierarchy(tags, c.label) }));

  const delimit = (str: string) =>
    withDelimiters ? str.split(config.imports.folderDelimiter).map((l) => l.trim()) : [str];

  const fileToTagsAndDiffParams = async () => {
    const fileNameRegExMaps = getRegExMaps("fileName");

    if (!withDiffusionParams)
      importStore.clearValues({ diffusionParams: true, tagIds: true, tagsToUpsert: true });
    else await importStore.loadDiffusionParams();

    /** Create meta tags for diffusion params if not found. */
    const { diffMetaTagsToEdit, originalTag, upscaledTag } = await upsertDiffMetaTags();

    /** Directly update file imports with their own tags derived from RegEx maps and diffusion params. */
    const editorImports = importStore.editorImports.map((imp) => {
      const fileTagIds: string[] = [];
      const fileTagsToUpsert: TagToUpsert[] = [];

      if (withFileNameToTags) fileTagIds.push(...parseTagsFromRegEx(fileNameRegExMaps, imp.name));

      if (imp.diffusionParams?.length) {
        const { diffFileTagIds, diffFileTagsToUpsert } = parseDiffTags({
          diffusionParams: imp.diffusionParams,
          originalTagId: originalTag.id,
          upscaledTagId: upscaledTag.id,
        });

        fileTagIds.push(...diffFileTagIds);
        fileTagsToUpsert.push(...diffFileTagsToUpsert);
      }

      const tagIds = [...new Set(fileTagIds)].reduce((acc, curId) => {
        if (acc.find((id) => id === curId)) return acc;

        const hasDescendants = fileTagIds.some((otherId) => {
          const otherTag = tagStore.getById(otherId);
          const parentIds = [
            ...new Set([
              otherTag?.parentIds ?? [],
              otherTag ? tagStore.getParentTags(otherTag, true).map((t) => t.id) : [],
            ]),
          ].flat();

          return parentIds.includes(curId);
        });

        if (!hasDescendants) acc.push(curId);
        return acc;
      }, [] as string[]);

      const updates = { tagIds, tagsToUpsert: fileTagsToUpsert };
      imp.update(updates);
      return { ...imp.$, ...updates };
    });

    return { diffMetaTagsToEdit, editorImports };
  };

  const getRegExMaps = (type: RegExMapType): RegExMaps =>
    tagStore
      .listRegExMapsByType(type)
      .map((map) => ({ regEx: new RegExp(map.regEx, "im"), tagId: map.tagId }));

  const handleConfirm = async () => {
    setIsSaving(true);

    if (flatTagsToUpsert.length > 0) {
      const res = await tagStore.upsertTags(flatTagsToUpsert);
      await tagStore.loadTags();

      if (!res.success) {
        console.error(res.error);
        toast.error("Failed to create tags");
        return setIsSaving(false);
      }
    }

    const batches = flatFolderHierarchy.map((folder) => ({
      collectionTitle: folder.collectionTitle,
      deleteOnImport,
      ignorePrevDeleted,
      imports: folder.imports.map((imp) => ({
        ...imp,
        tagIds: [
          ...new Set(
            [
              ...imp.tagIds,
              ...imp.tagsToUpsert.map((t) => tagStore.getByLabel(t.label)?.id),
            ].filter(Boolean)
          ),
        ],
      })),
      rootFolderPath: folder.folderName
        .split(path.sep)
        .slice(0, importStore.editorRootFolderIndex + 1)
        .join(path.sep),
      tagIds: folder.tags.map((t) => tagStore.getByLabel(t.label)?.id).filter(Boolean),
    }));

    const res = await importStore.createImportBatches(batches);
    if (!res.success) throw new Error(res.error);

    setIsSaving(false);

    toast.success(
      `Queued ${flatFolderHierarchy.reduce((acc, cur) => acc + cur.imports.length, 0)} imports`
    );

    handleClose();
    importStore.setIsImportManagerOpen(true);
  };

  const parseDiffTags = ({
    diffusionParams,
    originalTagId,
    upscaledTagId,
  }: {
    diffusionParams: string;
    originalTagId: string;
    upscaledTagId: string;
  }) => {
    const diffFileTagIds: string[] = [];
    const diffFileTagsToUpsert: TagToUpsert[] = [];

    const parsedParams = parseDiffParams(diffusionParams);

    if (withDiffusionRegExMaps) {
      tagStore.listRegExMapsByType("diffusionParams").forEach((map) => {
        const regEx = new RegExp(map.regEx, "im");
        if (regEx.test(parsedParams.prompt)) diffFileTagIds.push(map.tagId);
      });
    }

    if (withDiffusionModel) {
      const modelTagLabel = `Diff Model: ${parsedParams.model}`;
      const modelTag = tagStore.getByLabel(modelTagLabel);

      if (modelTag) diffFileTagIds.push(modelTag.id);
      else {
        const tagToUpsert = {
          aliases: [`Model Hash: ${parseDiffParam(parsedParams.modelHash, "Model hash", false)}`],
          label: modelTagLabel,
          parentLabel: config.imports.labelDiffModel,
        };

        diffFileTagsToUpsert.push(tagToUpsert);
      }
    }

    const upscaledTypeTagId = parsedParams.isUpscaled ? upscaledTagId : originalTagId;
    if (!diffFileTagIds.includes(upscaledTypeTagId)) diffFileTagIds.push(upscaledTypeTagId);

    return { diffFileTagIds, diffFileTagsToUpsert };
  };

  const parseTagsFromRegEx = (regExMaps: RegExMaps, name: string) =>
    regExMaps.reduce((acc, cur) => {
      if (cur.regEx.test(name)) acc.push(cur.tagId);
      return acc;
    }, [] as string[]);

  const replaceTagsFromRegEx = (tag: TagToUpsert, regExMaps: RegExMaps) => {
    const _tag = { ...tag };

    const labelMatch = regExMaps.find((map) => map.regEx.test(_tag.label));
    if (labelMatch) {
      const label = tagStore.getById(labelMatch.tagId)?.label;
      if (label && !_tag.parentLabels?.includes(label)) {
        _tag.id = labelMatch.tagId;
        _tag.label = label;
      }
    }

    if (_tag.parentLabels) {
      _tag.parentLabels.forEach((parentLabel, idx) => {
        const parentLabelMatch = regExMaps.find((map) => map.regEx.test(parentLabel));
        if (parentLabelMatch) {
          const parentLabel = tagStore.getById(parentLabelMatch.tagId)?.label;
          if (parentLabel && parentLabel !== _tag.label && !_tag.parentLabels.includes(parentLabel))
            _tag.parentLabels[idx] = parentLabel;
        }
      });
    }

    return _tag;
  };

  const upsertDiffMetaTags = async () => {
    const diffMetaTagsToEdit: TagToUpsert[] = [];
    let modelTag: Tag;
    let originalTag: Tag;
    let upscaledTag: Tag;

    if (!withDiffusionTags) importStore.clearValues({ tagIds: true, tagsToUpsert: true });
    else {
      let diffTag = tagStore.getByLabel(config.imports.labelDiff);
      if (!diffTag) {
        const res = await tagStore.createTag({ label: config.imports.labelDiff });
        if (!res.success) throw new Error(res.error);
        diffTag = tagStore.getById(res.data.id);
      }

      await Promise.all(
        [
          config.imports.labelDiffModel,
          config.imports.labelDiffOriginal,
          config.imports.labelDiffUpscaled,
        ].map(async (label) => {
          const tag = tagStore.getByLabel(label);
          if (!tag) await tagStore.createTag({ label, parentIds: [diffTag.id] });
        })
      );

      modelTag = tagStore.getByLabel(config.imports.labelDiffModel);
      originalTag = tagStore.getByLabel(config.imports.labelDiffOriginal);
      upscaledTag = tagStore.getByLabel(config.imports.labelDiffUpscaled);

      const importsWithParams = importStore.editorImports.filter(
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

  useDeepEffect(() => {
    if (isSaving) return;
    setIsLoading(true);

    setTimeout(async () => {
      const folderNameRegExMaps = getRegExMaps("folderName");
      const tagsToCreate: TagToUpsert[] = [];
      const tagsToEdit: TagToUpsert[] = [];

      /* ---------------------------------- Files --------------------------------- */
      const { diffMetaTagsToEdit, editorImports } = await fileToTagsAndDiffParams();
      tagsToEdit.push(...diffMetaTagsToEdit);

      /* --------------------------------- Folders -------------------------------- */
      const flatFolderHierarchy = editorImports
        .reduce((hierarchy, imp) => {
          const folderName = path.dirname(imp.path);
          const folder = hierarchy.find((f) => f.folderName === folderName);

          if (folder) folder.imports.push(imp);
          else {
            const { folder, _tagsToCreate, _tagsToEdit } = createFolder({
              fileImport: imp,
              folderName,
              folderNameRegExMaps,
              tagsToCreate,
              tagsToEdit,
            });

            hierarchy.push(folder);
            tagsToCreate.push(..._tagsToCreate);
            tagsToEdit.push(..._tagsToEdit);
          }

          if (imp.tagsToUpsert) tagsToCreate.push(...imp.tagsToUpsert);

          return hierarchy;
        }, [] as FlatFolderHierarchy)
        .sort((a, b) => a.folderNameParts.length - b.folderNameParts.length);

      setFlatFolderHierarchy(flatFolderHierarchy);

      /* ----------------------------------- Tags ---------------------------------- */
      const tagsToUpsert = [...tagsToCreate, ...tagsToEdit].reduce((acc, cur) => {
        const tag = withFolderNameRegEx ? replaceTagsFromRegEx(cur, folderNameRegExMaps) : cur;
        if (!acc.find((t) => t.label === tag.label)) acc.push(tag);
        return acc;
      }, [] as TagToUpsert[]);
      setFlatTagsToUpsert(tagsToUpsert);

      setTagHierarchy(
        tagsToUpsert
          .filter((t) => !t.parentLabels?.length)
          .map((t) => ({ ...t, children: createTagHierarchy(tagsToUpsert, t.label) }))
      );

      setIsLoading(false);
    }, 50);
  }, [
    folderToCollectionMode,
    folderToTagsMode,
    importStore.editorFilePaths,
    importStore.editorRootFolderIndex,
    isSaving,
    withDelimiters,
    withDiffusionModel,
    withDiffusionParams,
    withDiffusionRegExMaps,
    withDiffusionTags,
    withFileNameToTags,
    withFolderNameRegEx,
    tagStore.tags,
  ]);

  return (
    <Modal.Container width="100%" height="100%">
      <LoadingOverlay isLoading={isDisabled} />

      <Modal.Header leftNode={<Button text="Tag Manager" icon="More" onClick={handleTagManager} />}>
        <Text>{"Import Editor"}</Text>
      </Modal.Header>

      <Modal.Content className={css.vertScroll}>
        <View className={css.body}>
          <View className={cx(css.container, css.leftColumn)}>
            <Checkbox
              label="Delete on Import"
              checked={deleteOnImport}
              setChecked={setDeleteOnImport}
              {...checkboxProps}
            />

            <Checkbox
              label="Ignore Prev. Deleted"
              checked={ignorePrevDeleted}
              setChecked={setIgnorePrevDeleted}
              {...checkboxProps}
            />

            <Divider />

            <Checkbox
              label="New Tags to RegEx"
              checked={withNewTagsToRegEx}
              setChecked={setWithNewTagsToRegEx}
              {...checkboxProps}
            />

            <Divider />

            <Checkbox
              label="File to Tags (RegEx)"
              checked={withFileNameToTags}
              setChecked={setWithFileNameToTags}
              {...checkboxProps}
            />

            <Divider />

            <Checkbox
              label="Folder to Tags"
              checked={folderToTagsMode !== "none"}
              setChecked={handleFoldersToTags}
              {...checkboxProps}
            />

            <View column margins={{ left: "1rem" }}>
              <Checkbox
                label="Hierarchical"
                checked={folderToTagsMode.includes("hierarchical")}
                setChecked={toggleFoldersToTagsHierarchical}
                disabled={folderToTagsMode === "none"}
                {...checkboxProps}
              />

              <Checkbox
                label="Cascading"
                checked={folderToTagsMode === "cascading"}
                setChecked={toggleFoldersToTagsCascading}
                disabled={folderToTagsMode === "none"}
                {...checkboxProps}
              />

              <Checkbox
                label="Delimited"
                checked={withDelimiters}
                setChecked={setWithDelimiters}
                disabled={folderToTagsMode === "none"}
                {...checkboxProps}
              />

              <Checkbox
                label="With RegEx"
                checked={withFolderNameRegEx}
                setChecked={toggleWithFolderNameRegEx}
                disabled={folderToTagsMode === "none"}
                {...checkboxProps}
              />
            </View>

            <Divider />

            <Checkbox
              label="Folder to Collection"
              checked={folderToCollectionMode !== "none"}
              setChecked={handleFolderToCollection}
              {...checkboxProps}
            />

            <View column margins={{ left: "1rem" }}>
              <Checkbox
                label="With Tag"
                checked={folderToCollectionMode === "withTag"}
                setChecked={toggleFolderToCollWithTag}
                disabled={folderToCollectionMode === "none"}
                {...checkboxProps}
              />
            </View>

            <Divider />

            <Checkbox
              label="Diffusion Params"
              checked={withDiffusionParams}
              setChecked={setWithDiffusionParams}
              {...checkboxProps}
            />

            <View column margins={{ left: "1rem" }}>
              <Checkbox
                label="With Tags"
                checked={withDiffusionTags}
                setChecked={setWithDiffusionTags}
                disabled={!withDiffusionParams}
                {...checkboxProps}
              />

              <View column margins={{ left: "1rem" }}>
                <Checkbox
                  label="Model"
                  checked={withDiffusionModel}
                  setChecked={setWithDiffusionModel}
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  {...checkboxProps}
                />

                <Checkbox
                  label="With RegEx"
                  checked={withDiffusionRegExMaps}
                  setChecked={setWithDiffusionRegExMaps}
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  {...checkboxProps}
                />
              </View>
            </View>
          </View>

          <View className={css.rightColumn}>
            {(folderToTagsMode !== "none" ||
              folderToCollectionMode === "withTag" ||
              (withDiffusionParams && withDiffusionTags)) && (
              <View flex={0} className={css.container}>
                <View className={css.rootTagSelector}>
                  <Text fontWeight={500} fontSize="0.9em" marginRight="0.5rem">
                    {"Select Root Tag"}
                  </Text>

                  {[...importStore.editorRootFolderPath.split(path.sep), "*"].map((p, i) => (
                    <RootFolderButton key={i} index={i} folderPart={p} />
                  ))}
                </View>

                <View className={css.tags}>
                  {tagHierarchy.map((t) => (
                    <TagHierarchy key={t.label} tag={t} />
                  ))}
                </View>
              </View>
            )}

            <View flex={1} className={cx(css.container, css.vertScroll)}>
              {flatFolderHierarchy.map((f, i) => (
                <ImportFolderList
                  key={i}
                  collectionTitle={f.collectionTitle}
                  imports={f.imports}
                  tags={f.tags}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Close"
          icon="Close"
          onClick={confirmDiscard}
          disabled={isDisabled}
          color={colors.button.red}
        />

        <Button
          text="Confirm"
          icon="Check"
          onClick={handleConfirm}
          disabled={isDisabled}
          color={colors.button.blue}
        />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to cancel importing?"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleClose}
        />
      )}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  body: {
    display: "flex",
    flexDirection: "row",
    flex: 1,
    height: "-webkit-fill-available",
  },
  container: {
    display: "flex",
    flexDirection: "column",
    borderRadius: 4,
    width: "100%",
    padding: "0.5rem",
    backgroundColor: colors.grey["800"],
  },
  leftColumn: {
    flexShrink: 0,
    width: "15rem",
    marginRight: "0.5rem",
    overflowY: "auto",
  },
  rightColumn: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    "& > *:not(:last-child)": { marginBottom: "0.5rem" },
  },
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
  vertScroll: {
    overflowY: "auto",
  },
});
