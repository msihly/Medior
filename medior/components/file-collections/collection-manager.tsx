import { useEffect, useRef } from "react";
import { observer, useStores } from "medior/store";
import {
  Button,
  Card,
  CardGrid,
  CenteredText,
  FileCard,
  ListItem,
  LoadingOverlay,
  MenuButton,
  Modal,
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

  const collectionsRef = useRef<HTMLDivElement>(null);

  const selectedFileIds = stores.collection.manager.selectedFileIds;
  const hasAnySelected = selectedFileIds.length > 0;
  const hasOneSelected = selectedFileIds.length === 1;
  useEffect(() => {
    if (hasOneSelected) stores.collection.manager.loadCurrentCollections();
    else stores.collection.manager.setCurrentCollections([]);
    stores.collection.manager.loadFiles();
    stores.collection.manager.search.loadFiltered({ page: 1 });
  }, [hasOneSelected, selectedFileIds]);

  const page = stores.collection.manager.search.page;
  const pageCount = stores.collection.manager.search.pageCount;
  useEffect(() => {
    if (page > pageCount) handlePageChange(pageCount);
  }, [page, pageCount]);

  useDeepEffect(() => {
    collectionsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, stores.collection.manager.search.results]);

  const handleAddToCollection = async () => {
    stores.collection.manager.setIsLoading(true);
    await stores.collection.editor.loadCollection({
      id: stores.collection.manager.selectedCollectionId,
    });
    stores.collection.manager.setIsLoading(false);
    stores.collection.editor.setIsOpen(true);
  };

  const handleClose = () => {
    stores.collection.manager.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDeleteEmpty = () => stores.collection.deleteEmptyCollections();

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
      await stores.collection.editor.loadCollection({ id: res.data.id });
      stores.collection.editor.setIsOpen(true);
    }
  };

  const handlePageChange = (page: number) =>
    stores.collection.manager.search.loadFiltered({ page });

  return (
    <Modal.Container height="100%" width="100%" onClose={handleClose}>
      <LoadingOverlay isLoading={stores.collection.manager.isLoading} />

      <Modal.Content dividers={false} padding={{ top: "1rem" }}>
        <View column flex={1} spacing="0.5rem" overflow="hidden">
          {!hasAnySelected ? null : (
            <View row spacing="0.5rem">
              <Card
                header={`Selected File${hasOneSelected ? "" : "s"}`}
                height={`calc(${FILE_CARD_HEIGHT} + 3.5rem)`}
                width="14rem"
                padding={{ all: 0 }}
                overflow="auto"
              >
                <CardGrid
                  cards={stores.collection.manager.selectedFiles.map((f) => (
                    <FileCard key={f.id} file={f} height={FILE_CARD_HEIGHT} disabled />
                  ))}
                  maxCards={hasOneSelected ? 1 : 6}
                />
              </Card>

              {hasOneSelected && (
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
                  {/* TODO: Multi-actions; delete, refresh, select / deselect */}

                  <MenuButton color={colors.custom.grey}>
                    <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
                    <ListItem text="Delete Empty" icon="Delete" onClick={handleDeleteEmpty} />
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
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button
          text="New Collection"
          icon="Add"
          onClick={handleNewCollection}
          colorOnHover={colors.custom.blue}
        />

        {!hasAnySelected ? null : (
          <Button
            text="Add to Collection"
            icon="Add"
            onClick={handleAddToCollection}
            disabled={!stores.collection.manager.selectedCollectionId}
            colorOnHover={colors.custom.purple}
          />
        )}
      </Modal.Footer>
    </Modal.Container>
  );
});
