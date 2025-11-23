import { useEffect } from "react";
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
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { dayjs, formatBytes } from "medior/utils/common";

export const ImportManager = Comp(() => {
  const stores = useStores();
  const store = stores.import.manager;

  const statusColor = store.isPaused
    ? colors.custom.orange
    : store.isImporting
      ? colors.custom.blue
      : colors.custom.grey;

  useEffect(() => {
    store.search.loadFiltered({ page: 1 });
    store.runImporter();
  }, []);

  const handleClose = () => {
    store.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handlePageChange = (page: number) => store.search.loadFiltered({ page });

  return (
    <Modal.Container
      visible={stores.import.manager.isOpen}
      onClose={handleClose}
      width="100%"
      height="100%"
    >
      <Modal.Content row dividers={false}>
        <View column flex={1} overflow="auto">
          <Modal.Header>
            <Text preset="title">{"Active Batch"}</Text>
          </Modal.Header>

          <View column height="100%" spacing="0.5rem">
            <Card
              height="100%"
              width="100%"
              padding={{ all: "0.8rem" }}
              header={
                <View row align="center" spacing="0.5rem">
                  <IconButton
                    name={store.isPaused ? "PlayArrow" : "Pause"}
                    iconProps={{ color: statusColor }}
                    onClick={store.togglePaused}
                    disabled={!store.isPaused && !store.isImporting}
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
                  numerator={store.activeBatch?.imported?.length}
                  denominator={store.activeBatch?.imports?.length}
                  withText
                  minWidth="5rem"
                />

                <ProgressBar
                  numerator={store.importStats?.completedBytes || null}
                  denominator={store.importStats?.totalBytes || null}
                  numeratorFormatter={formatBytes}
                  denominatorFormatter={formatBytes}
                  withText
                  minWidth="5rem"
                />

                <UniformList row padding={{ left: "1rem" }}>
                  <View row spacing="0.5rem">
                    <Text fontWeight={500}>{"Speed"}</Text>
                    <Text color={colors.custom.lightGrey}>
                      {store.importStats?.rateInBytes > -1
                        ? `${formatBytes(store.importStats.rateInBytes)}/s`
                        : "--"}
                    </Text>
                  </View>

                  <View row spacing="0.5rem">
                    <Text fontWeight={500}>{"Elapsed"}</Text>
                    <Text color={colors.custom.lightGrey}>
                      {store.importStats?.elapsedTime > -1
                        ? `${dayjs.duration(store.importStats.elapsedTime).seconds()}s`
                        : "--"}
                    </Text>
                  </View>
                </UniformList>

                <Text
                  dir="rtl"
                  whiteSpace="nowrap"
                  textOverflow="ellipsis"
                  textAlign="center"
                  color={colors.custom.lightGrey}
                >
                  {store.importStats?.filePath || "No active import"}
                </Text>

                <ImportEditor.ImportFolderList folder={store.activeBatch} maxVisibleFiles={15} />
              </View>
            </Card>
          </View>
        </View>

        <View column flex={1} overflow="auto">
          <Modal.Header>
            <Text preset="title">{"Search"}</Text>
          </Modal.Header>

          <Card
            height="100%"
            overflow="auto"
            header={<ImportsFilterMenu store={store.search} />}
            headerProps={{ justify: "flex-start", padding: { all: "0.3rem" } }}
          >
            <View
              column
              spacing="1rem"
              height="100%"
              padding={{ bottom: "5rem" }}
              overflow="hidden auto"
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
              count={store.search.pageCount}
              page={store.search.page}
              isLoading={store.search.isPageCountLoading}
              onChange={handlePageChange}
            />
          </Card>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.custom.grey} />
      </Modal.Footer>
    </Modal.Container>
  );
});
