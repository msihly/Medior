import { useEffect, useState } from "react";
import {
  Button,
  Comp,
  ConfirmModal,
  HeaderWrapper,
  Modal,
  TagInput,
  TagList,
  Text,
  UniformList,
  View,
} from "medior/components";
import { TagOption, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

interface FileTagEditorProps {
  batchId?: string;
  fileIds: string[];
}

export const FileTagEditor = Comp(({ batchId, fileIds }: FileTagEditorProps) => {
  const stores = useStores();

  const [addedTags, setAddedTags] = useState<TagOption[]>([]);
  const [currentTags, setCurrentTags] = useState<TagOption[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [removedTags, setRemovedTags] = useState<TagOption[]>([]);

  useEffect(() => {
    loadTags();
  }, []);

  const handleAdd = (tag: TagOption) => {
    setAddedTags((prev) => (prev.find((t) => t.id === tag.id) ? prev : prev.concat(tag)));
    setRemovedTags((prev) =>
      prev.find((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : prev,
    );
    setHasUnsavedChanges(true);
  };

  const handleRemove = (tag: TagOption) => {
    setAddedTags((prev) =>
      prev.find((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : prev,
    );
    setRemovedTags((prev) => (prev.find((t) => t.id === tag.id) ? prev : prev.concat(tag)));
    setHasUnsavedChanges(true);
  };

  const handleClose = () => {
    if (hasUnsavedChanges) return setIsConfirmDiscardOpen(true);
    stores.file.tagsEditor.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleCloseForced = async () => {
    setHasUnsavedChanges(false);
    stores.file.tagsEditor.setIsOpen(false);
    stores.file.search.reloadIfQueued();
    return true;
  };

  const handleConfirm = async () => {
    try {
      setIsLoading(true);
      if (addedTags.length === 0 && removedTags.length === 0)
        throw new Error("You must enter at least one tag");

      const addedTagIds = addedTags.map((t) => t.id);
      const removedTagIds = removedTags.map((t) => t.id);
      const res = await stores.file.editFileTags({
        addedTagIds,
        batchId,
        fileIds,
        removedTagIds,
      });
      if (!res?.success) throw new Error(res.error);

      handleCloseForced();
    } catch (error) {
      console.error(error);
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
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

  const loadTags = async () => {
    try {
      setIsLoading(true);

      const fileRes = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } });
      if (!fileRes?.success) throw new Error(fileRes.error);
      const tagIds = [...new Set(fileRes.data.items.flatMap((f) => f.tagIds))];

      const tagRes = await trpc.listTag.mutate({ args: { filter: { id: tagIds } } });
      if (!tagRes?.success) throw new Error(tagRes.error);
      setCurrentTags(tagRes.data.items);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load tags");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal.Container
      onClose={handleClose}
      isLoading={isLoading}
      maxWidth="50rem"
      width="100%"
      draggable
    >
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

          <HeaderWrapper header="Current Tags" height="100%">
            <TagList
              search={{ onChange: null, value: currentTags }}
              hasDelete={false}
              hasEditor
              hasInput
              rightNode={(tag) => (
                <View row>
                  <Button
                    onClick={() => handleAdd(tag)}
                    icon="Add"
                    color="transparent"
                    colorOnHover={colors.custom.blue}
                    padding={{ all: "0.3em" }}
                    boxShadow="none"
                  />

                  <Button
                    onClick={() => handleRemove(tag)}
                    icon="Close"
                    color="transparent"
                    colorOnHover={colors.custom.red}
                    padding={{ all: "0.3em" }}
                    boxShadow="none"
                  />
                </View>
              )}
            />
          </HeaderWrapper>

          <TagInput
            header="Tags to Remove"
            value={removedTags}
            onChange={handleTagRemoved}
            includedIds={currentTags.map((t) => t.id)}
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
