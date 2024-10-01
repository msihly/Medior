import { useEffect, useRef, useState } from "react";
import { observer, useStores } from "medior/store";
import {
  Button,
  Card,
  CardGrid,
  CenteredText,
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
import { CollectionFilterMenu, FileCollection } from ".";
import { colors, useDeepEffect } from "medior/utils";
import { toast } from "react-toastify";

const FILE_CARD_HEIGHT = "14rem";

export const FileCollectionManager = observer(() => {
  const stores = useStores();

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const collectionsRef = useRef<HTMLDivElement>(null);

  const hasSelectedCollectionIds = stores.collection.manager.search.selectedIds.length > 0;
  const selectedFileIds = stores.collection.manager.selectedFileIds;
  const hasAnyFilesSelected = selectedFileIds.length > 0;
  const hasOneFileSelected = selectedFileIds.length === 1;
  useEffect(() => {
    if (hasOneFileSelected) stores.collection.manager.loadCurrentCollections();
    else stores.collection.manager.setCurrentCollections([]);
    stores.collection.manager.loadFiles();
    stores.collection.manager.search.loadFiltered({ page: 1 });
  }, [hasOneFileSelected, selectedFileIds]);

  const page = stores.collection.manager.search.page;
  const pageCount = stores.collection.manager.search.pageCount;
  useEffect(() => {
    if (page > pageCount) handlePageChange(pageCount);
  }, [page, pageCount]);

  useDeepEffect(() => {
    collectionsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, stores.collection.manager.search.results]);

  // TODO: Adjust this to open the editor, add files to the end of the collection, and navigate to the last page
  // const handleAddToCollection = async () => {
  //   stores.collection.manager.setIsLoading(true);
  //   await stores.collection.editor.loadCollection(stores.collection.manager.search.selectedIds[0]);
  //   stores.collection.manager.setIsLoading(false);
  //   stores.collection.editor.setIsOpen(true);
  // };

  const handleClose = () => {
    stores.collection.manager.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleConfirmDelete = async () => {
    const res = await stores.collection.deleteCollections(
      stores.collection.manager.search.selectedIds
    );

    if (!res.success) {
      toast.error(res.error);
      return false;
    } else {
      setIsConfirmDeleteOpen(false);
      stores.collection.manager.search.loadFiltered({ page });
      return true;
    }
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleDeleteEmpty = () => stores.collection.deleteEmptyCollections();

  const handleDeleteDuplicates = () => stores.collection.deleteDuplicates();

  const handleRefreshMeta = () => stores.collection.regenAllCollMeta();

  const handleNewCollection = async () => {
    const res = await stores.collection.createCollection({
      fileIdIndexes: stores.collection.manager.selectedFileIds.map((id, index) => ({
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

  const handlePageChange = (page: number) =>
    stores.collection.manager.search.loadFiltered({ page });

  return (
    <Modal.Container
      isLoading={stores.collection.manager.isLoading}
      onClose={handleClose}
      height="100%"
      width="100%"
    >
      <Modal.Content dividers={false} spacing="0.5rem" overflow="hidden" padding={{ top: "1rem" }}>
        {!hasAnyFilesSelected ? null : (
          <View row spacing="0.5rem">
            <Card
              header={`Selected File${hasOneFileSelected ? "" : "s"}`}
              height={`calc(${FILE_CARD_HEIGHT} + 3.5rem)`}
              width={hasOneFileSelected ? "14rem" : "100%"}
              padding={{ all: 0 }}
              overflow="auto"
            >
              <CardGrid
                cards={stores.collection.manager.selectedFiles.map((f) => (
                  <FileCard key={f.id} file={f} height={FILE_CARD_HEIGHT} disabled />
                ))}
                maxCards={hasOneFileSelected ? 1 : 6}
              />
            </Card>

            {hasOneFileSelected && (
              <Card
                header="Current Collections"
                flex={1}
                height={`calc(${FILE_CARD_HEIGHT} + 3.5rem)`}
                overflow="auto"
              >
                {stores.collection.manager.currentCollections.length ? (
                  <CardGrid
                    cards={stores.collection.manager.currentCollections.map((c) => (
                      <FileCollection key={c.id} id={c.id} height={FILE_CARD_HEIGHT} />
                    ))}
                    maxCards={5}
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
                <CollectionFilterMenu store={stores.collection.manager.search} />
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
          <LoadingOverlay isLoading={stores.collection.manager.search.isLoading} />

          <CardGrid
            ref={collectionsRef}
            flex={1}
            cards={stores.collection.manager.search.results.map((c) => (
              <FileCollection key={c.id} id={c.id} height={FILE_CARD_HEIGHT} />
            ))}
          >
            <Pagination count={pageCount} page={page} onChange={handlePageChange} />
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

        {/* {!hasAnyFilesSelected ? null : (
          <Button
            text="Add to Collection"
            icon="Add"
            onClick={handleAddToCollection}
            disabled={stores.collection.manager.search.selectedIds.length !== 1}
            colorOnHover={colors.custom.purple}
          />
        )} */}
      </Modal.Footer>

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Collections"
          subText={`Are you sure you want to delete the ${stores.collection.manager.search.selectedIds.length} selected collections?`}
          onConfirm={handleConfirmDelete}
          setVisible={setIsConfirmDeleteOpen}
        />
      )}
    </Modal.Container>
  );
});
