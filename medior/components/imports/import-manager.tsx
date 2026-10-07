import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CenteredText,
  Comp,
  IconButton,
  ImportEditor,
  ImportsFilterMenu,
  Modal,
  Pagination,
  ProgressBar,
  SavedImportConfigsModal,
  SearchLoadingOverlay,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { Fmt, round } from "medior/utils/common";

export const ImportManager = Comp(() => {
  const stores = useStores();
  const store = stores.import.manager;

  const { css } = useClasses({ hasActiveProgress: store.activeFileProgress?.progress != null });

  const [isConfigsModalOpen, setIsConfigsModalOpen] = useState(false);

  const statusColor = store.isPaused
    ? colors.custom.orange
    : store.isImporting
      ? colors.custom.blue
      : colors.custom.grey;

  const handleClose = () => {
    store.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleFullPageLoad = () => store.search.loadFiltered({ toLastPage: true });

  const handlePageChange = (page: number) => store.search.loadFiltered({ page });

  useEffect(() => {
    if (store.isOpen) stores.import.loadSavedConfigs();
  }, [store.isOpen]);

  return (
    <>
      <Modal.Container visible={store.isOpen} onClose={handleClose} width="100%" height="100%">
        <Modal.Content row dividers={false} overflow="hidden">
          {store.isReady ? (
            <>
              <View column flex={1} minHeight={0} minWidth={0} overflow="hidden">
                <Modal.Header>
                  <Text preset="title">{"Active Batch"}</Text>
                </Modal.Header>

                <View column flex={1} minHeight={0} spacing="0.5rem" overflow="hidden auto">
                  <Card
                    flex="none"
                    width="100%"
                    padding={{ all: "0.8rem" }}
                    header={
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
                    }
                    headerProps={{ justify: "flex-start" }}
                  >
                    <View column spacing="1rem">
                      <ProgressBar
                        numerator={store.activeBatch?.processedCount}
                        denominator={store.activeBatch?.fileCount}
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

                      <Text
                        dir="rtl"
                        whiteSpace="nowrap"
                        textOverflow="ellipsis"
                        textAlign="center"
                        color={colors.custom.lightGrey}
                      >
                        {store.activeFilePath || "No active import"}
                      </Text>

                      <View column spacing="0.5rem">
                        <Text
                          lineHeight="1.5em"
                          minHeight="1.5em"
                          textAlign="center"
                          textOverflow="ellipsis"
                          whiteSpace="nowrap"
                        >
                          {store.activeFileProgress
                            ? `${store.activeFileProgress.message} (${store.activeFileProgress.elapsed}s elapsed)`
                            : null}
                        </Text>

                        <ProgressBar
                          numerator={round(store.activeFileProgress?.progress ?? 0)}
                          denominator={100}
                          viewProps={{ className: css.activeProgress }}
                          withText
                        />
                      </View>

                      <ImportEditor.ImportFolderList
                        folder={store.activeBatch}
                        maxVisibleFiles={15}
                      />
                    </View>
                  </Card>
                </View>
              </View>

              <View column flex={1} minHeight={0} minWidth={0} overflow="hidden">
                <Modal.Header>
                  <Text preset="title">{"Search"}</Text>
                </Modal.Header>

                <Card
                  flex={1}
                  minHeight={0}
                  overflow="hidden"
                  position="relative"
                  padding={{ all: 0 }}
                  header={<ImportsFilterMenu store={store.search} />}
                  headerProps={{ justify: "flex-start", padding: { all: "0.3rem" } }}
                >
                  <SearchLoadingOverlay store={store.search} />

                  <View
                    column
                    spacing="1rem"
                    flex={1}
                    minHeight={0}
                    overflow="hidden auto"
                    padding={{ all: "0.5rem" }}
                  >
                    {store.search.results?.length ? (
                      store.search.results.map((batch) => (
                        <ImportEditor.ImportFolderList
                          key={batch.id}
                          folder={batch}
                          withListItems={false}
                          collapsible
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
              </View>
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

          <Button text="Close" icon="Close" onClick={handleClose} color={colors.custom.grey} />
        </Modal.Footer>
      </Modal.Container>

      {isConfigsModalOpen && (
        <SavedImportConfigsModal onClose={() => setIsConfigsModalOpen(false)} />
      )}
    </>
  );
});

const useClasses = makeClasses((props: { hasActiveProgress: boolean }) => ({
  activeProgress: {
    visibility: props.hasActiveProgress ? "visible" : "hidden",
  },
}));
