import { ReactNode, useEffect, useState } from "react";
import { observer, SORT_OPTIONS, useStores } from "medior/store";
import {
  Button,
  Card,
  CardGrid,
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
  SortMenu,
  SortMenuProps,
  TagRow,
  Text,
  View,
} from "medior/components";
import { colors } from "medior/utils";
import { toast } from "react-toastify";

export const FileCollectionEditor = observer(() => {
  const stores = useStores();

  const hasNoSelection = stores.collection.editor.search.selectedIds.length === 0;
  const isCreate = stores.collection.editor.collection === null;

  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isConfirmRemoveFilesOpen, setIsConfirmRemoveFilesOpen] = useState(false);
  const [maxDelta, setMaxDelta] = useState<number>(null);

  useEffect(() => {
    return () => {
      stores.collection.editor.search.reset();
      stores.collection.editor.fileSearch.reset();
    };
  }, []);

  const confirmClose = () => {
    if (stores.collection.editor.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const confirmRemoveFiles = async () => {
    const res = await stores.collection.editor.removeFiles(
      stores.collection.editor.search.selectedIds
    );
    return res.success;
  };

  const handleArchiveFiles = () =>
    stores.file.confirmDeleteFiles(stores.collection.editor.search.selectedIds);

  const handleClose = () => {
    stores.collection.editor.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDelete = () => stores.collection.setIsConfirmDeleteOpen(true);

  const handleDeselectAll = () => {
    stores.collection.editor.search.toggleSelected(
      stores.collection.editor.search.selectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all files");
  };

  const handleEditTags = () => {
    stores.tag.setFileTagEditorBatchId(null);
    stores.tag.setFileTagEditorFileIds([...stores.collection.editor.search.selectedIds]);
    stores.tag.setIsFileTagEditorOpen(true);
  };

  const handleFileInfoRefresh = () =>
    stores.file.refreshFiles({ ids: stores.collection.editor.search.selectedIds });

  const handleMoveFilesDown = () =>
    stores.collection.editor.moveFileIndexes({ down: true, maxDelta });

  const handleMoveFilesUp = () =>
    stores.collection.editor.moveFileIndexes({ down: false, maxDelta });

  const handlePageChange = (page: number) => {
    stores.collection.editor.search.setPage(page);
    stores.collection.editor.search.loadFiltered();
  };

  const handleRefreshMeta = () =>
    stores.collection.regenCollMeta([stores.collection.editor.collection.id]);

  const handleRemoveFiles = () => setIsConfirmRemoveFilesOpen(true);

  const handleSave = async () => {
    if (!stores.collection.editor.title) return toast.error("Title is required!");
    await stores.collection.editor.saveCollection();
  };

  const handleSelectAll = () => {
    stores.collection.editor.search.toggleSelected(
      stores.collection.editor.search.results.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(
      `Added all ${stores.collection.editor.search.selectedIds.length} files to selection`
    );
  };

  const handleTitleChange = (val: string) => {
    stores.collection.editor.setHasUnsavedChanges(true);
    stores.collection.editor.setTitle(val);
  };

  const setSortValue = (value: SortMenuProps["value"]) =>
    stores.collection.editor.setSortValue(value);

  const toggleAddingFiles = () => setIsAddingFiles((prev) => !prev);

  return (
    <Modal.Container
      isLoading={stores.collection.editor.isLoading || stores.collection.editor.search.isLoading}
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
            disabled={stores.collection.editor.isLoading}
            color={colors.foregroundCard}
            colorOnHover={colors.custom.purple}
          />
        }
        rightNode={
          isCreate ? null : (
            <MenuButton color={colors.custom.grey}>
              <ListItem text="Delete" icon="Delete" onClick={handleDelete} />
              <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
            </MenuButton>
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
                <Input
                  value={stores.collection.editor.title}
                  setValue={handleTitleChange}
                  width="100%"
                />
              </HeaderRow>

              <HeaderRow label="Tags">
                <TagRow tags={stores.collection.editor.tags} />
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
                value={stores.collection.editor.search.sortValue}
                setValue={setSortValue}
                rows={SORT_OPTIONS.FileCollectionFile}
                width="100%"
              />
            </Card>
          </View>

          <Card column flex={1}>
            <CardGrid
              cards={stores.collection.editor.search.results.map((f) => (
                <FileCollectionFile key={f.id} file={f} />
              ))}
            />

            <Pagination
              count={stores.collection.editor.search.pageCount}
              page={stores.collection.editor.search.page}
              onChange={handlePageChange}
            />
          </Card>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={stores.collection.editor.hasUnsavedChanges ? "Cancel" : "Close"}
          icon="Close"
          onClick={confirmClose}
          disabled={stores.collection.editor.isLoading}
          colorOnHover={stores.collection.editor.hasUnsavedChanges ? colors.custom.red : undefined}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={
            !stores.collection.editor.hasUnsavedChanges || stores.collection.editor.isLoading
          }
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
