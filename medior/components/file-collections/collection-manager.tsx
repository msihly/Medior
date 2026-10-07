import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  Comp,
  ConditionalWrap,
  FileCard,
  FileCollectionEditor,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  Pagination,
  SearchLoadingOverlay,
  TabContainer,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast, useCancellableLoad } from "medior/utils/client";
import {
  CollectionFilterMenu,
  CollectionTriager,
  DeleteCollectionModal,
  FileCollection,
  RelatedCollectionsQueue,
} from ".";
import { useCollectionMerge } from "./hooks";

const FILE_CARD_HEIGHT = 250;

export const FileCollectionManager = Comp(() => {
  const stores = useStores();
  const store = stores.collection.manager;

  const load = useCancellableLoad();

  const { css } = useClasses(null);

  const [activeTab, setActiveTab] = useState("0");

  const collsRef = useRef<HTMLDivElement>(null);

  const hasSelectedCollectionIds = store.search.selectedIds.length > 0;
  const selectedFileIds = store.selectedFileIds;
  const hasAnyFilesSelected = selectedFileIds.length > 0;
  const hasOneFileSelected = selectedFileIds.length === 1;
  const isManagerOpen = !hasAnyFilesSelected || activeTab === "1";
  const page = store.search.page;
  const pageCount = store.search.pageCount;

  useEffect(() => {
    setActiveTab("0");
    store.setCurrentCollectionsPage(1);
    store.setSelectedFilesPage(1);
    loadSelectedFiles(true);

    return load.cancel;
  }, [hasAnyFilesSelected, selectedFileIds]);

  useEffect(() => {
    scrollToTop();
  }, [page, pageCount]);

  useEffect(() => {
    if (
      !store.search.isLoading &&
      !store.search.isPageCountLoading &&
      page > Math.max(pageCount, 1)
    )
      handlePageChange(Math.max(pageCount, 1));
  }, [store.search.isLoading, store.search.isPageCountLoading, page, pageCount]);

  const handleAddToCollection = async () => {
    const collId = store.search.selectedIds[0];
    const fileIds = new Set(selectedFileIds);
    const res = await stores.collection.editor.addFilesToCollection({
      collId,
      fileIds: [...fileIds],
    });

    if (!res.success) return toast.error(res.error);

    if (
      res.data &&
      stores.collection.editor.isOpen &&
      stores.collection.editor.collection?.id === collId
    )
      stores.collection.editor.search.setSelectedIds(
        stores.collection.editor.collection.fileIdIndexes
          .filter((f) => fileIds.has(f.fileId))
          .map((f) => f.fileId),
      );
  };

  const handleCancelLoad = () => {
    load.cancel();
    merge.cancelLoad();
    store.search.cancelLoad();
  };

  const handleClose = () => {
    if (store.isLoading || merge.isQuickMergeSaving) return;

    load.cancel();
    merge.cancelLoad();
    store.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDelete = () => {
    stores.collection.setIdsForConfirmDelete([...store.search.selectedIds]);
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleFullPageLoad = () => store.search.loadFiltered({ toLastPage: true });

  const handleRefreshMeta = () => stores.collection.regenCollMeta(store.search.selectedIds);

  const handleMerged = () => {
    store.search.setSelectedIds([]);
    store.search.loadFiltered();
    loadSelectedFiles();
  };

  const merge = useCollectionMerge({
    getSelectedIds: () => store.search.selectedIds,
    onMerged: handleMerged,
  });

  const handleRelatedQueueClose = () => {
    store.setIsRelatedQueueOpen(false);
    store.search.reloadIfQueued();
  };

  const handleNewCollection = async () => {
    store.setIsLoading(true);

    try {
      const res = await stores.collection.createCollection({
        fileIdIndexes: selectedFileIds.map((fileId, index) => ({ fileId, index })),
        title: "Untitled Collection",
      });

      if (!res.success) toast.error(res.error);
      else {
        store.setIsLoading(false);
        stores.collection.editor.setIsOpen(true);
        await stores.collection.editor.loadCollection(res.data.id);
      }
    } finally {
      store.setIsLoading(false);
    }
  };

  const loadSelectedFiles = (reloadSearch = false) =>
    load.run(async (signal) => {
      if (hasAnyFilesSelected) {
        const res = await store.loadCurrentCollections(signal);

        signal.throwIfAborted();

        if (!res.success) throw new Error(res.error);
      } else store.setCurrentCollections([]);

      const res = await store.loadFiles(signal);

      signal.throwIfAborted();

      if (!res.success) throw new Error(res.error);

      if (reloadSearch) await store.search.loadFiltered({ page: 1 });
    });

  const handlePageChange = (page: number) => store.search.loadFiltered({ page });

  const handleSelectedFilesPage = (page: number) => {
    store.setSelectedFilesPage(page);

    load.run(async (signal) => {
      const result = await store.loadFiles(signal);

      if (!result.success) throw new Error(result.error);
    });
  };

  const handleCurrentCollectionsPage = (page: number) => {
    store.setCurrentCollectionsPage(page);

    load.run(async (signal) => {
      const result = await store.loadCurrentCollections(signal);

      if (!result.success) throw new Error(result.error);
    });
  };

  const handleTabChange = (tab: string) => {
    store.search.setSelectedIds([]);
    setActiveTab(tab);
  };

  const scrollToTop = () => collsRef.current?.scrollTo({ behavior: "instant", top: 0 });

  return (
    <Modal.Container
      isLoading={store.isLoading || merge.isQuickMergeSaving}
      onClose={handleClose}
      height="100%"
      width="100%"
    >
      <LoadingOverlay
        isLoading={load.isLoading || (merge.isLoading && !merge.isMergeEditorOpen)}
        sub={<Button text="Cancel" icon="Close" onClick={handleCancelLoad} />}
      />

      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        {hasAnyFilesSelected && (
          <View column className={css.topRow}>
            <Card
              column
              flex={1}
              minHeight={0}
              header={
                <Text preset="title" padding="0.3rem 0">
                  {`Selected File${hasOneFileSelected ? "" : "s"}`}
                </Text>
              }
              headerProps={{ borderRadiuses: { top: 0 }, flex: "none" }}
              padding={{ all: 0 }}
              overflow="hidden"
            >
              <View row flex={1} overflow="auto" padding={{ all: "0.5rem" }}>
                {store.selectedFiles.map((f) => (
                  <View key={f.id} flex="none">
                    <FileCard
                      file={f}
                      height={FILE_CARD_HEIGHT}
                      width={230}
                      store={stores.file.search}
                      disabled
                    />
                  </View>
                ))}
              </View>

              <Pagination
                inline
                count={Math.ceil(selectedFileIds.length / 3)}
                page={store.selectedFilesPage}
                onChange={handleSelectedFilesPage}
              />
            </Card>
          </View>
        )}

        <ConditionalWrap
          condition={hasAnyFilesSelected}
          wrap={(manager) => (
            <TabContainer
              activeTab={activeTab}
              onTabChange={handleTabChange}
              tabHeight="2.5rem"
              viewProps={{ flex: 1, height: "auto", overflow: "hidden" }}
              tabs={[
                {
                  content: (
                    <Card column height="100%" minHeight={0} overflow="hidden" padding={{ all: 0 }}>
                      <CardGrid
                        cards={store.currentCollections.map((c) => (
                          <FileCollection key={c.id} collection={c} />
                        ))}
                        maxCards={1}
                        noResultsText="No collections found"
                        padding={{ all: "0.3rem" }}
                      />

                      <Pagination
                        inline
                        count={store.currentCollectionsPageCount}
                        page={store.currentCollectionsPage}
                        onChange={handleCurrentCollectionsPage}
                      />
                    </Card>
                  ),
                  label: "Current Collections",
                },
                { content: manager, label: "Collections Manager" },
              ]}
            />
          )}
        >
          <Card
            flex={1}
            height="100%"
            overflow="hidden"
            padding={{ all: 0 }}
            bgColor={colors.background}
            headerProps={{
              borderRadiuses: { top: hasAnyFilesSelected ? 0 : undefined },
              flex: "none",
            }}
            header={
              <UniformList row flex={1} justify="space-between" padding={{ all: "0.3rem" }}>
                <View row align="center" spacing="0.5rem">
                  <CollectionFilterMenu store={store.search} />

                  {store.search.selectedIds.length > 0 && (
                    <Chip label={`${store.search.selectedIds.length} Selected`} />
                  )}
                </View>

                <View row justify="center" align="center">
                  <Text preset="title">{"Collections Manager"}</Text>
                </View>

                <View row justify="flex-end">
                  <View row>
                    <MultiActionButton
                      name="Merge"
                      tooltip="Quick Merge Selected Collections"
                      iconProps={{ color: colors.custom.purple }}
                      onClick={merge.handleQuickMerge}
                      disabled={store.search.isLoading || store.search.selectedIds.length < 2}
                    />

                    <MultiActionButton
                      name="Merge"
                      tooltip="Merge Selected Collections"
                      iconProps={{ color: colors.custom.blue }}
                      onClick={merge.openMergeConfirmation}
                      disabled={store.search.isLoading || store.search.selectedIds.length < 2}
                    />

                    <MultiActionButton
                      name="Delete"
                      tooltip="Delete"
                      iconProps={{ color: colors.custom.red }}
                      onClick={handleDelete}
                      disabled={!hasSelectedCollectionIds}
                    />

                    <MultiActionButton
                      name="Refresh"
                      tooltip="Refresh"
                      onClick={handleRefreshMeta}
                      disabled={!hasSelectedCollectionIds}
                    />
                  </View>
                </View>
              </UniformList>
            }
          >
            <View flex={1} position="relative" overflow="hidden">
              <SearchLoadingOverlay
                store={store.search}
                isLoading={!load.isLoading && store.search.isLoading}
              />

              <View ref={collsRef} column height="100%" spacing="0.5rem" overflow="auto">
                {store.search.results.map((c) => (
                  <FileCollection key={c.id} collection={c} />
                ))}
              </View>
            </View>

            <Pagination
              inline
              count={pageCount}
              page={page}
              onChange={handlePageChange}
              isLoading={store.search.isPageCountLoading && !store.search.isLoading}
              onFullLoad={handleFullPageLoad}
            />
          </Card>
        </ConditionalWrap>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button
          text="New Collection"
          icon="Add"
          onClick={handleNewCollection}
          colorOnHover={colors.custom.blue}
        />

        {isManagerOpen && (
          <>
            <Button
              text="Triager"
              icon="AutoMode"
              onClick={() => store.setIsTriagerOpen(true)}
              disabled={store.search.isLoading || !store.search.results.length}
              colorOnHover={colors.custom.purple}
            />

            <Button
              text="Related"
              icon="Search"
              tooltip={
                hasSelectedCollectionIds
                  ? "Find Related Within Selected Collections"
                  : "Find Related Across All Collections"
              }
              onClick={() => store.setIsRelatedQueueOpen(true)}
              disabled={store.search.isLoading}
              colorOnHover={colors.custom.lightBlue}
            />
          </>
        )}

        {hasAnyFilesSelected && (
          <Button
            text="Add to Collection"
            icon="Add"
            onClick={handleAddToCollection}
            disabled={store.search.selectedIds.length !== 1}
            colorOnHover={colors.custom.purple}
          />
        )}
      </Modal.Footer>

      {store.isConfirmDeleteOpen && <DeleteCollectionModal />}

      {store.isTriagerOpen && <CollectionTriager />}

      {store.isRelatedQueueOpen && <RelatedCollectionsQueue onClose={handleRelatedQueueClose} />}

      {merge.isMergeEditorOpen && (
        <FileCollectionEditor
          mode="merge"
          isSaving={merge.isMergeSaving}
          onCancelLoad={merge.closeMergeEditor}
          onClose={merge.closeMergeEditor}
          onSave={merge.handleMerge}
        />
      )}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  topRow: {
    flexShrink: 0,
    height: FILE_CARD_HEIGHT + 100,
    maxHeight: FILE_CARD_HEIGHT + 100,
    overflow: "hidden",
  },
});
