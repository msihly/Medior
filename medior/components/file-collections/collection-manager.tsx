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
  SEARCH_HEADER_PROPS,
  SearchLoadingOverlay,
  SelectionButtons,
  TabContainer,
  Text,
  UniformList,
  View,
} from "medior/components";
import { SELECTED_FILES_PAGE_SIZE, useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import {
  CollectionFilterMenu,
  CollectionTriager,
  FileCollection,
  RelatedCollectionsQueue,
} from ".";
import { useCollectionMerge } from "./hooks";

const FILE_CARD_HEIGHT = 250;

export const FileCollectionManager = Comp(() => {
  const stores = useStores();
  const store = stores.collection.manager;

  // Each list has its own load, so paging one never cancels the other's.
  const collectionsLoad = useCancellableLoad();
  const filesLoad = useCancellableLoad();

  const [activeTab, setActiveTab] = useState("0");

  const collsRef = useRef<HTMLDivElement>(null);
  const currentCollsRef = useRef<HTMLDivElement>(null);

  const hasSelectedCollectionIds = store.search.selectedIds.length > 0;
  const selectedFileIds = store.selectedFileIds;
  const hasAnyFilesSelected = selectedFileIds.length > 0;
  const hasOneFileSelected = selectedFileIds.length === 1;
  const isManagerOpen = !hasAnyFilesSelected || activeTab === "1";
  const page = store.search.page;
  const pageCount = store.search.pageCount;
  const isListLoading = collectionsLoad.isLoading || filesLoad.isLoading;

  useEffect(() => {
    setActiveTab("0");
    store.setCurrentCollectionsPage(1);
    store.setSelectedFilesPage(1);
    loadSelectedFiles(true);

    return () => {
      collectionsLoad.cancel();
      filesLoad.cancel();
    };
  }, [hasAnyFilesSelected, selectedFileIds]);

  useEffect(() => {
    scrollToTop();
  }, [page, pageCount]);

  useEffect(() => {
    currentCollsRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [store.currentCollectionsPage]);

  useEffect(() => {
    if (
      !store.search.isLoading &&
      !store.search.isPageCountLoading &&
      page > Math.max(pageCount, 1)
    )
      handlePageChange(Math.max(pageCount, 1));
  }, [store.search.isLoading, store.search.isPageCountLoading, page, pageCount]);

  /** Copying ends picking seasons, returning to the program editor they were picked for. */
  const handleCopySeasons = async () => {
    if (stores.mediaProgram.editor.program?.id !== store.seasonsProgramId) {
      toast.error("The program these seasons were for is no longer open");
      return store.setSeasonsProgramId(null);
    }

    const res = await stores.mediaProgram.editor.copyCollections([...store.search.selectedIds]);
    if (!res.success) toast.error(res.error);
    else {
      store.setSeasonsProgramId(null);
      stores.home.openView("mediaPrograms");
    }
  };

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
    collectionsLoad.cancel();
    filesLoad.cancel();
    merge.cancelLoad();
    store.search.cancelLoad();
  };

  const handleDelete = () => {
    stores.collection.setIdsForConfirmDelete([...store.search.selectedIds]);
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleFullPageLoad = async () => {
    const res = await store.search.loadFiltered({ toLastPage: true });
    if (!res.success) toast.error(res.error);
  };

  const handleRefreshMeta = async () => {
    const res = await stores.collection.regenCollMeta(store.search.selectedIds);
    if (!res.success) toast.error(res.error);
  };

  // Merged collections leave the results and the kept one updates in place through sockets.
  const handleMerged = () => {
    store.search.setSelectedIds([]);
    loadSelectedFiles();
  };

  const merge = useCollectionMerge({
    getSelectedIds: () => store.search.selectedIds,
    onMerged: handleMerged,
  });

  const handleRelatedQueueClose = () => store.setIsRelatedQueueOpen(false);

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

  const loadCurrentCollections = () =>
    collectionsLoad.run(async (signal) => {
      const res = await store.loadCurrentCollections(signal);
      signal.throwIfAborted();
      if (!res.success) throw new Error(res.error);
    });

  // The selected files and the collection list don't depend on each other, so they load together.
  const loadFiles = (reloadSearch = false) =>
    filesLoad.run(async (signal) => {
      const [files, search] = await Promise.all([
        store.loadFiles(signal),
        reloadSearch ? store.search.loadFiltered({ page: 1 }) : null,
      ]);

      signal.throwIfAborted();

      if (!files.success) throw new Error(files.error);
      if (search && !search.success) throw new Error(search.error);
    });

  const loadSelectedFiles = (reloadSearch = false) => {
    if (hasAnyFilesSelected) loadCurrentCollections();
    else {
      collectionsLoad.cancel();
      store.setCurrentCollections([]);
    }

    loadFiles(reloadSearch);
  };

  const handlePageChange = async (page: number) => {
    const res = await store.search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
  };

  const handleSelectedFilesPage = (page: number) => {
    store.setSelectedFilesPage(page);
    loadFiles();
  };

  const handleCurrentCollectionsPage = (page: number) => {
    store.setCurrentCollectionsPage(page);
    loadCurrentCollections();
  };

  const handleTabChange = (tab: string) => {
    store.search.setSelectedIds([]);
    setActiveTab(tab);
  };

  const scrollToTop = () => collsRef.current?.scrollTo({ behavior: "instant", top: 0 });

  return (
    <>
      <LoadingOverlay isLoading={store.isLoading || merge.isQuickMergeSaving} />

      <LoadingOverlay
        isLoading={isListLoading || (merge.isLoading && !merge.isMergeEditorOpen)}
        sub={<Button text="Cancel" icon="Close" onClick={handleCancelLoad} />}
      />

      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        {hasAnyFilesSelected && (
          <Card
            flex="none"
            header={
              <Text preset="title" padding={{ all: "0.3rem 0" }}>
                {`Selected File${hasOneFileSelected ? "" : "s"}`}
              </Text>
            }
            headerProps={{ borderRadiuses: { top: 0 }, flex: "none" }}
            padding={{ all: 0 }}
            overflow="hidden"
          >
            <CardGrid
              cards={store.selectedFiles.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  height={FILE_CARD_HEIGHT}
                  store={stores.file.search}
                  disabled
                />
              ))}
              padding={{ all: "0.3rem" }}
            />

            <Pagination
              inline
              count={Math.ceil(selectedFileIds.length / SELECTED_FILES_PAGE_SIZE)}
              page={store.selectedFilesPage}
              onChange={handleSelectedFilesPage}
            />
          </Card>
        )}

        <ConditionalWrap
          condition={hasAnyFilesSelected}
          wrap={(manager) => (
            <TabContainer
              activeTab={activeTab}
              color={colors.background}
              onTabChange={handleTabChange}
              viewProps={{ flex: 1, height: "auto", overflow: "hidden" }}
              tabs={[
                {
                  content: (
                    <Card height="100%" minHeight={0} overflow="hidden" padding={{ all: 0 }}>
                      <CardGrid
                        cards={store.currentCollections.map((c) => (
                          <FileCollection key={c.id} collection={c} />
                        ))}
                        maxCards={1}
                        noResultsText="No collections found"
                        padding={{ all: "0.3rem" }}
                        ref={currentCollsRef}
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
              ...SEARCH_HEADER_PROPS,
              borderRadiuses: { top: hasAnyFilesSelected ? 0 : undefined },
            }}
            header={
              <UniformList row flex={1} justify="space-between">
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

                  <SelectionButtons itemLabel="collections" store={store.search} toast={toast} />
                </View>
              </UniformList>
            }
          >
            <View flex={1} position="relative" overflow="hidden">
              <SearchLoadingOverlay
                store={store.search}
                isLoading={!isListLoading && (store.search.isLoading || store.search.isSelecting)}
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

        {store.seasonsProgramId && (
          <Button
            text="Copy as Seasons"
            icon="LiveTv"
            onClick={handleCopySeasons}
            disabled={!hasSelectedCollectionIds}
            tooltip="Copies each collection's files into a new season; the collections are kept"
            color={colors.custom.blue}
          />
        )}
      </Modal.Footer>

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
    </>
  );
});
