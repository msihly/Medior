import path from "path";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Divider } from "@mui/material";
import { Button, Checkbox, IconButton, Input, Modal, Text, View } from "components";
import {
  FlatFolderHierarchy,
  FolderToCollMode,
  FolderToTagsMode,
  ImportFolder,
  RootFolderButton,
  TagHierarchy,
  TagToUpsert,
} from ".";
import { PromiseQueue, colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const ImportEditor = observer(() => {
  const { css, cx } = useClasses(null);

  const { importStore, tagStore } = useStores();

  const [deleteOnImport, setDeleteOnImport] = useState(true);
  const [diffusionTags, setDiffusionTags] = useState<{
    model: boolean;
    promptRegexes: string[];
    restoredFaces: boolean;
    sampler: boolean;
  }>({
    model: true,
    promptRegexes: [],
    restoredFaces: true,
    sampler: false,
  });
  const [flatFolderHierarchy, setFlatFolderHierarchy] = useState<FlatFolderHierarchy>([]);
  const [flatTagsToUpsert, setFlatTagsToUpsert] = useState<TagToUpsert[]>([]);
  const [folderToCollectionMode, setFolderToCollectionMode] = useState<FolderToCollMode>("none");
  const [folderToTagsMode, setFolderToTagsMode] = useState<FolderToTagsMode>("hierarchical");
  const [tagHierarchy, setTagHierarchy] = useState<TagToUpsert[]>([]);
  const [withDiffusionParams, setWithDiffusionParams] = useState(false);
  const [withDiffusionTags, setWithDiffusionTags] = useState(true);

  useEffect(() => {
    const tagsToCreate: TagToUpsert[] = [];
    const tagsToEdit: TagToUpsert[] = [];

    const flatFolderHierarchy = importStore.editorImports
      .reduce((acc, cur) => {
        const folderName = path.dirname(cur.path);
        const folder = acc.find((f) => f.folderName === folderName);
        const folderNameParts = folderName.split(path.sep).slice(importStore.editorRootFolderIndex);
        const collectionTitle =
          folderToCollectionMode !== "none"
            ? (folderToCollectionMode === "withTag"
                ? folderNameParts.slice()
                : folderNameParts
              ).pop()
            : null;
        const tagLabel = folderNameParts.slice().pop()!;
        const tagParentLabel = folderNameParts.slice(0, -1).pop();

        /** Create FlatFolderHierarchy */
        if (!folder)
          acc.push({
            collectionTitle,
            folderName,
            folderNameParts,
            imports: [cur],
            tags:
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
                : [],
          });
        else folder.imports.push(cur);

        /** Create TagsToUpsert */
        if (folderToTagsMode === "cascading") {
          folderNameParts.forEach((label) => {
            const tag = tagStore.getByLabel(label);
            if (!tag && !tagsToCreate.find((t) => t.label === label)) tagsToCreate.push({ label });
          });
        } else if (folderToTagsMode === "hierarchical") {
          folderNameParts.forEach((label, idx) => {
            const tag = tagStore.getByLabel(label);
            const parentLabel = folderNameParts[idx - 1];

            if (!tag && !tagsToCreate.find((t) => t.label === label))
              tagsToCreate.push({ label, parentLabel });
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
  }, [
    folderToCollectionMode,
    folderToTagsMode,
    importStore.editorImports,
    importStore.editorRootFolderIndex,
  ]);

  useEffect(() => {
    if (withDiffusionParams) importStore.loadDiffusionParams();
    else importStore.removeDiffusionParams();
  }, [importStore.editorImports, withDiffusionParams]);

  const createTagHierarchy = (tags: TagToUpsert[], label: string): TagToUpsert[] =>
    tags
      .filter((c) => c.parentLabel === label)
      .map((c) => ({ ...c, children: createTagHierarchy(tags, c.label) }));

  const handleClose = () => importStore.setIsImportEditorOpen(false);

  const handleConfirm = async () => {
    if (folderToTagsMode !== "none") {
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

  const toggleDiffusionTagModel = (checked: boolean) =>
    setDiffusionTags((prev) => ({ ...prev, model: checked }));

  const toggleDiffusionTagRestoredFaces = (checked: boolean) =>
    setDiffusionTags((prev) => ({ ...prev, restoredFaces: checked }));

  const toggleDiffusionTagSampler = (checked: boolean) =>
    setDiffusionTags((prev) => ({ ...prev, sampler: checked }));

  const toggleFolderToCollWithTag = () =>
    setFolderToCollectionMode((prev) => (prev === "withTag" ? "withoutTag" : "withTag"));

  const toggleFoldersToTagsCascading = () => setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () => setFolderToTagsMode("hierarchical");

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
              label="Folders to Tags"
              checked={folderToTagsMode !== "none"}
              setChecked={handleFoldersToTags}
              flex="initial"
            />

            <View column margins={{ left: "1rem" }}>
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
                  checked={diffusionTags.model}
                  setChecked={toggleDiffusionTagModel}
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  flex="initial"
                />

                <Checkbox
                  label="Restored Faces"
                  checked={diffusionTags.restoredFaces}
                  setChecked={toggleDiffusionTagRestoredFaces}
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  flex="initial"
                />

                <Checkbox
                  label="Sampler"
                  checked={diffusionTags.sampler}
                  setChecked={toggleDiffusionTagSampler}
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  flex="initial"
                />

                {diffusionTags.promptRegexes.map((regex, idx) => (
                  <View key={idx} row align="center" margins={{ bottom: "0.5rem" }}>
                    <IconButton
                      name="Delete"
                      iconProps={{ color: colors.button.red }}
                      onClick={() =>
                        setDiffusionTags((prev) => ({
                          ...prev,
                          promptRegexes: prev.promptRegexes.filter((_, i) => i !== idx),
                        }))
                      }
                      disabled={!withDiffusionParams || !withDiffusionTags}
                      margins={{ left: "0.5rem", right: "0.5rem" }}
                    />

                    <Input
                      placeholder="RegExp"
                      value={regex}
                      setValue={(value) =>
                        setDiffusionTags((prev) => ({
                          ...prev,
                          promptRegexes: prev.promptRegexes.map((r, i) => (i === idx ? value : r)),
                        }))
                      }
                      disabled={!withDiffusionParams || !withDiffusionTags}
                    />
                  </View>
                ))}

                <Button
                  text="Prompt RegExp"
                  icon="Add"
                  onClick={() =>
                    setDiffusionTags((prev) => ({
                      ...prev,
                      promptRegexes: [...prev.promptRegexes, ""],
                    }))
                  }
                  disabled={!withDiffusionParams || !withDiffusionTags}
                  margins={{ left: "0.5rem" }}
                />
              </View>
            </View>
          </View>

          <View className={css.rightColumn}>
            {folderToTagsMode !== "none" && (
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
                <ImportFolder
                  key={i}
                  mode="list"
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
    overflowX: "auto",
  },
  vertScroll: {
    overflowY: "auto",
  },
});
