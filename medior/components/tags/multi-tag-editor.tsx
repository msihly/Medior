import { useEffect, useState } from "react";
import {
  Button,
  Comp,
  ConfirmModal,
  HeaderWrapper,
  ListItem,
  LoadingOverlay,
  MenuButton,
  Modal,
  TagInput,
  TagList,
  Text,
  UniformList,
  View,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import { trpc } from "medior/utils/server";

interface MultiTagEditorProps {
  initialTags?: TagOption[];
  onClose?: () => void;
}

export const MultiTagEditor = Comp(({ initialTags, onClose }: MultiTagEditorProps) => {
  const stores = useStores();
  const store = stores.tag.manager;

  const load = useCancellableLoad();

  const [childTagsToAdd, setChildTagsToAdd] = useState<TagOption[]>([]);
  const [childTagsToRemove, setChildTagsToRemove] = useState<TagOption[]>([]);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parentTagsToAdd, setParentTagsToAdd] = useState<TagOption[]>([]);
  const [parentTagsToRemove, setParentTagsToRemove] = useState<TagOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<TagOption[]>(initialTags ?? []);

  const hasUnsavedChanges =
    childTagsToAdd.length +
      childTagsToRemove.length +
      parentTagsToAdd.length +
      parentTagsToRemove.length >
    0;

  useEffect(() => {
    if (!initialTags) {
      load.run(async (signal) => {
        const res = await trpc.listTag.mutate(
          { filter: { id: store.search.selectedIds } },
          { signal },
        );

        signal.throwIfAborted();

        if (!res.success) throw new Error(res.error);

        setSelectedTags(res.data.map(tagToOption));
      });
    }
  }, []);

  const closeEditor = () => {
    if (onClose) onClose();
    else store.setIsMultiTagEditorOpen(false);
  };

  const handleClose = () => {
    if (isLoading) return;

    load.cancel();

    if (hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else closeEditor();
  };

  const handleConfirm = async () => {
    setIsLoading(true);

    const res = await store.editMultiTagRelations({
      childIdsToAdd: childTagsToAdd.map((t) => t.id),
      childIdsToRemove: childTagsToRemove.map((t) => t.id),
      parentIdsToAdd: parentTagsToAdd.map((t) => t.id),
      parentIdsToRemove: parentTagsToRemove.map((t) => t.id),
      tagIds: selectedTags.map((tag) => tag.id),
    });

    setIsLoading(false);

    if (!res.success) {
      toast.error(res.error || "Failed to update tags");
    } else {
      toast.success("Tags updated");

      closeEditor();
      store.search.loadFiltered();
    }
  };

  const handleDiscard = async () => {
    setIsConfirmDiscardOpen(false);
    closeEditor();

    return true;
  };

  const appendTag = (tags: TagOption[], tag: TagOption) =>
    tags.find((t) => t.id === tag.id) ? tags : tags.concat(tag);

  const handleAddChild = (tag: TagOption) => handleChildAdditions(appendTag(childTagsToAdd, tag));

  const handleAddParent = (tag: TagOption) =>
    handleParentAdditions(appendTag(parentTagsToAdd, tag));

  const handleRemoveChild = (tag: TagOption) =>
    handleChildRemovals(appendTag(childTagsToRemove, tag));

  const handleRemoveParent = (tag: TagOption) =>
    handleParentRemovals(appendTag(parentTagsToRemove, tag));

  const handleChildAdditions = (tags: TagOption[]) => {
    const ids = new Set(tags.map(({ id }) => id));

    setChildTagsToAdd(tags);
    setChildTagsToRemove((previous) => previous.filter(({ id }) => !ids.has(id)));
    setParentTagsToAdd((previous) => previous.filter(({ id }) => !ids.has(id)));
  };

  const handleParentAdditions = (tags: TagOption[]) => {
    const ids = new Set(tags.map(({ id }) => id));

    setParentTagsToAdd(tags);
    setParentTagsToRemove((previous) => previous.filter(({ id }) => !ids.has(id)));
    setChildTagsToAdd((previous) => previous.filter(({ id }) => !ids.has(id)));
  };

  const handleChildRemovals = (tags: TagOption[]) => {
    const ids = new Set(tags.map(({ id }) => id));

    setChildTagsToRemove(tags);
    setChildTagsToAdd((previous) => previous.filter(({ id }) => !ids.has(id)));
  };

  const handleParentRemovals = (tags: TagOption[]) => {
    const ids = new Set(tags.map(({ id }) => id));

    setParentTagsToRemove(tags);
    setParentTagsToAdd((previous) => previous.filter(({ id }) => !ids.has(id)));
  };

  return (
    <Modal.Container {...{ isLoading }} onClose={handleClose} width="50rem" draggable>
      <LoadingOverlay
        isLoading={load.isLoading}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header>
        <Text preset="title">{"Multi Tags Editor"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
        <UniformList row uniformWidth="20rem" height="30rem" spacing="0.5rem">
          <View column spacing="0.5rem">
            <TagInput
              header="Parent Tags to Add"
              value={parentTagsToAdd}
              onChange={handleParentAdditions}
              hasCreate
              hasDelete
            />

            <TagInput
              header="Child Tags to Add"
              value={childTagsToAdd}
              onChange={handleChildAdditions}
              hasCreate
              hasDelete
            />
          </View>

          <HeaderWrapper header="Selected Tags" height="100%">
            <TagList
              search={{ onChange: setSelectedTags, value: selectedTags }}
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
              onChange={handleParentRemovals}
              hasDelete
            />

            <TagInput
              header="Child Tags to Remove"
              value={childTagsToRemove}
              onChange={handleChildRemovals}
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
          {"Changes that create a hierarchy cycle cannot be saved."}
        </Text>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} />

        <Button
          text="Confirm"
          icon="Check"
          onClick={handleConfirm}
          color={colors.custom.blue}
          disabled={!hasUnsavedChanges || !selectedTags.length || isLoading || load.isLoading}
        />
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
