import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CenteredText,
  Chip,
  Comp,
  ConfirmModal,
  DeselectAllButton,
  IconButton,
  ImportEditor,
  ImportsFilterMenu,
  Modal,
  MultiActionButton,
  Pagination,
  ProgressBar,
  SavedImportConfigsModal,
  SEARCH_HEADER_PROPS,
  SearchLoadingOverlay,
  SelectAllInQueryButton,
  Text,
  UniformList,
  View,
} from "medior/components";
import { handleSavedConfigsIngest, useStores } from "medior/store";
import { getImportConfigRootPaths } from "medior/store/saved-import-config";
import { colors, toast } from "medior/utils/client";
import { Fmt, round } from "medior/utils/common";

export const ImportManager = Comp(() => {
  const stores = useStores();
  const store = stores.import.manager;

  const [isConfigsModalOpen, setIsConfigsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReprocessConfirmOpen, setIsReprocessConfirmOpen] = useState(false);

  const batchesRef = useRef<HTMLDivElement>(null);

  const hasNoSelection = store.search.selectedIds.length === 0;
  const statusColor = store.isPaused
    ? colors.custom.orange
    : store.isImporting
      ? colors.custom.blue
      : colors.custom.lightGrey;

  const handleClose = () => store.setIsOpen(false);

  const handleConfirmDelete = async () => {
    const res = await store.deleteBatches([...store.search.selectedIds]);
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleConfirmReprocess = async () => {
    const res = await store.reprocessStoredImports([...store.search.selectedIds]);

    if (!res.success) toast.error(res.error);
    else
      toast.success(
        `Requeued ${Fmt.commas(res.data.requeuedCount)} stored files and deleted ${Fmt.commas(res.data.deletedCount)} records. Resume importing to process them.`,
      );

    return res.success;
  };

  const handleDelete = () => setIsDeleteConfirmOpen(true);

  const handleFullPageLoad = () => store.search.loadFiltered({ toLastPage: true });

  const handlePageChange = (page: number) => store.search.loadFiltered({ page });

  const handleReprocess = () => setIsReprocessConfirmOpen(true);

  const handleScanSavedConfigs = async () => {
    const res = await stores.import.loadSavedConfigs();
    if (!res.success) return toast.error(res.error);

    handleSavedConfigsIngest({
      folderPaths: getImportConfigRootPaths(stores.import.savedConfigs),
      store: stores.import.ingester,
    });
  };

  useEffect(() => {
    if (store.isOpen) stores.import.loadSavedConfigs();
  }, [store.isOpen]);

  // Batches updating during an import keep the reader's position; only page changes scroll up.
  useEffect(() => {
    batchesRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [store.search.page]);

  return (
    <>
      <Modal.Container visible={store.isOpen} onClose={handleClose} width="100%" height="100%">
        <Modal.Content row dividers={false} overflow="hidden" padding={{ top: "1rem" }}>
          {store.isReady ? (
            <>
              <View column flex={1} minHeight={0} minWidth={0} overflow="hidden" spacing="0.5rem">
                <Card
                  flex="none"
                  width="100%"
                  padding={{ all: "0.8rem" }}
                  spacing="0.5rem"
                  header={
                    <UniformList row flex={1} justify="space-between">
                      <View row align="center" spacing="0.5rem">
                        <IconButton
                          name={store.isPaused ? "PlayArrow" : "Pause"}
                          iconProps={{ color: statusColor }}
                          onClick={store.togglePaused}
                        />

                        <Text fontWeight={500} color={statusColor}>
                          {store.isPaused ? "Paused" : store.isImporting ? "Importing" : "Inactive"}
                        </Text>
                      </View>

                      <View row justify="center" align="center">
                        <Text preset="title">{"Active Batch"}</Text>
                      </View>

                      <View row justify="flex-end" />
                    </UniformList>
                  }
                  headerProps={SEARCH_HEADER_PROPS}
                >
                  {store.activeBatch && (
                    <>
                      <ProgressBar
                        numerator={store.activeBatch.processedCount}
                        denominator={store.activeBatch.fileCount}
                        withText
                        minWidth="5rem"
                      />

                      <ProgressBar
                        numerator={store.bytesCompleted || null}
                        denominator={store.bytesTotal || null}
                        numeratorFormatter={Fmt.bytes}
                        denominatorFormatter={Fmt.bytes}
                        withText
                        minWidth="5rem"
                      />
                    </>
                  )}

                  {store.activeImports.length ? (
                    store.activeImports.map(({ filePath, progress }) => (
                      // A headerless card lays its body out in a row, so it sizes to the
                      // path's full width unless it may shrink.
                      <Card
                        key={filePath}
                        minWidth={0}
                        spacing="0.3rem"
                        bgColor={colors.foregroundCard}
                      >
                        <Text dir="rtl" textAlign="center" color={colors.custom.lightGrey}>
                          {filePath}
                        </Text>

                        {progress && (
                          <View row align="center" justify="center" spacing="0.5rem">
                            <Text>{progress.message}</Text>

                            {progress.progress != null && (
                              <Chip label={`${round(progress.progress, 0)}%`} />
                            )}

                            {progress.elapsed != null && (
                              <Chip label={Fmt.duration(progress.elapsed)} icon="Timer" />
                            )}
                          </View>
                        )}

                        {progress?.progress != null && (
                          <ProgressBar numerator={progress.progress} denominator={100} />
                        )}
                      </Card>
                    ))
                  ) : (
                    <Text textAlign="center" color={colors.custom.lightGrey}>
                      {"No active import"}
                    </Text>
                  )}
                </Card>

                {store.activeBatch && (
                  <ImportEditor.ImportFolderList folder={store.activeBatch} fill />
                )}
              </View>

              <Card
                flex={1}
                minHeight={0}
                minWidth={0}
                overflow="hidden"
                padding={{ all: 0 }}
                header={
                  <UniformList row flex={1} justify="space-between">
                    <View row align="center" spacing="0.5rem">
                      <ImportsFilterMenu store={store.search} />

                      {!hasNoSelection && (
                        <Chip label={`${store.search.selectedIds.length} Selected`} />
                      )}
                    </View>

                    <View row justify="center" align="center">
                      <Text preset="title">{"Search"}</Text>
                    </View>

                    <View row justify="flex-end" spacing="0.5rem">
                      <MultiActionButton
                        name="Refresh"
                        tooltip="Reprocess Stored Files of Selected Batches"
                        onClick={handleReprocess}
                        disabled={hasNoSelection}
                      />

                      <MultiActionButton
                        name="Delete"
                        tooltip="Delete Selected Batches"
                        onClick={handleDelete}
                        disabled={hasNoSelection}
                        iconProps={{
                          color: hasNoSelection ? colors.custom.grey : colors.custom.red,
                        }}
                      />

                      <DeselectAllButton itemLabel="batches" store={store.search} toast={toast} />

                      <SelectAllInQueryButton
                        itemLabel="batches"
                        store={store.search}
                        toast={toast}
                      />
                    </View>
                  </UniformList>
                }
                headerProps={SEARCH_HEADER_PROPS}
              >
                <SearchLoadingOverlay store={store.search} />

                <View
                  column
                  spacing="1rem"
                  flex={1}
                  minHeight={0}
                  overflow="hidden auto"
                  padding={{ all: "0.5rem" }}
                  ref={batchesRef}
                >
                  {store.search.results?.length ? (
                    store.search.results.map((batch) => (
                      <ImportEditor.ImportFolderList
                        key={batch.id}
                        folder={batch}
                        withListItems={false}
                        collapsible
                        selectable
                      />
                    ))
                  ) : (
                    <CenteredText text="No Results Found" color={colors.custom.lightGrey} />
                  )}
                </View>

                <Pagination
                  inline
                  count={store.search.pageCount}
                  page={store.search.page}
                  isLoading={store.search.isPageCountLoading && !store.search.isLoading}
                  onChange={handlePageChange}
                  onFullLoad={handleFullPageLoad}
                  siblingCount={2}
                />
              </Card>
            </>
          ) : (
            <CenteredText text="Import history is upgrading in the background. Check Activity for progress or Retry. You can continue browsing your library." />
          )}
        </Modal.Content>

        <Modal.Footer>
          <Button
            text="Saved Configs"
            icon="Settings"
            onClick={() => setIsConfigsModalOpen(true)}
          />

          <Button
            text="Scan Saved Configs"
            icon="ManageSearch"
            onClick={handleScanSavedConfigs}
            disabled={stores.import.ingester.isOpen}
          />

          <Button text="Close" icon="Close" onClick={handleClose} />
        </Modal.Footer>
      </Modal.Container>

      {isConfigsModalOpen && (
        <SavedImportConfigsModal onClose={() => setIsConfigsModalOpen(false)} />
      )}

      {isDeleteConfirmOpen && (
        <ConfirmModal
          headerText="Delete Import Batches"
          subText={`Delete ${Fmt.commas(store.search.selectedIds.length)} selected batches from import history? Unfinished imports are abandoned. Library files and import sources are kept.`}
          setVisible={setIsDeleteConfirmOpen}
          onConfirm={handleConfirmDelete}
        />
      )}

      {isReprocessConfirmOpen && (
        <ConfirmModal
          headerText="Reprocess Stored Files"
          subText={`Requeues stored files the ${Fmt.commas(store.search.selectedIds.length)} selected batches copied, kept as duplicates, or failed. Files they re-created from originals of compressed or edited files, scratch leftovers, deleted files, or files in use are removed.`}
          confirmIcon="Refresh"
          confirmText="Reprocess"
          height="28rem"
          width="35rem"
          setVisible={setIsReprocessConfirmOpen}
          onConfirm={handleConfirmReprocess}
        />
      )}
    </>
  );
});
