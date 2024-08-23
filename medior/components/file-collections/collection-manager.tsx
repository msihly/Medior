import { useEffect, useRef } from "react";
import { TagOption, observer, useStores } from "medior/store";
import {
  Button,
  CardGrid,
  CenteredText,
  FileCard,
  Input,
  ListItem,
  LoadingOverlay,
  MenuButton,
  Modal,
  Pagination,
  SortMenu,
  TagInput,
  Text,
  View,
} from "medior/components";
import { FileCollection } from ".";
import { CONSTANTS, colors, debounce, makeClasses, useDeepEffect, useDeepMemo } from "medior/utils";
import { toast } from "react-toastify";

export const FileCollectionManager = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const collectionsRef = useRef<HTMLDivElement>(null);

  const hasAnySelected = stores.collection.manager.fileIds.length > 0;
  const hasOneSelected = stores.collection.manager.fileIds.length === 1;
  const currentCollections = hasOneSelected
    ? stores.collection.listByFileId(stores.collection.manager.fileIds[0])
    : [];

  const sortValue = useDeepMemo(stores.collection.manager.searchSort);
  const tagSearchValue = useDeepMemo(stores.collection.manager.tagSearchValue);

  useEffect(() => {
    stores.collection.loadManagerFiles();
  }, [stores.collection.manager.fileIds]);

  useEffect(() => {
    if (stores.collection.manager.searchPage > stores.collection.manager.searchPageCount)
      handlePageChange(stores.collection.manager.searchPageCount);
  }, [stores.collection.manager.searchPage, stores.collection.manager.searchPageCount]);

  const searchDeps = [stores.collection.manager.titleSearchValue, sortValue, tagSearchValue];

  useDeepEffect(() => {
    collectionsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stores.collection.manager.searchPage, ...searchDeps]);

  useDeepEffect(() => {
    debounce(() => stores.collection.listFilteredCollections({ page: 1 }), 800)();
  }, [...searchDeps]);

  const handleAddToCollection = () => {
    stores.collection.editor.setWithSelectedFiles(true);
    stores.collection.editor.setId(stores.collection.selectedCollectionId);
    stores.collection.setIsEditorOpen(true);
  };

  const handleClose = () => {
    stores.collection.setIsManagerOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDeleteEmpty = () => stores.collection.deleteEmptyCollections();

  const handleRefreshMeta = () => stores.collection.regenAllCollMeta();

  const handleNewCollection = async () => {
    const res = await stores.collection.createCollection({
      fileIdIndexes: stores.collection.manager.fileIds.map((id, index) => ({
        fileId: id,
        index,
      })),
      title: "Untitled Collection",
    });

    if (!res.success) toast.error(res.error);
    else {
      stores.collection.editor.setId(res.data.id);
      stores.collection.setIsEditorOpen(true);
    }
  };

  const handlePageChange = (page: number) => stores.collection.listFilteredCollections({ page });

  const handleSortChange = (val: { isDesc: boolean; key: string }) =>
    stores.collection.manager.setSearchSort(val);

  const setTagSearchValue = (value: TagOption[]) =>
    stores.collection.manager.setTagSearchValue(value);

  const setTitleSearchValue = (value: string) =>
    !stores.collection.manager.isLoading && stores.collection.manager.setTitleSearchValue(value);

  return (
    <Modal.Container height="100%" width="100%" onClose={handleClose}>
      <LoadingOverlay isLoading={stores.collection.manager.isLoading} />

      <Modal.Header
        rightNode={
          <MenuButton color={colors.custom.grey}>
            <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
            <ListItem text="Delete Empty" icon="Delete" onClick={handleDeleteEmpty} />
          </MenuButton>
        }
      >
        <Text>{"Manage Collections"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        {!hasAnySelected ? null : hasOneSelected ? (
          <View row spacing="0.5rem">
            <View className={css.leftColumn}>
              <Text preset="label-glow">{"Selected File"}</Text>

              <View className={css.container}>
                {stores.collection.manager.files.length > 0 ? (
                  <FileCard
                    file={stores.collection.manager.files[0]}
                    height="13rem"
                    width="12rem"
                    disabled
                  />
                ) : (
                  <CenteredText text="Loading selected file..." />
                )}
              </View>
            </View>

            <View className={css.rightColumn}>
              <View row justify="center">
                <Text preset="label-glow">{"Current Collections"}</Text>
              </View>

              <View className={css.container}>
                {currentCollections.length > 0 ? (
                  currentCollections.map((c) => (
                    <FileCollection key={c.id} id={c.id} width="12rem" height="14rem" />
                  ))
                ) : (
                  <CenteredText text="No collections found" />
                )}
              </View>
            </View>
          </View>
        ) : (
          <View column>
            <Text preset="label-glow">{"Selected Files"}</Text>

            <View className={css.container}>
              {stores.collection.manager.files.length > 0 ? (
                stores.collection.manager.files.map((f) => (
                  <FileCard key={f.id} file={f} width="12rem" height="14rem" disabled />
                ))
              ) : (
                <CenteredText text="Loading selected files..." />
              )}
            </View>
          </View>
        )}

        <View row flex={1} margins={{ top: "0.5rem" }} spacing="0.5rem" overflow="hidden">
          <View className={css.leftColumn}>
            <Text preset="label-glow">{"Search"}</Text>

            <View column spacing="0.5rem" className={css.container}>
              <SortMenu
                rows={CONSTANTS.SORT_MENU_OPTS.COLLECTION_SEARCH}
                value={sortValue}
                setValue={handleSortChange}
                width="100%"
              />

              <Input
                label="Titles"
                value={stores.collection.manager.titleSearchValue}
                setValue={setTitleSearchValue}
                detachLabel
                fullWidth
              />

              <TagInput
                label="Tags"
                value={tagSearchValue}
                onChange={setTagSearchValue}
                detachLabel
                fullWidth
                hasSearchMenu
              />

              {/* <View column>
                <Text preset="label-glow">{"# of Files"}</Text>
                <View row justify="space-between" spacing="0.3rem">
                  <Dropdown
                    value={stores.collection.manager.}
                    setValue={handleNumOfTagsOpChange}
                    options={NUM_OF_TAGS_OPS}
                    width="5rem"
                  />

                  <NumInput
                    value={stores.collection}
                    setValue={handleNumOfTagsValueChange}
                    maxValue={50}
                    disabled={stores.home.numOfTagsOp === ""}
                    width="5rem"
                    textAlign="center"
                    hasHelper={false}
                  />
                </View>
              </View> */}
            </View>
          </View>

          <View className={css.rightColumn}>
            <Text preset="label-glow">{"All Collections"}</Text>

            <CardGrid
              ref={collectionsRef}
              cards={stores.collection.fileCollections.map((c) => (
                <FileCollection key={c.id} id={c.id} />
              ))}
              position="unset"
              className={css.container}
            >
              <Pagination
                count={stores.collection.manager.searchPageCount}
                page={stores.collection.manager.searchPage}
                onChange={handlePageChange}
              />
            </CardGrid>
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.custom.grey} />

        <Button text="New Collection" icon="Add" onClick={handleNewCollection} />

        {!hasAnySelected ? null : (
          <Button
            text="Add to Collection"
            icon="Add"
            onClick={handleAddToCollection}
            disabled={!stores.collection.selectedCollectionId}
          />
        )}
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  container: {
    display: "flex",
    flexFlow: "row wrap",
    borderRadius: "0.3rem",
    padding: "0.5rem 0.5rem 3.5rem",
    minHeight: "15rem",
    height: "100%",
    width: "100%",
    backgroundColor: colors.foreground,
    overflow: "auto",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    width: "13rem",
  },
  modalContent: {
    overflow: "hidden",
  },
  rightColumn: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "calc(100% - 13rem)",
  },
});
