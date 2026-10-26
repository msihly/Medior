import { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  Comp,
  ConfirmModal,
  JobProgress,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  Pagination,
  RegExOverlapsModal,
  SearchLoadingOverlay,
  selectAllInView,
  SelectionButtons,
  TagCard,
  TagFilterMenu,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, openSearchWindow, toast } from "medior/utils/client";
import { getHotkeyRating, matchesHotkey } from "medior/utils/common";

export const TagManager = Comp(() => {
  const stores = useStores();
  const manager = stores.tag.manager;
  const store = manager.search;

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isRegExOverlapsOpen, setIsRegExOverlapsOpen] = useState(false);

  const tagsRef = useRef<HTMLDivElement>(null);

  const hasNoSelection = store.selectedIds.length === 0;

  useEffect(() => {
    store.loadFiltered({ page: 1 });
  }, []);

  useEffect(() => {
    tagsRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [store.page, store.pageCount]);

  /** A running job keeps going in the background while the manager is hidden. */
  const handleClose = () => {
    if (manager.jobId) handleMinimize();
    else {
      manager.setIsOpen(false);
      store.reset();
    }
  };

  const handleConfirmDelete = async () => {
    const res = await manager.deleteTags([...store.selectedIds]);

    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleCreate = () => stores.tag.editor.setIsOpen(true);

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleEditRelations = () => manager.setIsMultiTagEditorOpen(true);

  const handleFindRegExOverlaps = () => setIsRegExOverlapsOpen(true);

  const handleFullPageLoad = () => store.loadFiltered({ toLastPage: true });

  const handleKeyPress = (event: KeyboardEvent) => {
    if (matchesHotkey(event, stores.home.settings.hotkeys.tagManager.selectAll)) {
      event.preventDefault();
      selectAllInView({ itemLabel: "tags", store, toast });
    } else {
      if (store.selectedIds.length !== 1) return;

      const rating = getHotkeyRating(event, stores.home.settings.hotkeys.tagManager);

      if (!rating) return;

      event.preventDefault();
      stores.tag.updateTagRating({ id: store.selectedIds[0], rating });
    }
  };

  const handleMinimize = () => manager.setIsMinimized(true);

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const handleRegenerateRegEx = async () => {
    const res = await manager.regenerateRegEx([...store.selectedIds]);

    if (!res.success) toast.error(res.error);
  };

  const handleSearchWindow = () => openSearchWindow({ tagIds: store.selectedIds });

  return (
    <Modal.Container
      visible={!manager.isMinimized}
      onClose={handleClose}
      height="100%"
      width="100%"
    >
      <LoadingOverlay
        isLoading={manager.isLoading || !!manager.jobId}
        sub={manager.job && <JobProgress job={manager.job} onMinimize={handleMinimize} />}
      />

      <Modal.Content dividers={false} padding={{ top: "1rem" }} overflow="hidden">
        <Card
          flex={1}
          padding={{ all: 0 }}
          overflow="hidden"
          header={
            <UniformList row flex={1} justify="space-between">
              <View row align="center" spacing="0.5rem">
                <TagFilterMenu store={store} />

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
                  onClick={manager.refreshSelectedTags}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="AccountTree"
                  tooltip="Regenerate RegEx"
                  onClick={handleRegenerateRegEx}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="JoinInner"
                  tooltip="Find Overlapping RegEx"
                  onClick={handleFindRegExOverlaps}
                />

                <SelectionButtons itemLabel="tags" store={store} toast={toast} />
              </View>
            </UniformList>
          }
        >
          <SearchLoadingOverlay store={store} />

          <CardGrid
            padding={{ all: "0.3rem" }}
            ref={tagsRef}
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

      {isRegExOverlapsOpen && <RegExOverlapsModal setVisible={setIsRegExOverlapsOpen} />}
    </Modal.Container>
  );
});
