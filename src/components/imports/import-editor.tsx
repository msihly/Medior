import path from "path";
import { useEffect, useState } from "react";
import { RegExMapType } from "database";
import { observer } from "mobx-react-lite";
import { Tag, useStores } from "store";
import { Divider } from "@mui/material";
import { Button, Checkbox, Modal, Text, View } from "components";
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
  const [tagHierarchy, setTagHierarchy] = useState<TagToUpsert[]>([]);
  const [withDiffusionModel, setWithDiffusionModel] = useState(true);
  const [withDiffusionRegExMaps, setWithDiffusionRegExMaps] = useState(true);
  const [withDiffusionParams, setWithDiffusionParams] = useState(false);
  const [withDiffusionTags, setWithDiffusionTags] = useState(true);
  const [withFileNameToTags, setWithFileNameToTags] = useState(true);
  const [withFolderNameRegEx, setWithFolderNameRegEx] = useState(true);
  const [withNewTagsToRegEx, setWithNewTagsToRegEx] = useState(true);

  useEffect(() => {
    (async () => {
      const tagsToCreate: TagToUpsert[] = [];
      const tagsToEdit: TagToUpsert[] = [];
      const [fileNameRegExMaps, folderNameRegExMaps] = ["fileName", "folderName"].map(
        (type: RegExMapType) =>
          importStore
            .listRegExMapsByType(type)
            .map((map) => ({ regEx: new RegExp(map.regEx, "im"), tagIds: map.tagIds }))
      );

      /* ---------------------------------- Files --------------------------------- */
      if (!withDiffusionParams)
        importStore.clearValues({ diffusionParams: true, tagIds: true, tagsToUpsert: true });
      else await importStore.loadDiffusionParams();

      const { diffMetaTagsToEdit, originalTag, upscaledTag } = await upsertDiffMetaTags();
      tagsToEdit.push(...diffMetaTagsToEdit);

      importStore.editorImports.forEach((imp) => {
        const fileTagIds: string[] = [];
        const fileTagsToUpsert: TagToUpsert[] = [];

        if (withFileNameToTags) fileTagIds.push(...parseFileTags(fileNameRegExMaps, imp.name));

        if (imp.diffusionParams?.length) {
          const { diffFileTagIds, diffFileTagsToUpsert } = parseDiffTags({
            diffusionParams: imp.diffusionParams,
            originalTagId: originalTag.id,
            upscaledTagId: upscaledTag.id,
          });

          fileTagIds.push(...diffFileTagIds);
          fileTagsToUpsert.push(...diffFileTagsToUpsert);
        }

        imp.update({ tagIds: [...new Set(fileTagIds)], tagsToUpsert: fileTagsToUpsert });
      });

      /* --------------------------------- Folders -------------------------------- */
      const flatFolderHierarchy = importStore.editorImports
        .reduce((acc, cur) => {
          const folderName = path.dirname(cur.path);
          const folder = acc.find((f) => f.folderName === folderName);
          const folderNameParts = folderName
            .split(path.sep)
            .slice(importStore.editorRootFolderIndex);
          const collectionTitle =
            folderToCollectionMode !== "none"
              ? (folderToCollectionMode === "withTag"
                  ? folderNameParts.slice()
                  : folderNameParts
                ).pop()
              : null;
          const tagLabel = folderNameParts.slice().pop()!;
          const tagParentLabel = folderNameParts.slice(0, -1).pop();

          /* ----------------------- Create FlatFolderHierarchy ----------------------- */
          if (folder) folder.imports.push(cur);
          else {
            const folderTags: TagToUpsert[] =
              folderToTagsMode === "cascading"
                ? folderNameParts.map((part) => ({
                    id: tagStore.getByLabel(part)?.id,
                    label: part,
                  }))
                : folderToTagsMode === "hierarchical" && tagLabel
                ? [
                    {
                      id: tagStore.getByLabel(tagLabel)?.id,
                      label: tagLabel,
                      parentLabel: tagParentLabel,
                    },
                  ]
                : [];

            const tags = [...folderTags];

            if (folderToTagsMode !== "none" && withFolderNameRegEx)
              tags.push(
                ...parseFileTags(folderNameRegExMaps, folderName).map((id) => ({
                  id,
                  label: tagStore.getById(id).label,
                }))
              );

            acc.push({
              collectionTitle,
              folderName,
              folderNameParts,
              imports: [cur],
              tags,
            });
          }

          /** Create TagsToUpsert */
          if (folderToTagsMode === "cascading") {
            folderNameParts.forEach((label) => {
              const tag = tagStore.getByLabel(label);
              if (!tag && !tagsToCreate.find((t) => t.label === label))
                tagsToCreate.push({ label, withRegEx: withNewTagsToRegEx });
            });
          } else if (folderToTagsMode === "hierarchical") {
            folderNameParts.forEach((label, idx) => {
              const tag = tagStore.getByLabel(label);
              const parentLabel = folderNameParts[idx - 1];

              if (!tag && !tagsToCreate.find((t) => t.label === label))
                tagsToCreate.push({ label, parentLabel, withRegEx: withNewTagsToRegEx });
              else if (tag && !tagsToEdit.find((t) => t.id === tag.id))
                tagsToEdit.push({ id: tag.id, label, parentLabel });
            });
          }

          return acc;
        }, [] as FlatFolderHierarchy)
        .sort((a, b) => a.folderNameParts.length - b.folderNameParts.length);

      setFlatFolderHierarchy(flatFolderHierarchy);

      const tagsToUpsert = [...tagsToCreate, ...tagsToEdit];
      setFlatTagsToUpsert(tagsToUpsert);
      setTagHierarchy(
        tagsToUpsert
          .filter((t) => !t.parentLabel)
          .map((t) => ({ ...t, children: createTagHierarchy(tagsToUpsert, t.label) }))
      );
    })();
  }, [
    folderToCollectionMode,
    folderToTagsMode,
    importStore.editorImports,
    importStore.editorRootFolderIndex,
    importStore.regExMaps,
    withDiffusionModel,
    withDiffusionParams,
    withDiffusionRegExMaps,
    withDiffusionTags,
    withFileNameToTags,
  ]);

  const createTagHierarchy = (tags: TagToUpsert[], label: string): TagToUpsert[] =>
    tags
      .filter((c) => c.parentLabel === label)
      .map((c) => ({ ...c, children: createTagHierarchy(tags, c.label) }));

  const handleClose = () => importStore.setIsImportEditorOpen(false);

  const handleConfirm = async () => {
    if (flatTagsToUpsert.length > 0) {
      const tagQueue = new PromiseQueue();
      flatTagsToUpsert.forEach((t) => {
        tagQueue.add(async () => {
          const parentTag = t.parentLabel ? tagStore.getByLabel(t.parentLabel) : null;

          if (t.id) {
            const tag = tagStore.getById(t.id);
            if (!parentTag || tag.parentIds.includes(parentTag?.id)) return;

            const res = await tagStore.editTag({
              id: t.id,
              parentIds: parentTag ? [...tag.parentIds, parentTag.id] : [],
            });
            if (!res.success) throw new Error(res.error);
          } else {
            const res = await tagStore.createTag({
              label: t.label,
              parentIds: parentTag ? [parentTag.id] : [],
              withRegEx: t.withRegEx,
            });
            if (!res.success) throw new Error(res.error);
          }
        });
      });

      await tagQueue.queue;
    }

    const importQueue = new PromiseQueue();
    flatFolderHierarchy.forEach((folder) => {
      importQueue.add(async () => {
        const tagIds = folder.tags.map((t) => tagStore.getByLabel(t.label)?.id).filter(Boolean);
        const res = await importStore.createImportBatch({
          collectionTitle: folder.collectionTitle,
          deleteOnImport,
          imports: [...folder.imports],
          tagIds,
        });
        if (!res.success) throw new Error(res.error);
      });
    });

    await importQueue.queue;

    toast.success(
      `Queued ${flatFolderHierarchy.reduce((acc, cur) => acc + cur.imports.length, 0)} imports`
    );

    handleClose();
    importStore.setIsImportManagerOpen(true);
  };

  const handleFolderToCollection = (checked: boolean) =>
    setFolderToCollectionMode(checked ? "withoutTag" : "none");

  const handleFoldersToTags = (checked: boolean) =>
    setFolderToTagsMode(checked ? "hierarchical" : "none");

  const handleRegExMapper = () => importStore.setIsImportRegExMapperOpen(true);

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
      importStore.listRegExMapsByType("diffusionParams").forEach((map) => {
        const regEx = new RegExp(map.regEx, "im");
        if (regEx.test(prompt)) diffFileTagIds.push(...map.tagIds);
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

  const parseFileTags = (regExMaps: { regEx: RegExp; tagIds: string[] }[], name: string) =>
    regExMaps.reduce((acc, cur) => {
      if (cur.regEx.test(name)) acc.push(...cur.tagIds);
      return acc;
    }, [] as string[]);

  const toggleFolderToCollWithTag = () =>
    setFolderToCollectionMode((prev) => (prev === "withTag" ? "withoutTag" : "withTag"));

  const toggleFoldersToTagsCascading = () => setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () => setFolderToTagsMode("hierarchical");

  const toggleWithFolderNameRegEx = () => setWithFolderNameRegEx((prev) => !prev);

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
            { id: modelTag.id, label: LABEL_DIFF_MODEL, parentLabel: LABEL_DIFF },
            { id: originalTag.id, label: LABEL_DIFF_ORIGINAL, parentLabel: LABEL_DIFF },
            { id: upscaledTag.id, label: LABEL_DIFF_UPSCALED, parentLabel: LABEL_DIFF },
          ]
        );
      }
    }

    return { diffMetaTagsToEdit, modelTag, originalTag, upscaledTag };
  };

  return (
    <Modal.Container width="100%" height="100%">
      <Modal.Header
        leftNode={<Button text="RegEx Mapper" icon="MultipleStop" onClick={handleRegExMapper} />}
      >
        <Text>{"Import Editor"}</Text>
      </Modal.Header>

      <Modal.Content className={css.vertScroll}>
        <View className={css.body}>
          <View className={cx(css.container, css.leftColumn)}>
            <Checkbox
              label="Delete on Import"
              checked={deleteOnImport}
              setChecked={setDeleteOnImport}
              flex="initial"
            />

            <Divider />

            <Checkbox
              label="New Tags to RegEx"
              checked={withNewTagsToRegEx}
              setChecked={setWithNewTagsToRegEx}
              flex="initial"
            />

            <Divider />

            <Checkbox
              label="File to Tags (RegEx)"
              checked={withFileNameToTags}
              setChecked={setWithFileNameToTags}
              flex="initial"
            />

            <Divider />

            <Checkbox
              label="Folder to Tags"
              checked={folderToTagsMode !== "none"}
              setChecked={handleFoldersToTags}
              flex="initial"
            />

            <View column margins={{ left: "1rem" }}>
              <Checkbox
                label="With RegEx"
                checked={withFolderNameRegEx}
                setChecked={toggleWithFolderNameRegEx}
                disabled={folderToTagsMode === "none"}
                flex="initial"
              />

              <Checkbox
                label="Hierarchical"
                checked={folderToTagsMode === "hierarchical"}
                setChecked={toggleFoldersToTagsHierarchical}
                disabled={folderToTagsMode === "none"}
                flex="initial"
              />

              <Checkbox
                label="Cascading"
                checked={folderToTagsMode === "cascading"}
                setChecked={toggleFoldersToTagsCascading}
                disabled={folderToTagsMode === "none"}
                flex="initial"
              />
            </View>

            <Divider />

            <Checkbox
              label="Folder to Collection"
              checked={folderToCollectionMode !== "none"}
              setChecked={handleFolderToCollection}
              flex="initial"
            />

            <View column margins={{ left: "1rem" }}>
              <Checkbox
                label="With Tag"
                checked={folderToCollectionMode === "withTag"}
                setChecked={toggleFolderToCollWithTag}
                disabled={folderToCollectionMode === "none"}
                flex="initial"
              />
            </View>

            <Divider />

            <Checkbox
              label="Diffusion Params"
              checked={withDiffusionParams}
              setChecked={setWithDiffusionParams}
              flex="initial"
            />

            <View column margins={{ left: "1rem" }}>
              <Checkbox
                label="With Tags"
                checked={withDiffusionTags}
                setChecked={setWithDiffusionTags}
                disabled={!withDiffusionParams}
                flex="initial"
              />

              <View column margins={{ left: "1rem" }}>
                <Checkbox
                  label="Model"
                  checked={withDiffusionModel}
                  setChecked={setWithDiffusionModel}
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  flex="initial"
                />

                <Checkbox
                  label="With RegEx"
                  checked={withDiffusionRegExMaps}
                  setChecked={setWithDiffusionRegExMaps}
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  flex="initial"
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
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.button.red} />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} color={colors.button.blue} />
      </Modal.Footer>
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
