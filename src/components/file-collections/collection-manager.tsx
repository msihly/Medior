import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Pagination } from "@mui/material";
import {
  Button,
  CenteredText,
  FileCard,
  Input,
  ListItem,
  LoadingOverlay,
  MenuButton,
  Modal,
  SortMenu,
  TagInput,
  Text,
  View,
} from "components";
import { DisplayedCollections, FileCollection } from ".";
import { CONSTANTS, colors, debounce, makeClasses, useDeepEffect, useDeepMemo } from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const FileCollectionManager = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const collectionsRef = useRef<HTMLDivElement>(null);

  const hasAnySelected = stores.collection.managerFileIds.length > 0;
  const hasOneSelected = stores.collection.managerFileIds.length === 1;
  const currentCollections = hasOneSelected
    ? stores.collection.listByFileId(stores.collection.managerFileIds[0])
    : [];

  const sortValue = useDeepMemo(stores.collection.managerSearchSort);
  const tagSearchValue = useDeepMemo(stores.collection.managerTagSearchValue);

  useEffect(() => {
    stores.collection.loadManagerFiles();
  }, [stores.collection.managerFileIds]);

  useEffect(() => {
    if (stores.collection.managerSearchPage > stores.collection.managerSearchPageCount)
      handlePageChange(null, stores.collection.managerSearchPageCount);
  }, [stores.collection.managerSearchPage, stores.collection.managerSearchPageCount]);

  const searchDeps = [stores.collection.managerTitleSearchValue, sortValue, tagSearchValue];

  useDeepEffect(() => {
    collectionsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stores.collection.managerSearchPage, ...searchDeps]);

  useDeepEffect(() => {
    debounce(() => stores.collection.listFilteredCollections({ page: 1 }), 800)();
  }, [...searchDeps]);

  const handleClose = () => {
    stores.collection.setIsManagerOpen(false);
    stores.home.reloadIfQueued();
  };

  const handleRefreshMeta = () => stores.collection.regenAllCollMeta();

  const handleNewCollection = async () => {
    const res = await stores.collection.createCollection({
      fileIdIndexes: stores.collection.managerFileIds.map((id, index) => ({
        fileId: id,
        index,
      })),
      title: "Untitled Collection",
    });

    if (!res.success) toast.error(res.error);
    else {
      stores.collection.setEditorId(res.data.id);
      stores.collection.setIsEditorOpen(true);
    }
  };

  const handlePageChange = (_, page: number) =>
    stores.collection.listFilteredCollections({ page });

  const handleSortChange = (val: { isDesc: boolean; key: string }) =>
    stores.collection.setManagerSearchSort(val);

  const setTagSearchValue = (value: TagOption[]) =>
    stores.collection.setManagerTagSearchValue(value);

  const setTitleSearchValue = (value: string) =>
    !stores.collection.isManagerLoading && stores.collection.setManagerTitleSearchValue(value);

  return (
    <Modal.Container height="100%" width="100%" onClose={handleClose}>
      <LoadingOverlay isLoading={stores.collection.isManagerLoading} />

      <Modal.Header
        rightNode={
          <MenuButton color={colors.button.grey}>
            <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
          </MenuButton>
        }
      >
        <Text>{"Manage Collections"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        {!hasAnySelected ? null : hasOneSelected ? (
          <View row>
            <View className={css.leftColumn}>
              <Text preset="label-glow">{"Selected File"}</Text>

              <View className={css.container}>
                {stores.collection.managerFiles.length > 0 ? (
                  <FileCard
                    file={stores.collection.managerFiles[0]}
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
              {stores.collection.managerFiles.length > 0 ? (
                stores.collection.managerFiles.map((f) => (
                  <FileCard key={f.id} file={f} width="12rem" height="14rem" disabled />
                ))
              ) : (
                <CenteredText text="Loading selected files..." />
              )}
            </View>
          </View>
        )}

        <View row margins={{ top: "0.5rem" }} overflow="hidden">
          <View className={css.leftColumn}>
            <Text preset="label-glow">{"Search"}</Text>

            <View column className={css.container}>
              <SortMenu
                rows={CONSTANTS.SORT_MENU_OPTS.COLLECTION_SEARCH}
                value={sortValue}
                setValue={handleSortChange}
                color={colors.button.darkGrey}
                width="100%"
                margins={{ bottom: "0.5rem" }}
              />

              <Text preset="label-glow">{"Titles"}</Text>
              <Input
                value={stores.collection.managerTitleSearchValue}
                setValue={setTitleSearchValue}
                fullWidth
                margins={{ bottom: "0.5rem" }}
              />

              <Text preset="label-glow">{"Tags"}</Text>
              <TagInput
                value={tagSearchValue}
                onChange={setTagSearchValue}
                fullWidth
                hasSearchMenu
              />
            </View>
          </View>

          <View className={css.rightColumn}>
            <Text preset="label-glow">{"All Collections"}</Text>

            <View ref={collectionsRef} className={css.container}>
              <DisplayedCollections />

              <Pagination
                count={stores.collection.managerSearchPageCount}
                page={stores.collection.managerSearchPage}
                onChange={handlePageChange}
                showFirstButton
                showLastButton
                siblingCount={2}
                boundaryCount={2}
                className={css.pagination}
              />
            </View>
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.button.grey} />

        <Button text="New Collection" icon="Add" onClick={handleNewCollection} />
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
    backgroundColor: colors.grey["800"],
    overflow: "auto",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    width: "13rem",
    marginRight: "0.5rem",
  },
  modalContent: {
    overflow: "hidden",
  },
  pagination: {
    position: "absolute",
    bottom: "0.5rem",
    left: 0,
    right: 0,
    borderRight: `3px solid ${colors.blue["800"]}`,
    borderLeft: `3px solid ${colors.blue["800"]}`,
    borderRadius: "0.5rem",
    margin: "0 auto",
    padding: "0.3rem",
    width: "fit-content",
    background: `linear-gradient(to top, ${colors.grey["900"]}, ${Color(colors.grey["900"])
      .darken(0.1)
      .string()})`,
  },
  rightColumn: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "calc(100% - 13rem)",
  },
});
