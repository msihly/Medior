import { useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, tagToOption, useStores } from "store";
import { Button, ConfirmModal, Modal, TagInput, Text, View } from "components";
import { colors, makeClasses, useDeepEffect } from "utils";
import { toast } from "react-toastify";

interface TaggerProps {
  batchId?: string;
  fileIds: string[];
  setVisible: (visible: boolean) => any;
}

export const Tagger = observer(({ batchId, fileIds, setVisible }: TaggerProps) => {
  const { css } = useClasses(null);

  const { fileStore, tagStore } = useStores();

  const [addedTags, setAddedTags] = useState<TagOption[]>([]);
  const [currentTagOptions, setCurrentTagOptions] = useState<TagOption[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [removedTags, setRemovedTags] = useState<TagOption[]>([]);

  useDeepEffect(() => {
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
  }, [fileIds, tagStore.tags]);

  const handleClose = () => {
    if (hasUnsavedChanges) return setIsConfirmDiscardOpen(true);
    setVisible(false);
  };

  const handleCloseForced = () => {
    setHasUnsavedChanges(false);
    setVisible(false);
  };

  const handleTagAdded = (tags: TagOption[]) => {
    setAddedTags(tags);
    setRemovedTags((prev) => prev.filter((r) => !tags.find((t) => t.id === r.id)));
    setHasUnsavedChanges(true);
  };

  const handleTagRemoved = (tags: TagOption[]) => {
    setRemovedTags(tags);
    setAddedTags((prev) => prev.filter((a) => !tags.find((t) => t.id === a.id)));
    setHasUnsavedChanges(true);
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
    });
    if (!res?.success) return toast.error(res.error);

    handleCloseForced();
  };

  return (
    <Modal.Container onClose={handleClose} width="25rem" draggable>
      <Modal.Header>
        <Text>{"Update File Tags"}</Text>
      </Modal.Header>

      <Modal.Content>
        <View column>
          <Text className={css.sectionTitle}>{"Current Tags"}</Text>
          <TagInput
            value={currentTagOptions}
            disabled
            disableWithoutFade
            opaque
            className={css.tagInput}
          />

          <Text className={css.sectionTitle}>{"Added Tags"}</Text>
          <TagInput
            value={addedTags}
            onChange={handleTagAdded}
            autoFocus
            hasCreate
            hasDelete
            className={css.tagInput}
          />

          <Text className={css.sectionTitle}>{"Removed Tags"}</Text>
          <TagInput
            value={removedTags}
            onChange={handleTagRemoved}
            options={currentTagOptions}
            hasDelete
            className={css.tagInput}
          />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.button.grey} />

        <Button text="Submit" icon="Check" onClick={handleSubmit} />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to discard your changes?"
          confirmText="Discard"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleCloseForced}
        />
      )}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  sectionTitle: {
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    textAlign: "center",
  },
  tagInput: {
    marginBottom: "0.5rem",
  },
});
