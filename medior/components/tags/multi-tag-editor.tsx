import { useState } from "react";
import { TagOption, observer, useStores } from "medior/store";
import {
  Button,
  ConfirmModal,
  LoadingOverlay,
  Modal,
  TagInput,
  Text,
  View,
} from "medior/components";
import { colors } from "medior/utils";
import { toast } from "react-toastify";

export const MultiTagEditor = observer(() => {
  const stores = useStores();

  const tagOpts = stores.tag.tagOptions;

  const [childTagsToAdd, setChildTagsToAdd] = useState<TagOption[]>([]);
  const [childTagsToRemove, setChildTagsToRemove] = useState<TagOption[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parentTagsToAdd, setParentTagsToAdd] = useState<TagOption[]>([]);
  const [parentTagsToRemove, setParentTagsToRemove] = useState<TagOption[]>([]);

  const handleClose = () => {
    if (hasUnsavedChanges) return setIsConfirmDiscardOpen(true);
    stores.tag.manager.setIsMultiTagEditorOpen(false);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    const res = await stores.tag.manager.editMultiTagRelations({
      childIdsToAdd: childTagsToAdd.map((t) => t.id),
      childIdsToRemove: childTagsToRemove.map((t) => t.id),
      parentIdsToAdd: parentTagsToAdd.map((t) => t.id),
      parentIdsToRemove: parentTagsToRemove.map((t) => t.id),
    });
    setIsLoading(false);

    if (!res.success) {
      toast.error("Failed to update tags");
    } else {
      toast.success("Tags updated");
      if (res.data.errors?.length)
        toast.warn("Some changes were ignored. See logs folder for details");

      setHasUnsavedChanges(false);
      stores.tag.manager.setIsMultiTagEditorOpen(false);
      stores.tag.manager.search.loadFiltered();
      stores.tag.loadTags();
    }
  };

  const handleDiscard = () => {
    setHasUnsavedChanges(false);
    setIsConfirmDiscardOpen(false);
    stores.tag.manager.setIsMultiTagEditorOpen(false);
  };

  return (
    <Modal.Container onClose={handleClose} width="25rem" draggable>
      <Modal.Header>
        <Text>{"Multi Tags Editor"}</Text>
      </Modal.Header>

      <Modal.Content>
        <LoadingOverlay {...{ isLoading }} />

        <View column spacing="0.5rem">
          <TagInput
            header="Selected Tags"
            value={stores.tag.tagOptions.filter((t) =>
              stores.tag.manager.selectedIds.includes(t.id)
            )}
            disabled
          />

          <TagInput
            header="Parent Tags to Add"
            value={parentTagsToAdd}
            onChange={setParentTagsToAdd}
            options={tagOpts}
            hasCreate
            hasDelete
          />

          <TagInput
            header="Parent Tags to Remove"
            value={parentTagsToRemove}
            onChange={setParentTagsToRemove}
            options={tagOpts}
            hasDelete
          />

          <TagInput
            header="Child Tags to Add"
            value={childTagsToAdd}
            onChange={setChildTagsToAdd}
            options={tagOpts}
            hasCreate
            hasDelete
          />

          <TagInput
            header="Child Tags to Remove"
            value={childTagsToRemove}
            onChange={setChildTagsToRemove}
            options={tagOpts}
            hasDelete
          />

          <Text fontSize="0.9em" fontStyle="italic" textAlign="center">
            {"Changes that result in a broken hierarchy will be ignored."}
          </Text>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.custom.grey} />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to discard your changes?"
          confirmText="Discard"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleDiscard}
        />
      )}
    </Modal.Container>
  );
});
