import { useState } from "react";
import { TagOption, tagToOption, observer, useStores } from "medior/store";
import { Button, ConfirmModal, Modal, TagInput, Text, View } from "medior/components";
import { colors, useDeepEffect } from "medior/utils";
import { toast } from "react-toastify";

interface FileTagEditorProps {
  batchId?: string;
  fileIds: string[];
}

export const FileTagEditor = observer(({ batchId, fileIds }: FileTagEditorProps) => {
  const stores = useStores();

  const [addedTags, setAddedTags] = useState<TagOption[]>([]);
  const [currentTagOptions, setCurrentTagOptions] = useState<TagOption[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [removedTags, setRemovedTags] = useState<TagOption[]>([]);

  useDeepEffect(() => {
    const loadCurrentTags = async () => {
      const res = await stores.file.loadFiles({ filter: { fileIds, withOverwrite: false } });
      if (!res?.success) throw new Error(res.error);

      const tagIds = [...new Set(res.data.items.flatMap((f) => f.tagIds))];
      setCurrentTagOptions(stores.tag.listByIds(tagIds).map((t) => tagToOption(t)));
    };

    loadCurrentTags();

    return () => {
      setCurrentTagOptions([]);
    };
  }, [fileIds, stores.tag.tags]);

  const handleClose = () => {
    if (hasUnsavedChanges) return setIsConfirmDiscardOpen(true);
    stores.tag.setIsFileTagEditorOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleCloseForced = () => {
    setHasUnsavedChanges(false);
    stores.tag.setIsFileTagEditorOpen(false);
    stores.file.search.reloadIfQueued();
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
    const res = await stores.file.editFileTags({
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
        <View column spacing="0.5rem">
          <TagInput
            label="Current Tags"
            value={currentTagOptions}
            detachLabel
            disabled
            disableWithoutFade
            opaque
          />

          <TagInput
            label="Added Tags"
            value={addedTags}
            onChange={handleTagAdded}
            detachLabel
            autoFocus
            hasCreate
            hasDelete
          />

          <TagInput
            label="Removed Tags"
            value={removedTags}
            onChange={handleTagRemoved}
            options={currentTagOptions}
            detachLabel
            hasDelete
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
