import { useEffect, useState } from "react";
import {
  Button,
  Comp,
  ConfirmModal,
  HeaderWrapper,
  ListItem,
  MenuButton,
  Modal,
  TagInput,
  TagList,
  Text,
  UniformList,
  View,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export const MultiTagEditor = Comp(() => {
  const stores = useStores();
  const store = stores.tag.manager;

  const [childTagsToAdd, setChildTagsToAdd] = useState<TagOption[]>([]);
  const [childTagsToRemove, setChildTagsToRemove] = useState<TagOption[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parentTagsToAdd, setParentTagsToAdd] = useState<TagOption[]>([]);
  const [parentTagsToRemove, setParentTagsToRemove] = useState<TagOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<TagOption[]>([]);

  useEffect(() => {
    (async () => {
      const res = await trpc.listTag.mutate({ filter: { id: store.search.selectedIds } });
      setSelectedTags(res.data.map(tagToOption));
    })();
  }, []);

  const handleClose = () => {
    if (hasUnsavedChanges) return setIsConfirmDiscardOpen(true);
    store.setIsMultiTagEditorOpen(false);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    const res = await store.editMultiTagRelations({
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
      store.setIsMultiTagEditorOpen(false);
      store.search.loadFiltered();
    }
  };

  const handleDiscard = async () => {
    setHasUnsavedChanges(false);
    setIsConfirmDiscardOpen(false);
    store.setIsMultiTagEditorOpen(false);
    return true;
  };

  const appendTag = (tags: TagOption[], tag: TagOption) =>
    tags.find((t) => t.id === tag.id) ? tags : tags.concat(tag);

  const removeTag = (tags: TagOption[], tag: TagOption) =>
    tags.find((t) => t.id === tag.id) ? tags.filter((t) => t.id !== tag.id) : tags;

  const handleAddChild = (tag: TagOption) => {
    setChildTagsToAdd((prev) => appendTag(prev, tag));
    setChildTagsToRemove((prev) => removeTag(prev, tag));
    setParentTagsToAdd((prev) => removeTag(prev, tag));
    setHasUnsavedChanges(true);
  };

  const handleAddParent = (tag: TagOption) => {
    setParentTagsToAdd((prev) => appendTag(prev, tag));
    setParentTagsToRemove((prev) => removeTag(prev, tag));
    setChildTagsToAdd((prev) => removeTag(prev, tag));
    setHasUnsavedChanges(true);
  };

  const handleRemoveChild = (tag: TagOption) => {
    setChildTagsToRemove((prev) => appendTag(prev, tag));
    setChildTagsToAdd((prev) => removeTag(prev, tag));
    setParentTagsToAdd((prev) => removeTag(prev, tag));
    setHasUnsavedChanges(true);
  };

  const handleRemoveParent = (tag: TagOption) => {
    setParentTagsToRemove((prev) => appendTag(prev, tag));
    setParentTagsToAdd((prev) => removeTag(prev, tag));
    setChildTagsToAdd((prev) => removeTag(prev, tag));
    setHasUnsavedChanges(true);
  };

  return (
    <Modal.Container {...{ isLoading }} onClose={handleClose} width="50rem" draggable>
      <Modal.Header>
        <Text preset="title">{"Multi Tags Editor"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
        <UniformList row uniformWidth="20rem" height="30rem" spacing="0.5rem">
          <View column spacing="0.5rem">
            <TagInput
              header="Parent Tags to Add"
              value={parentTagsToAdd}
              onChange={setParentTagsToAdd}
              hasCreate
              hasDelete
            />

            <TagInput
              header="Child Tags to Add"
              value={childTagsToAdd}
              onChange={setChildTagsToAdd}
              hasCreate
              hasDelete
            />
          </View>

          <HeaderWrapper header="Selected Tags" height="100%">
            <TagList
              search={{ onChange: null, value: selectedTags }}
              hasDelete={false}
              hasEditor
              hasInput
              rightNode={(tag) => (
                <MenuButton size="small">
                  <ListItem
                    text="Add Parent"
                    icon="Add"
                    color={colors.custom.blue}
                    iconProps={{ color: colors.custom.blue }}
                    onClick={() => handleAddParent(tag)}
                  />

                  <ListItem
                    text="Add Child"
                    icon="Add"
                    color={colors.custom.blue}
                    iconProps={{ color: colors.custom.blue }}
                    onClick={() => handleAddChild(tag)}
                  />

                  <ListItem
                    text="Remove Parent"
                    icon="Remove"
                    color={colors.custom.red}
                    iconProps={{ color: colors.custom.red }}
                    onClick={() => handleRemoveParent(tag)}
                  />

                  <ListItem
                    text="Remove Child"
                    icon="Remove"
                    color={colors.custom.red}
                    iconProps={{ color: colors.custom.red }}
                    onClick={() => handleRemoveChild(tag)}
                  />
                </MenuButton>
              )}
            />
          </HeaderWrapper>

          <View column spacing="0.5rem">
            <TagInput
              header="Parent Tags to Remove"
              value={parentTagsToRemove}
              onChange={setParentTagsToRemove}
              hasDelete
            />

            <TagInput
              header="Child Tags to Remove"
              value={childTagsToRemove}
              onChange={setChildTagsToRemove}
              hasDelete
            />
          </View>
        </UniformList>

        <Text
          fontSize="0.9em"
          fontStyle="italic"
          textAlign="center"
          color={colors.custom.lightGrey}
        >
          {"Changes that result in a broken hierarchy will be ignored."}
        </Text>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} color={colors.custom.blue} />
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
