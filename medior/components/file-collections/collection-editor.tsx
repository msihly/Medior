import { ReactNode, useEffect, useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Button,
  Card,
  CardGrid,
  Comp,
  ConfirmModal,
  FileCollectionFile,
  FileSearchColumn,
  Input,
  ListItem,
  MenuButton,
  Modal,
  MultiActionButton,
  NumInput,
  Pagination,
  RatingButton,
  SortMenu,
  SortMenuProps,
  TagRow,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { useHotkeys } from "medior/views";

export const FileCollectionEditor = Comp(() => {
  const stores = useStores();
  const store = stores.collection.editor;

  const { handleKeyPress } = useHotkeys({ view: "home" });

  const hasNoSelection = store.search.selectedIds.length === 0;
  const isCreate = store.collection === null;

  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isConfirmRemoveFilesOpen, setIsConfirmRemoveFilesOpen] = useState(false);
  const [maxDelta, setMaxDelta] = useState<number>(null);

  useEffect(() => {
    return () => {
      store.search.reset();
      store.fileSearch.reset();
    };
  }, []);

  const confirmClose = () => {
    if (store.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const confirmRemoveFiles = async () => {
    const res = await store.removeFiles(store.search.selectedIds);
    return res.success;
  };

  const handleArchiveFiles = () => stores.file.confirmDeleteFiles(store.search.selectedIds);

  const handleClose = async () => {
    store.setIsOpen(false);
    stores.file.search.reloadIfQueued();
    return true;
  };

  const handleDelete = () => stores.collection.setIsConfirmDeleteOpen(true);

  const handleDeselectAll = () => {
    store.search.toggleSelected(store.search.selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all files");
  };

  const handleEditTags = () => {
    stores.file.tagsEditor.setBatchId(null);
    stores.file.tagsEditor.setFileIds([...store.search.selectedIds]);
    stores.file.tagsEditor.setIsOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshFiles({ ids: store.search.selectedIds });

  const handleMoveFilesDown = () => store.moveFileIndexes({ down: true, maxDelta });

  const handleMoveFilesUp = () => store.moveFileIndexes({ down: false, maxDelta });

  const handlePageChange = (page: number) => {
    store.search.setPage(page);
    store.search.loadFiltered();
  };

  const handleRating = (rating: number) =>
    stores.collection.updateCollRating({ id: store.collection.id, rating });

  const handleRefreshMeta = () => stores.collection.regenCollMeta([store.collection.id]);

  const handleRemoveFiles = () => setIsConfirmRemoveFilesOpen(true);

  const handleSave = async () => {
    if (!store.title) return toast.error("Title is required!");
    await store.saveCollection();
  };

  const handleSelectAll = () => {
    store.search.toggleSelected(store.search.results.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added all ${store.search.selectedIds.length} files to selection`);
  };

  const handleTitleChange = (val: string) => {
    store.setHasUnsavedChanges(true);
    store.setTitle(val);
  };

  const setSortValue = (value: SortMenuProps["value"]) => store.setSortValue(value);

  const toggleAddingFiles = () => setIsAddingFiles((prev) => !prev);

  return (
    <Modal.Container
      isLoading={store.isLoading || store.search.isLoading}
      onClose={confirmClose}
      height="100%"
      width="100%"
    >
      <Modal.Header
        leftNode={
          <Button
            text={isAddingFiles ? "Hide Search" : "Add Files"}
            icon={isAddingFiles ? "VisibilityOff" : "Add"}
            onClick={toggleAddingFiles}
            disabled={store.isLoading}
            color={colors.foregroundCard}
            colorOnHover={colors.custom.purple}
          />
        }
        rightNode={
          isCreate ? null : (
            <View row align="center" spacing="0.5rem">
              <RatingButton rating={store.collection?.rating} setRating={handleRating} />

              <MenuButton color={colors.custom.grey}>
                <ListItem text="Delete" icon="Delete" onClick={handleDelete} />
                <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
              </MenuButton>
            </View>
          )
        }
      >
        <Text preset="title">{`${isCreate ? "Create" : "Edit"} Collection`}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} row flex={1} height="100%" spacing="0.5rem">
        {isAddingFiles && <FileSearchColumn />}

        <View column flex={1} spacing="0.5rem" overflow="hidden">
          <View row spacing="0.5rem">
            <Card column flex={1} spacing="0.5rem" overflow="hidden">
              <HeaderRow label="Title">
                <Input value={store.title} setValue={handleTitleChange} width="100%" />
              </HeaderRow>

              <HeaderRow label="Tags">
                <TagRow tags={store.tags} />
              </HeaderRow>
            </Card>

            <Card column flex="none" height="100%">
              <View row>
                <MultiActionButton
                  name="ArrowUpward"
                  tooltip="Move Files Up"
                  onClick={handleMoveFilesUp}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="ArrowDownward"
                  tooltip="Move Files Down"
                  onClick={handleMoveFilesDown}
                  disabled={hasNoSelection}
                />
              </View>

              <NumInput
                placeholder="Delta"
                value={maxDelta}
                setValue={setMaxDelta}
                minValue={1}
                hasHelper={false}
                width="5rem"
                textAlign="center"
              />
            </Card>

            <Card column flex="none" height="100%">
              <View row>
                <MultiActionButton
                  name="Delete"
                  tooltip="Remove Files From Collection"
                  iconProps={{ color: colors.custom.red }}
                  onClick={handleRemoveFiles}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Archive"
                  tooltip="Archive Files"
                  iconProps={{ color: colors.custom.orange }}
                  onClick={handleArchiveFiles}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Label"
                  tooltip="Edit Tags"
                  onClick={handleEditTags}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Refresh"
                  tooltip="Refresh File Info"
                  onClick={handleFileInfoRefresh}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Deselect"
                  tooltip="Deselect All Files"
                  onClick={handleDeselectAll}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="SelectAll"
                  tooltip="Select All Files in View"
                  onClick={handleSelectAll}
                />
              </View>

              <SortMenu
                value={store.search.sortValue}
                setValue={setSortValue}
                rows={SORT_OPTIONS.FileCollectionFile}
                width="100%"
              />
            </Card>
          </View>

          <Card column flex={1} overflow="auto">
            <CardGrid
              cards={store.search.results.map((f) => (
                <FileCollectionFile key={f.id} file={f} store={store.search} />
              ))}
              cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
            />

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
        <Button
          text={store.hasUnsavedChanges ? "Cancel" : "Close"}
          icon="Close"
          onClick={confirmClose}
          disabled={store.isLoading}
          colorOnHover={store.hasUnsavedChanges ? colors.custom.red : undefined}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!store.hasUnsavedChanges || store.isLoading}
          color={colors.custom.purple}
        />
      </Modal.Footer>

      {isConfirmRemoveFilesOpen && (
        <ConfirmModal
          headerText="Remove Files"
          subText="Are you sure you want to remove the selected files from the collection?"
          setVisible={setIsConfirmRemoveFilesOpen}
          onConfirm={confirmRemoveFiles}
        />
      )}

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to discard changes?"
          confirmText="Discard"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleClose}
        />
      )}
    </Modal.Container>
  );
});

const HeaderRow = (props: { children: ReactNode | ReactNode[]; label: string }) => {
  return (
    <View row align="center" spacing="0.5rem" overflow="hidden">
      <View column align="flex-start">
        <Text fontSize="1.2em" fontWeight={500} width="3rem" color={colors.custom.lightGrey}>
          {props.label}
        </Text>
      </View>

      {props.children}
    </View>
  );
};
