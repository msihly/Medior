import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardGrid,
  CenteredText,
  Comp,
  ConfirmModal,
  FileCard,
  ListItem,
  LoadingOverlay,
  MenuButton,
  Modal,
  MultiActionButton,
  Pagination,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast, useDeepEffect } from "medior/utils/client";
import { CollectionFilterMenu, FileCollection } from ".";

const FILE_CARD_HEIGHT = 250;

export const FileCollectionManager = Comp(() => {
  const stores = useStores();
  const store = stores.collection.manager;

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const collectionsRef = useRef<HTMLDivElement>(null);

  const hasSelectedCollectionIds = store.search.selectedIds.length > 0;
  const selectedFileIds = store.selectedFileIds;
  const hasAnyFilesSelected = selectedFileIds.length > 0;
  const hasOneFileSelected = selectedFileIds.length === 1;
  useEffect(() => {
    if (hasOneFileSelected) store.loadCurrentCollections();
    else store.setCurrentCollections([]);
    store.loadFiles();
    store.search.loadFiltered({ page: 1 });
  }, [hasOneFileSelected, selectedFileIds]);

  const page = store.search.page;
  const pageCount = store.search.pageCount;
  useEffect(() => {
    if (page > pageCount) handlePageChange(pageCount);
  }, [page, pageCount]);

  useDeepEffect(() => {
    collectionsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, store.search.results]);

  const handleAddToCollection = async () => {
    const collId = store.search.selectedIds[0];
    const fileIds = new Set(store.selectedFileIds);

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

  const handleConfirmDelete = async () => {
    const res = await stores.collection.deleteCollections(store.search.selectedIds);

    if (!res.success) {
      toast.error(res.error);
      return false;
    } else {
      setIsConfirmDeleteOpen(false);
      store.search.loadFiltered({ page });
      return true;
    }
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleDeleteEmpty = () => stores.collection.deleteEmptyCollections();

  const handleDeleteDuplicates = () => stores.collection.deleteDuplicates();

  const handleRefreshMeta = () => stores.collection.regenAllCollMeta();

  const handleNewCollection = async () => {
    const res = await stores.collection.createCollection({
      fileIdIndexes: store.selectedFileIds.map((id, index) => ({
        fileId: id,
        index,
      })),
      title: "Untitled Collection",
    });

    if (!res.success) toast.error(res.error);
    else {
      await stores.collection.editor.loadCollection(res.data.id);
      stores.collection.editor.setIsOpen(true);
    }
  };

  const handlePageChange = (page: number) => store.search.loadFiltered({ page });

  return (
    <Modal.Container isLoading={store.isLoading} onClose={handleClose} height="100%" width="100%">
      <Modal.Content dividers={false} spacing="0.5rem" overflow="hidden" padding={{ top: "1rem" }}>
        {!hasAnyFilesSelected ? null : (
          <View row spacing="0.5rem">
            <Card
              header={
                <Text preset="title" padding="0.3rem 0">
                  {`Selected File${hasOneFileSelected ? "" : "s"}`}
                </Text>
              }
              width={hasOneFileSelected ? FILE_CARD_HEIGHT : "100%"}
              padding={{ all: 4 }}
              overflow="hidden"
            >
              <CardGrid
                cards={store.selectedFiles.map((f) => (
                  <FileCard key={f.id} file={f} height={FILE_CARD_HEIGHT} disabled />
                ))}
                maxCards={hasOneFileSelected ? 1 : 6}
                height={FILE_CARD_HEIGHT + 50}
                padding={{ bottom: 0 }}
              />
            </Card>

            {hasOneFileSelected && (
              <Card
                header={
                  <Text preset="title" padding="0.3rem 0">
                    {"Current Collections"}
                  </Text>
                }
                flex={1}
                padding={{ all: 4 }}
                overflow="auto"
              >
                {store.currentCollections.length ? (
                  <CardGrid
                    cards={store.currentCollections.map((c) => (
                      <FileCollection key={c.id} collection={c} height={FILE_CARD_HEIGHT} />
                    ))}
                    maxCards={5}
                    height={FILE_CARD_HEIGHT + 50}
                    padding={{ bottom: 0 }}
                  />
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
          header={
            <UniformList row flex={1} justify="space-between" padding={{ all: "0.3rem" }}>
              <View row>
                <CollectionFilterMenu store={store.search} />
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
                </View>

                <MenuButton color={colors.custom.grey}>
                  <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />

                  <ListItem
                    text="Delete Empty"
                    icon="Delete"
                    color={colors.custom.red}
                    iconProps={{ color: colors.custom.red }}
                    onClick={handleDeleteEmpty}
                  />

                  <ListItem
                    text="Delete Duplicates"
                    icon="Delete"
                    color={colors.custom.red}
                    iconProps={{ color: colors.custom.red }}
                    onClick={handleDeleteDuplicates}
                  />
                </MenuButton>
              </View>
            </UniformList>
          }
        >
          <LoadingOverlay isLoading={store.search.isLoading} />

          <CardGrid
            ref={collectionsRef}
            flex={1}
            cards={store.search.results.map((c) => (
              <FileCollection key={c.id} collection={c} height={FILE_CARD_HEIGHT} />
            ))}
          >
            <Pagination
              count={pageCount}
              page={page}
              onChange={handlePageChange}
              isLoading={store.search.isPageCountLoading}
            />
          </CardGrid>
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

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Collections"
          subText={`Are you sure you want to delete the ${store.search.selectedIds.length} selected collections?`}
          onConfirm={handleConfirmDelete}
          setVisible={setIsConfirmDeleteOpen}
        />
      )}
    </Modal.Container>
  );
});
