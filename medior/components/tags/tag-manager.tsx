import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { FixedSizeGrid } from "react-window";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  Comp,
  ConfirmModal,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  Pagination,
  SearchLoadingOverlay,
  TagCard,
  TagFilterMenu,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, openSearchWindow, toast, useDeepEffect } from "medior/utils/client";
import { getHotkeyRating, matchesHotkey, tagsToRegEx } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export const TagManager = Comp(() => {
  const stores = useStores();
  const store = stores.tag.manager.search;

  const [isCancelling, setIsCancelling] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const cancelRequested = useRef(false);
  const resultsRef = useRef<FixedSizeGrid>(null);

  const hasNoSelection = store.selectedIds.length === 0;

  useDeepEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTo({ scrollTop: 0 });
  }, [store.results]);

  useEffect(() => {
    store.loadFiltered({ page: 1 });
  }, []);

  const handleClose = () => {
    if (stores.tag.manager.isLoading) handleCancelOperation();
    else {
      stores.tag.manager.setIsOpen(false);
      store.reset();
      stores.file.search.reloadIfQueued();
    }
  };

  const handleCreate = () => stores.tag.editor.setIsOpen(true);

  const handleCancelOperation = () => {
    cancelRequested.current = true;
    setIsCancelling(true);
  };

  const handleConfirmDelete = async () => {
    const tagIds = [...store.selectedIds];
    const deletedIds: string[] = [];

    cancelRequested.current = false;
    setIsCancelling(false);
    setIsConfirmDeleteOpen(false);
    stores.tag.manager.setIsLoading(true);

    try {
      for (const id of tagIds) {
        if (cancelRequested.current) break;

        const res = await stores.tag.deleteTag({ id });

        if (!res.success) throw new Error(res.error);

        deletedIds.push(id);
      }

      toast.info(
        `${deletedIds.length} tags deleted${cancelRequested.current ? " before cancellation" : ""}`,
      );

      return true;
    } catch (error) {
      toast.error(error);

      return false;
    } finally {
      store.toggleSelected(deletedIds.map((id) => ({ id, isSelected: false })));
      stores.tag.manager.setIsLoading(false);
      setIsCancelling(false);
      await store.loadFiltered();
    }
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleEditRelations = () => stores.tag.manager.setIsMultiTagEditorOpen(true);

  const handleFullPageLoad = () => store.loadFiltered({ toLastPage: true });

  const handleKeyPress = (event: KeyboardEvent) => {
    if (matchesHotkey(event, stores.home.settings.hotkeys.tagManager.selectAll)) {
      event.preventDefault();
      handleSelectAll();
    } else {
      if (store.selectedIds.length !== 1) return;

      const rating = getHotkeyRating(event, stores.home.settings.hotkeys.tagManager);

      if (!rating) return;

      event.preventDefault();
      stores.tag.updateTagRating({ id: store.selectedIds[0], rating });
    }
  };

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const handleRefreshTags = () => stores.tag.manager.refreshSelectedTags();

  const handleSearchWindow = () => openSearchWindow({ tagIds: store.selectedIds });

  const handleSelectAll = () => {
    store.toggleSelected(store.results.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${store.results.length} tags to selection`);
  };

  const handleSelectAllInQuery = async () => {
    const res = await store.selectAllInQuery();

    if (!res.success) toast.error("Failed to select all tags");
    else if (res.data !== null) toast.info(`Selected ${res.data} tags`);
  };

  const handleSelectNone = () => {
    store.toggleSelected(store.selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all tags");
  };

  const handleRegenerateRegEx = async () => {
    const updatedIds: string[] = [];

    cancelRequested.current = false;
    setIsCancelling(false);
    stores.tag.manager.setIsLoading(true);

    try {
      const result = await stores.tag.listByIds({ ids: [...store.selectedIds] });

      if (!result.success) throw new Error(result.error);

      for (const tag of result.data) {
        if (cancelRequested.current) break;

        const regEx = tagsToRegEx([{ aliases: tag.aliases, label: tag.label }]);
        const res = await stores.tag.editTag({
          id: tag.id,
          regEx,
          withRegen: false,
          withSub: false,
        });

        if (!res.success) throw new Error(res.error);

        updatedIds.push(tag.id);
      }
    } catch (error) {
      toast.error(error);
    } finally {
      try {
        if (updatedIds.length) {
          const res = await trpc.regenTags.mutate({ tagIds: updatedIds });

          if (!res.success) throw new Error(res.error);
        }
      } catch (error) {
        toast.error(error);
      } finally {
        stores.tag.manager.setIsLoading(false);
        setIsCancelling(false);
        await store.loadFiltered();
      }
    }
  };

  return (
    <Modal.Container onClose={handleClose} height="100%" width="100%">
      <LoadingOverlay
        isLoading={stores.tag.manager.isLoading}
        sub={
          <Button
            text={isCancelling ? "Stopping after current operation..." : "Cancel"}
            icon="Close"
            onClick={handleCancelOperation}
            disabled={isCancelling}
          />
        }
      />

      <Modal.Content dividers={false} padding={{ top: "1rem" }} overflow="hidden">
        <Card
          column
          flex={1}
          position="relative"
          padding={{ all: 0 }}
          overflow="hidden"
          header={
            <UniformList row flex={1} justify="space-between">
              <View row align="center" spacing="0.5rem">
                <TagFilterMenu store={store} color={colors.foreground} />

                {store.fileTags.length > 0 && (
                  <Chip label={`On files with: ${store.fileTags[0].label}`} />
                )}

                {!hasNoSelection && <Chip label={`${store.selectedIds.length} Selected`} />}
              </View>

              <View row justify="center" align="center">
                <Text preset="title">{"Tag Manager"}</Text>
              </View>

              <View row justify="flex-end" spacing="0.5rem">
                <MultiActionButton
                  name="Delete"
                  tooltip="Delete Selected Tags"
                  onClick={handleDelete}
                  disabled={hasNoSelection}
                  iconProps={{ color: hasNoSelection ? colors.custom.grey : colors.custom.red }}
                />

                <MultiActionButton
                  name="Search"
                  tooltip="Open Search Window with Selected Tags"
                  onClick={handleSearchWindow}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Label"
                  tooltip="Edit Tag Relations"
                  onClick={handleEditRelations}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Refresh"
                  tooltip="Refresh Selected Tags"
                  onClick={handleRefreshTags}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="AccountTree"
                  tooltip="Regenerate RegEx"
                  onClick={handleRegenerateRegEx}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Deselect"
                  tooltip="Deselect All Tags"
                  onClick={handleSelectNone}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="SelectAll"
                  tooltip="Select All Tags in View"
                  onClick={handleSelectAll}
                />

                <MultiActionButton
                  name="LibraryAddCheck"
                  tooltip="Select All Tags in Query"
                  onClick={handleSelectAllInQuery}
                />
              </View>
            </UniformList>
          }
        >
          <SearchLoadingOverlay store={store} />

          <CardGrid
            padding={{ all: "0.3rem" }}
            cards={store.results.map((t) => (
              <TagCard key={t.id} tag={t} />
            ))}
            cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
          />

          <Pagination
            inline
            count={store.pageCount}
            page={store.page}
            isLoading={store.isPageCountLoading && !store.isLoading}
            onChange={handlePageChange}
            onFullLoad={handleFullPageLoad}
          />
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button text="Create" icon="Add" onClick={handleCreate} colorOnHover={colors.custom.blue} />
      </Modal.Footer>

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Tags"
          subText={`Are you sure you want to delete ${store.selectedIds.length} selected tags?`}
          onConfirm={handleConfirmDelete}
          setVisible={setIsConfirmDeleteOpen}
        />
      )}
    </Modal.Container>
  );
});
