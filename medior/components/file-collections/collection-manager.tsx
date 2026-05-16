import { useEffect, useRef } from "react";
import {
  Button,
  Card,
  CardGrid,
  CenteredText,
  Chip,
  Comp,
  FileCard,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  Pagination,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CollectionFilterMenu, DeleteCollectionModal, FileCollection } from ".";

const FILE_CARD_HEIGHT = 250;

export const FileCollectionManager = Comp(() => {
  const stores = useStores();
  const store = stores.collection.manager;

  const { css } = useClasses(null);

  const collsRef = useRef<HTMLDivElement>(null);

  const hasSelectedCollectionIds = store.search.selectedIds.length > 0;
  const selectedFileIds = store.selectedFileIds;
  const hasAnyFilesSelected = selectedFileIds.length > 0;
  const hasOneFileSelected = selectedFileIds.length === 1;
  const page = store.search.page;
  const pageCount = store.search.pageCount;

  useEffect(() => {
    (async () => {
      if (hasOneFileSelected) await store.loadCurrentCollections();
      else store.setCurrentCollections([]);
      store.loadFiles();
      store.search.loadFiltered({ page: 1 });
    })();
  }, [hasOneFileSelected, selectedFileIds]);

  useEffect(() => {
    scrollToTop();
    if (page > pageCount) handlePageChange(pageCount);
  }, [page, pageCount]);

  const handleAddToCollection = async () => {
    const collId = store.search.selectedIds[0];
    const fileIds = new Set(selectedFileIds);

    store.setIsLoading(true);
    const res = await stores.collection.editor.addFilesToCollection({
      collId,
      fileIds: [...fileIds],
    });
    store.setIsLoading(false);
    if (!res.success) return toast.error(res.error);

    stores.collection.editor.setIsOpen(true);
    await stores.collection.editor.loadCollection(collId);

    stores.collection.editor.search.setSelectedIds(
      stores.collection.editor.collection.fileIdIndexes
        .filter((f) => fileIds.has(f.fileId))
        .map((f) => f.fileId),
    );
  };

  const handleClose = () => {
    store.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDelete = () => {
    stores.collection.setIdsForConfirmDelete([...store.search.selectedIds]);
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleFullPageLoad = () => store.search.loadFiltered({ withFullCount: true });

  const handleRefreshMeta = () => stores.collection.regenCollMeta(store.search.selectedIds);

  const handleNewCollection = async () => {
    const res = await stores.collection.createCollection({
      fileIdIndexes: selectedFileIds.map((fileId, index) => ({ fileId, index })),
      title: "Untitled Collection",
    });

    if (!res.success) toast.error(res.error);
    else {
      await stores.collection.editor.loadCollection(res.data.id);
      stores.collection.editor.setIsOpen(true);
    }
  };

  const handlePageChange = (page: number) => store.search.loadFiltered({ page });

  const scrollToTop = () => collsRef.current?.scrollTo({ top: 0, behavior: "instant" });

  return (
    <Modal.Container isLoading={store.isLoading} onClose={handleClose} height="100%" width="100%">
      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        {!hasAnyFilesSelected ? null : (
          <View row className={css.topRow}>
            <Card
              header={
                <Text preset="title" padding="0.3rem 0">
                  {`Selected File${hasOneFileSelected ? "" : "s"}`}
                </Text>
              }
              headerProps={{ borderRadiuses: { top: 0 } }}
              width={hasOneFileSelected ? FILE_CARD_HEIGHT : "100%"}
              height="100%"
              borderRadiuses={{ bottomRight: 0 }}
              padding={{ all: "0.2rem" }}
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
                maxCards={hasOneFileSelected ? 1 : 6}
                padding={{ bottom: 0 }}
              />
            </Card>

            {hasOneFileSelected && (
              <Card
                column
                header={
                  <Text preset="title" padding="0.3rem 0">
                    {"Current Collections"}
                  </Text>
                }
                headerProps={{ borderRadiuses: { top: 0 } }}
                flex={1}
                padding={{ all: "0.2rem" }}
                borderRadiuses={{ bottomLeft: 0 }}
                overflow="auto"
              >
                {store.currentCollections.length ? (
                  store.currentCollections.map((c) => <FileCollection key={c.id} collection={c} />)
                ) : (
                  <CenteredText text="No collections found" />
                )}
              </Card>
            )}
          </View>
        )}

        <Card
          flex={1}
          overflow="auto"
          padding={{ all: 0 }}
          bgColor={colors.background}
          headerProps={{ borderRadiuses: { top: hasAnyFilesSelected ? 0 : undefined } }}
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
          <View position="relative" overflow="auto">
            <LoadingOverlay isLoading={store.search.isLoading} />

            <View
              ref={collsRef}
              column
              spacing="0.5rem"
              overflow="auto"
              padding={{ bottom: "5rem" }}
            >
              {store.search.results.map((c) => (
                <FileCollection key={c.id} collection={c} />
              ))}
            </View>
          </View>

          <Pagination
            count={pageCount}
            page={page}
            onChange={handlePageChange}
            isLoading={store.search.isPageCountLoading}
            onFullLoad={handleFullPageLoad}
            viewProps={{ style: { zIndex: 100 } }}
          />
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button
          text="New Collection"
          icon="Add"
          onClick={handleNewCollection}
          colorOnHover={colors.custom.blue}
        />

        {!hasAnyFilesSelected ? null : (
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
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  topRow: {
    maxHeight: 500,
  },
});
