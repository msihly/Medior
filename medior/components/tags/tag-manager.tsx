import { useEffect, useRef, useState } from "react";
import { FixedSizeGrid } from "react-window";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  Comp,
  ConfirmModal,
  Modal,
  MultiActionButton,
  Pagination,
  TagCard,
  TagFilterMenu,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeQueue, openSearchWindow, toast, useDeepEffect } from "medior/utils/client";
import { PromiseQueue, tagsToRegEx } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export const TagManager = Comp(() => {
  const stores = useStores();
  const store = stores.tag.manager.search;
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const hasNoSelection = store.selectedIds.length === 0;

  const resultsRef = useRef<FixedSizeGrid>(null);
  useDeepEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTo({ scrollTop: 0 });
  }, [store.results]);

  useEffect(() => {
    store.reset();
    store.loadFiltered({ page: 1 });
  }, []);

  const handleClose = () => {
    stores.tag.manager.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleCreate = () => stores.tag.editor.setIsOpen(true);

  const handleConfirmDelete = async () => {
    try {
      stores.tag.manager.setIsLoading(true);
      const tagIds = [...store.selectedIds];

      await makeQueue({
        action: async (id) => {
          const res = await stores.tag.deleteTag({ id });
          if (!res.success) throw new Error(res.error);
        },
        items: tagIds,
        logPrefix: "Deleted",
        logSuffix: "tags",
        queue: new PromiseQueue({ concurrency: 10 }),
      });

      store.toggleSelected(tagIds.map((id) => ({ id, isSelected: false })));
      toast.success(`${tagIds.length} tags deleted`);
      await store.loadFiltered();
      return true;
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete tags");
      return false;
    } finally {
      stores.tag.manager.setIsLoading(false);
    }
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleEditRelations = () => stores.tag.manager.setIsMultiTagEditorOpen(true);

  const handleFullPageLoad = () => store.loadFiltered({ withFullCount: true });

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const handleRefreshTags = () => stores.tag.manager.refreshSelectedTags();

  const handleSearchWindow = () => openSearchWindow({ tagIds: store.selectedIds });

  const handleSelectAll = () => {
    store.toggleSelected(store.results.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${store.results.length} tags to selection`);
  };

  const handleSelectNone = () => {
    store.toggleSelected(store.selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all tags");
  };

  const handleRegenerateRegEx = async () => {
    try {
      store.setIsLoading(true);

      const tagIds = [...store.selectedIds];
      const tags = (await stores.tag.listByIds({ ids: tagIds })).data;

      await makeQueue({
        action: async (tag) => {
          const regEx = tagsToRegEx([{ aliases: tag.aliases, label: tag.label }]);
          await stores.tag.editTag({ id: tag.id, regEx, withRegen: false, withSub: false });
        },
        items: tags,
        logPrefix: "Regenerated",
        logSuffix: "RegEx",
        queue: new PromiseQueue({ concurrency: 10 }),
      });

      trpc.regenTags.mutate({ tagIds });

      store.setIsLoading(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to regen tags");
      store.setIsLoading(false);
    }
  };

  return (
    <Modal.Container
      isLoading={stores.tag.manager.isLoading}
      onClose={handleClose}
      height="100%"
      width="100%"
    >
      <Modal.Content dividers={false} padding={{ top: "1rem" }} overflow="hidden">
        <Card
          column
          flex={1}
          padding={{ all: 0 }}
          overflow="hidden"
          header={
            <UniformList row flex={1} justify="space-between">
              <View row align="center" spacing="0.5rem">
                <TagFilterMenu store={store} color={colors.foreground} />

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
              </View>
            </UniformList>
          }
        >
          <CardGrid
            cards={store.results.map((t) => (
              <TagCard key={t.id} tag={t} />
            ))}
          >
            <Pagination
              count={store.pageCount}
              page={store.page}
              isLoading={store.isPageCountLoading}
              onChange={handlePageChange}
              onFullLoad={handleFullPageLoad}
            />
          </CardGrid>
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
