import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, tagToOption, useStores } from "store";
import { Button, Modal, TagInput, Text, View } from "components";
import { TagEditor } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

interface TaggerProps {
  batchId?: string;
  fileIds: string[];
  setVisible: (visible: boolean) => any;
}

export const Tagger = observer(({ batchId, fileIds, setVisible }: TaggerProps) => {
  const rootStore = useStores();
  const { fileStore, tagStore } = useStores();
  const { css } = useClasses(null);

  const [addedTags, setAddedTags] = useState<TagOption[]>([]);
  const [currentTagOptions, setCurrentTagOptions] = useState<TagOption[]>([]);
  const [removedTags, setRemovedTags] = useState<TagOption[]>([]);
  const [mode, setMode] = useState<"createTag" | "editTag" | "editFileTags">("editFileTags");

  useEffect(() => {
    const loadCurrentTags = async () => {
      const res = await fileStore.loadFiles({ fileIds, withOverwrite: false });
      if (!res?.success) throw new Error(res.error);

      const tagIds = [...new Set(res.data.flatMap((f) => f.tagIds))];
      setCurrentTagOptions(tagStore.listByIds(tagIds).map((t) => tagToOption(t)));
    };

    loadCurrentTags();

    return () => {
      setCurrentTagOptions([]);
    };
  }, [fileIds, tagStore.tags.toString()]);

  const handleClose = () => setVisible(false);

  const handleEditorBack = () => setMode("editFileTags");

  const handleTagAdded = (tags: TagOption[]) => {
    setAddedTags(tags);
    setRemovedTags((prev) => prev.filter((r) => !tags.find((t) => t.id === r.id)));
  };

  const handleTagRemoved = (tags: TagOption[]) => {
    setRemovedTags(tags);
    setAddedTags((prev) => prev.filter((a) => !tags.find((t) => t.id === a.id)));
  };

  const handleSubmit = async () => {
    if (addedTags.length === 0 && removedTags.length === 0)
      return toast.error("You must enter at least one tag");

    const addedTagIds = addedTags.map((t) => t.id);
    const removedTagIds = removedTags.map((t) => t.id);
    const res = await fileStore.editFileTags({
      addedTagIds,
      batchId,
      fileIds,
      removedTagIds,
      rootStore,
    });
    if (!res?.success) return toast.error(res.error);

    handleClose();
  };

  const handleTagClick = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    setMode("editTag");
  };

  return (
    <Modal.Container onClose={handleClose} width="25rem" draggable>
      <Modal.Header>
        <Text>
          {mode === "createTag"
            ? "Create Tag"
            : mode === "editTag"
            ? "Update Tag"
            : "Update File Tags"}
        </Text>
      </Modal.Header>

      {mode === "editFileTags" ? (
        <>
          <Modal.Content>
            <View column>
              <Text align="center" className={css.sectionTitle}>
                {"Current Tags"}
              </Text>
              <TagInput
                value={currentTagOptions}
                onTagClick={handleTagClick}
                disabled
                opaque
                className={css.tagInput}
              />

              <Text align="center" className={css.sectionTitle}>
                {"Added Tags"}
              </Text>
              <TagInput
                value={addedTags}
                onChange={handleTagAdded}
                setValue={setAddedTags}
                options={[...tagStore.tagOptions]}
                onTagClick={handleTagClick}
                autoFocus
                hasCreate
                className={css.tagInput}
              />

              <Text align="center" className={css.sectionTitle}>
                {"Removed Tags"}
              </Text>
              <TagInput
                value={removedTags}
                onChange={handleTagRemoved}
                setValue={setRemovedTags}
                options={currentTagOptions}
                onTagClick={handleTagClick}
                className={css.tagInput}
              />
            </View>
          </Modal.Content>

          <Modal.Footer>
            <Button text="Submit" icon="Check" onClick={handleSubmit} />

            <Button text="Close" icon="Close" onClick={handleClose} color={colors.grey["700"]} />
          </Modal.Footer>
        </>
      ) : (
        <TagEditor create={mode === "createTag"} goBack={handleEditorBack} />
      )}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  sectionTitle: {
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
  tagInput: {
    marginBottom: "0.5rem",
  },
});
