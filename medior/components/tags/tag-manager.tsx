import { useEffect, useRef } from "react";
import { observer, useStores } from "medior/store";
import { FixedSizeGrid } from "react-window";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  Pagination,
  TagCard,
  TagFilterMenu,
  Text,
  UniformList,
  View,
} from "medior/components";
import { colors, openSearchWindow, useDeepEffect } from "medior/utils";
import { toast } from "react-toastify";

export const TagManager = observer(() => {
  const stores = useStores();

  const hasNoSelection = stores.tag.manager.selectedIds.length === 0;

  const resultsRef = useRef<FixedSizeGrid>(null);
  useDeepEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTo({ scrollTop: 0 });
  }, [stores.tag.manager.search.results]);

  useEffect(() => {
    stores.tag.manager.search.reset();
    stores.tag.manager.search.loadFiltered({ page: 1 });
  }, []);

  const handleClose = () => {
    stores.tag.manager.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleCreate = () => {
    stores.tag.setActiveTagId(null);
    stores.tag.setIsTagEditorOpen(true);
  };

  const handleEditRelations = () => stores.tag.manager.setIsMultiTagEditorOpen(true);

  const handlePageChange = (page: number) => stores.tag.manager.search.loadFiltered({ page });

  const handleRefreshTags = () => stores.tag.manager.refreshSelectedTags();

  const handleSearchWindow = () => openSearchWindow({ tagIds: stores.tag.manager.selectedIds });

  const handleSelectAll = () => {
    stores.tag.manager.toggleTagsSelected(
      stores.tag.manager.search.results.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added ${stores.tag.manager.search.results.length} tags to selection`);
  };

  const handleSelectNone = () => {
    stores.tag.manager.toggleTagsSelected(
      stores.tag.manager.selectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all tags");
  };

  return (
    <Modal.Container onClose={handleClose} height="100%" width="100%" >
      <Modal.Content dividers={false} padding={{ top: "1rem" }}>
        <Card
          column
          flex={1}
          overflow="auto"
          padding={{ all: 0 }}
          header={
            <UniformList row flex={1} justify="space-between">
              <View row align="center" spacing="0.5rem">
                <TagFilterMenu store={stores.tag.manager.search} color={colors.foreground} />

                {!hasNoSelection && (
                  <Chip label={`${stores.tag.manager.selectedIds.length} Selected`} />
                )}
              </View>

              <View row justify="center" align="center">
                <Text preset="title">{"Tag Manager"}</Text>
              </View>

              <View row justify="flex-end" spacing="0.5rem">
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
              </View>
            </UniformList>
          }
        >
          <LoadingOverlay isLoading={stores.tag.manager.isLoading} />

          <CardGrid
            cards={stores.tag.manager.search.results.map((t) => (
              <TagCard key={t.id} tag={t} />
            ))}
          >
            <Pagination
              count={stores.tag.manager.search.pageCount}
              page={stores.tag.manager.search.page}
              onChange={handlePageChange}
            />
          </CardGrid>
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button text="Create" icon="Add" onClick={handleCreate} colorOnHover={colors.custom.blue} />
      </Modal.Footer>
    </Modal.Container>
  );
});
