import path from "path";
import { useEffect, useState } from "react";
import { RegExMapType } from "database";
import { observer } from "mobx-react-lite";
import { ModelCreationData } from "mobx-keystone";
import { FileImport, Tag, useStores } from "store";
import { Divider } from "@mui/material";
import {
  Button,
  CenteredText,
  Checkbox,
  CheckboxProps,
  ConfirmModal,
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
import { PromiseQueue, colors, makeClasses } from "utils";
import { toast } from "react-toastify";
import Color from "color";

type RegExMaps = { regEx: RegExp; tagId: string }[];

const FOLDER_DELIMITER = ";;";
const LABEL_DIFF = "Diffusion";
const LABEL_DIFF_MODEL = "Diffusion Model";
const LABEL_DIFF_ORIGINAL = "Diff: Original";
const LABEL_DIFF_UPSCALED = "Diff: Upscaled";

export const ImportEditor = observer(() => {
  const { css, cx } = useClasses(null);

  const { importStore, tagStore } = useStores();

  const [deleteOnImport, setDeleteOnImport] = useState(true);
  const [flatFolderHierarchy, setFlatFolderHierarchy] = useState<FlatFolderHierarchy>([]);
  const [flatTagsToUpsert, setFlatTagsToUpsert] = useState<TagToUpsert[]>([]);
  const [folderToCollectionMode, setFolderToCollectionMode] = useState<FolderToCollMode>("none");
  const [folderToTagsMode, setFolderToTagsMode] = useState<FolderToTagsMode>("none");
  const [ignorePrevDeleted, setIgnorePrevDeleted] = useState(true);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tagHierarchy, setTagHierarchy] = useState<TagToUpsert[]>([]);
  const [withDelimiters, setWithDelimiters] = useState(true);
  const [withDiffusionModel, setWithDiffusionModel] = useState(true);
  const [withDiffusionRegExMaps, setWithDiffusionRegExMaps] = useState(true);
  const [withDiffusionParams, setWithDiffusionParams] = useState(false);
  const [withDiffusionTags, setWithDiffusionTags] = useState(true);
  const [withFileNameToTags, setWithFileNameToTags] = useState(false);
  const [withFolderNameRegEx, setWithFolderNameRegEx] = useState(true);
  const [withNewTagsToRegEx, setWithNewTagsToRegEx] = useState(true);

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
    withDelimiters ? str.split(FOLDER_DELIMITER).map((l) => l.trim()) : [str];

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

      const updates = { tagIds: [...new Set(fileTagIds)], tagsToUpsert: fileTagsToUpsert };
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
      const tagQueue = new PromiseQueue();
      const errors: string[] = [];

      flatTagsToUpsert.forEach((t) =>
        tagQueue.add(async () => {
          try {
            const parentTags = t.parentLabels
              ? t.parentLabels.map((l) => tagStore.getByLabel(l)).filter(Boolean)
              : null;
            const parentIds = parentTags?.map((t) => t.id) ?? [];

            if (t.id) {
              const tag = tagStore.getById(t.id);
              if (!parentIds.length || tag.parentIds.some((id) => parentIds.includes(id))) return;

              const res = await tagStore.editTag({
                id: t.id,
                parentIds: parentIds.length ? [...tag.parentIds, ...parentIds] : [],
                withSub: false,
              });
              if (!res.success) throw new Error(res.error);
            } else {
              const res = await tagStore.createTag({
                label: t.label,
                parentIds,
                withRegEx: t.withRegEx,
                withSub: false,
              });
              if (!res.success) throw new Error(res.error);
            }
          } catch (err) {
            errors.push(err.message);
          }
        })
      );

      await tagQueue.queue;
      await tagStore.loadTags();

      if (errors.length) {
        console.error(errors);
        toast.error("Failed to create tags");
        return setIsSaving(false);
      }
    }

    const batches = flatFolderHierarchy.map((folder) => ({
      collectionTitle: folder.collectionTitle,
      deleteOnImport,
      ignorePrevDeleted,
      imports: [...folder.imports],
      rootFolderPath: folder.folderName,
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

  const parseDiffParam = <IsNum extends boolean>(
    diffParams: string,
    paramName: string,
    isNumber: IsNum,
    optional = false,
    endDelimiter = ",",
    startDelimeter = ": "
  ): IsNum extends true ? number : string => {
    try {
      const hasParam = diffParams.includes(`${paramName}: `);
      if (!hasParam) {
        if (!optional)
          throw new Error(
            `Param "${paramName}" not found in generation parameters: ${diffParams}.`
          );
        return undefined;
      }

      const rawParamUnterminated = diffParams.substring(
        diffParams.indexOf(`${paramName}${startDelimeter}`)
      );
      const startIndex = rawParamUnterminated.indexOf(startDelimeter) + startDelimeter.length;
      let endIndex = rawParamUnterminated.indexOf(endDelimiter, startIndex);
      if (!(endIndex > 0)) endIndex = undefined;

      const value = rawParamUnterminated
        .substring(startIndex, endIndex)
        ?.replace?.(/^(\s|\r)|(\s|\r)$/gim, "");
      if (isNumber) {
        if (isNaN(+value)) throw new Error(`Received NaN when parsing ${paramName}`);
        return +value as any;
      } else return value as any;
    } catch (err) {
      return undefined;
    }
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

    const negPromptEndIndex = diffusionParams.indexOf("Steps: ");
    let negPromptStartIndex = diffusionParams.indexOf("Negative prompt: ");
    if (negPromptStartIndex < 0) negPromptStartIndex = negPromptEndIndex;

    const prompt = diffusionParams.substring(0, negPromptStartIndex).replace(/(\n|\r)$/gim, "");
    const restParams = diffusionParams.substring(negPromptEndIndex);

    if (withDiffusionRegExMaps) {
      tagStore.listRegExMapsByType("diffusionParams").forEach((map) => {
        const regEx = new RegExp(map.regEx, "im");
        if (regEx.test(prompt)) diffFileTagIds.push(map.tagId);
      });
    }

    if (withDiffusionModel) {
      const rawModelName = parseDiffParam(restParams, "Model", false);
      const modelTagLabel = `Diff Model: ${rawModelName}`;
      const modelTag = tagStore.getByLabel(modelTagLabel);

      if (modelTag) diffFileTagIds.push(modelTag.id);
      else {
        const tagToUpsert = {
          aliases: [`Model Hash: ${parseDiffParam(restParams, "Model hash", false)}`],
          label: modelTagLabel,
          parentLabel: LABEL_DIFF_MODEL,
        };

        diffFileTagsToUpsert.push(tagToUpsert);
      }
    }

    const isUpscaled = parseDiffParam(restParams, "Hires upscaler", false, true) !== undefined;
    const upscaledTypeTagId = isUpscaled ? upscaledTagId : originalTagId;
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
      let diffTag = tagStore.getByLabel(LABEL_DIFF);
      if (!diffTag) {
        const res = await tagStore.createTag({ label: LABEL_DIFF });
        if (!res.success) throw new Error(res.error);
        diffTag = tagStore.getById(res.data.id);
      }

      await Promise.all(
        [LABEL_DIFF_MODEL, LABEL_DIFF_ORIGINAL, LABEL_DIFF_UPSCALED].map(async (label) => {
          const tag = tagStore.getByLabel(label);
          if (!tag) await tagStore.createTag({ label, parentIds: [diffTag.id] });
        })
      );

      modelTag = tagStore.getByLabel(LABEL_DIFF_MODEL);
      originalTag = tagStore.getByLabel(LABEL_DIFF_ORIGINAL);
      upscaledTag = tagStore.getByLabel(LABEL_DIFF_UPSCALED);

      const importsWithParams = importStore.editorImports.filter(
        (imp) => imp.diffusionParams?.length
      );

      if (importsWithParams.length > 0) {
        diffMetaTagsToEdit.push(
          ...[
            { id: diffTag.id, label: LABEL_DIFF },
            { id: modelTag.id, label: LABEL_DIFF_MODEL, parentLabels: [LABEL_DIFF] },
            { id: originalTag.id, label: LABEL_DIFF_ORIGINAL, parentLabels: [LABEL_DIFF] },
            { id: upscaledTag.id, label: LABEL_DIFF_UPSCALED, parentLabels: [LABEL_DIFF] },
          ]
        );
      }
    }

    return { diffMetaTagsToEdit, modelTag, originalTag, upscaledTag };
  };

  useEffect(() => {
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

          return hierarchy;
        }, [] as FlatFolderHierarchy)
        .sort((a, b) => a.folderNameParts.length - b.folderNameParts.length);

      setFlatFolderHierarchy(flatFolderHierarchy);

      /* ----------------------------------- Tags ---------------------------------- */
      const tagsToUpsert = [...tagsToCreate, ...tagsToEdit].map((tag) => {
        return withFolderNameRegEx ? replaceTagsFromRegEx(tag, folderNameRegExMaps) : tag;
      });
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
    importStore.editorImports,
    importStore.editorRootFolderIndex,
    isSaving,
    withDelimiters,
    withDiffusionModel,
    withDiffusionParams,
    withDiffusionRegExMaps,
    withDiffusionTags,
    withFileNameToTags,
    withFolderNameRegEx,
    JSON.stringify(tagStore.tags),
  ]);

  return (
    <Modal.Container width="100%" height="100%">
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
            {isDisabled ? (
              <CenteredText
                text={isLoading ? "Loading..." : "Saving..."}
                fontSize="2em"
                viewProps={{ className: css.loadingOverlay }}
              />
            ) : null}

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
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 4,
    marginBottom: "0 !important",
    backgroundColor: Color(colors.grey["900"]).alpha(0.9).string(),
    zIndex: 10,
    transition: "all 200ms ease-in-out",
  },
  rightColumn: {
    position: "relative",
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
