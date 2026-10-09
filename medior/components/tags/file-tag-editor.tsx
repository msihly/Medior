import { MouseEvent, useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Comp,
  ConfirmModal,
  HeaderWrapper,
  LoadingOverlay,
  Modal,
  MultiTagEditor,
  sortTags,
  TagInput,
  TagList,
  Text,
  UniformList,
  View,
} from "medior/components";
import { TagOption, useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import { trpc } from "medior/utils/server";

interface FileTagEditorProps {
  batchId?: string;
  fileIds: string[];
}

export const FileTagEditor = Comp(({ batchId, fileIds }: FileTagEditorProps) => {
  const stores = useStores();
  const store = stores.file;

  const load = useCancellableLoad();

  const [addedTags, setAddedTags] = useState<TagOption[]>([]);
  const [currentTags, setCurrentTags] = useState<TagOption[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMultiTagEditorOpen, setIsMultiTagEditorOpen] = useState(false);
  const [removedTags, setRemovedTags] = useState<TagOption[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const lastSelectedTagId = useRef<string>(null);

  const selectedTagIdSet = new Set(selectedTagIds);
  const selectedTags = currentTags.filter((tag) => selectedTagIdSet.has(tag.id));

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
    if (isLoading) return;

    load.cancel();

    if (hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else {
      store.tagsEditor.setIsOpen(false);
      store.search.reloadIfQueued();
    }
  };

  const handleCloseForced = async () => {
    setHasUnsavedChanges(false);
    store.tagsEditor.setIsOpen(false);
    store.search.reloadIfQueued();

    return true;
  };

  const handleConfirm = async () => {
    try {
      setIsLoading(true);

      if (addedTags.length === 0 && removedTags.length === 0)
        throw new Error("You must enter at least one tag");

      const addedTagIds = addedTags.map((t) => t.id);
      const removedTagIds = removedTags.map((t) => t.id);
      const res = await store.editFileTags({
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

  const handleMultiTagEditorClose = () => {
    setIsMultiTagEditorOpen(false);
    loadTags();
  };

  const handleSelectAllTags = (selected: boolean) => {
    setSelectedTagIds(selected ? currentTags.map((tag) => tag.id) : []);
  };

  /** Shift-click applies the clicked state to every tag between the last clicked tag and this one. */
  const handleSelectTag = (
    tag: TagOption,
    selected: boolean,
    event?: MouseEvent<HTMLButtonElement>,
  ) => {
    const tags = sortTags(currentTags, stores.tag.getCategory);
    const index = tags.findIndex((t) => t.id === tag.id);
    const anchorIndex = tags.findIndex((t) => t.id === lastSelectedTagId.current);
    const rangeIds = new Set(
      event?.shiftKey && anchorIndex > -1
        ? tags
            .slice(Math.min(index, anchorIndex), Math.max(index, anchorIndex) + 1)
            .map((t) => t.id)
        : [tag.id],
    );

    setSelectedTagIds((previous) =>
      selected
        ? [...new Set([...previous, ...rangeIds])]
        : previous.filter((id) => !rangeIds.has(id)),
    );
    lastSelectedTagId.current = tag.id;
  };

  const handleTagAdded = (tags: TagOption[]) => {
    const addedIds = new Set(tags.map((tag) => tag.id));

    setAddedTags(tags);
    setRemovedTags((prev) => prev.filter((r) => !addedIds.has(r.id)));
    setHasUnsavedChanges(true);
  };

  const handleTagRemoved = (tags: TagOption[]) => {
    const removedIds = new Set(tags.map((tag) => tag.id));

    setRemovedTags(tags);
    setAddedTags((prev) => prev.filter((a) => !removedIds.has(a.id)));
    setHasUnsavedChanges(true);
  };

  const loadTags = () =>
    load.run(async (signal) => {
      const batchSize = CONSTANTS.FILE.TAG_QUERY_BATCH_SIZE;
      const currentTagIds = new Set<string>();

      for (let offset = 0; offset < fileIds.length; offset += batchSize) {
        signal.throwIfAborted();

        const res = await trpc.listFileTagIds.mutate(
          { fileIds: fileIds.slice(offset, offset + batchSize) },
          { signal },
        );

        signal.throwIfAborted();

        if (!res.success) throw new Error(res.error);

        for (const tagId of res.data) currentTagIds.add(tagId);
      }

      const tagIds = [...currentTagIds];
      const tags: TagOption[] = [];

      for (let offset = 0; offset < tagIds.length; offset += batchSize) {
        signal.throwIfAborted();

        const res = await trpc.listTag.mutate(
          { filter: { id: tagIds.slice(offset, offset + batchSize) } },
          { signal },
        );

        signal.throwIfAborted();

        if (!res.success) throw new Error(res.error);

        tags.push(...res.data);
      }

      setCurrentTags(tags);
    });

  return (
    <Modal.Container
      onClose={handleClose}
      isLoading={isLoading}
      maxWidth="50rem"
      width="100%"
      draggable
    >
      <LoadingOverlay
        isLoading={load.isLoading}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header>
        <Text preset="title">{"Update File Tags"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false}>
        <UniformList row uniformWidth="20rem" height="30rem" spacing="0.5rem">
          <TagInput
            header="Tags to Add"
            value={addedTags}
            onChange={handleTagAdded}
            hasCreate
            hasDelete
            hasEditor
            autoFocus
          />

          <HeaderWrapper
            header={
              <Checkbox
                checked={currentTags.length > 0 && selectedTags.length === currentTags.length}
                disabled={!currentTags.length}
                indeterminate={selectedTags.length > 0 && selectedTags.length < currentTags.length}
                label={`Current Tags (${selectedTags.length} selected)`}
                setChecked={handleSelectAllTags}
              />
            }
            height="100%"
          >
            <TagList
              search={{ onChange: setCurrentTags, value: currentTags }}
              hasDelete={false}
              hasEditor
              hasInput
              rightNode={(tag) => (
                <View row>
                  <Checkbox
                    checked={selectedTagIdSet.has(tag.id)}
                    setChecked={(selected, _, event) => handleSelectTag(tag, selected, event)}
                    width="auto"
                  />

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

        <Button
          text="Edit Selected Tags"
          icon="Edit"
          onClick={() => setIsMultiTagEditorOpen(true)}
          disabled={!selectedTags.length || load.isLoading || isLoading}
          colorOnHover={colors.custom.purple}
        />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} color={colors.custom.blue} />
      </Modal.Footer>

      {isMultiTagEditorOpen && (
        <MultiTagEditor initialTags={selectedTags} onClose={handleMultiTagEditorClose} />
      )}

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
