import { useState } from "react";
import { TagOption, tagToOption, observer, useStores } from "medior/store";
import {
  Button,
  ConfirmModal,
  HeaderWrapper,
  Modal,
  TagInput,
  TagList,
  Text,
  UniformList,
} from "medior/components";
import { colors, trpc, useDeepEffect } from "medior/utils";
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
      const res = await trpc.listFiles.mutate({ args: { filter: { id: fileIds } } });
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

  const handleConfirm = async () => {
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

  return (
    <Modal.Container onClose={handleClose} maxWidth="50rem" width="100%" draggable>
      <Modal.Header>
        <Text preset="title">{"Update File Tags"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false}>
        <UniformList row uniformWidth="20rem" height="15rem" spacing="0.5rem">
          <TagInput
            header="Tags to Add"
            value={addedTags}
            onChange={handleTagAdded}
            hasCreate
            hasDelete
            hasEditor
            autoFocus
          />

          <HeaderWrapper header="Current Tags">
            <TagList tags={currentTagOptions} search={null} hasEditor />
          </HeaderWrapper>

          <TagInput
            header="Tags to Remove"
            value={removedTags}
            onChange={handleTagRemoved}
            options={currentTagOptions}
            hasDelete
            hasEditor
          />
        </UniformList>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} color={colors.custom.blue} />
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
