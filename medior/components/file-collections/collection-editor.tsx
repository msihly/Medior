import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Button,
  Card,
  CardGrid,
  Chip,
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
  SearchLoadingOverlay,
  SortMenu,
  TagRow,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { useHotkeys } from "medior/views";

export interface FileCollectionEditorProps {
  embedded?: boolean;
  isSaving?: boolean;
  maxCards?: number;
  mode?: "edit" | "merge";
  onCancelLoad?: () => void;
  onClose?: () => void;
  onSave?: () => Promise<void>;
}

export const FileCollectionEditor = Comp(
  ({
    embedded = false,
    isSaving = false,
    maxCards = 6,
    mode = "edit",
    onCancelLoad,
    onClose,
    onSave,
  }: FileCollectionEditorProps) => {
    const stores = useStores();
    const store = stores.collection.editor;

    const filesRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
      scrollToTop();
      if (store.search.pageCount > 0 && store.search.page > store.search.pageCount)
        handlePageChange(store.search.pageCount);
    }, [store.search.page, store.search.pageCount]);

    const confirmClose = () => {
      if (mode === "merge") return handleClose();
      if (store.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
      else handleClose();
    };

    const confirmRemoveFiles = async () => {
      const res = await store.removeFiles(store.search.selectedIds);
      return res.success;
    };

    const handleArchiveFiles = () => stores.file.confirmDeleteFiles(store.search.selectedIds);

    const handleClose = async () => {
      if (onClose) onClose();
      else store.setIsOpen(false);
      stores.file.search.reloadIfQueued();
      return true;
    };

    const handleDelete = () => {
      stores.collection.setIdsForConfirmDelete([store.collection.id]);
      stores.collection.setIsConfirmDeleteOpen(true);
    };

    const handleDeselectAll = () => {
      store.search.toggleSelected(
        store.search.selectedIds.map((id) => ({ id, isSelected: false })),
      );
      toast.info("Deselected all files");
    };

    const handleEditTags = () => {
      stores.file.tagsEditor.setBatchId(null);
      stores.file.tagsEditor.setFileIds([...store.search.selectedIds]);
      stores.file.tagsEditor.setIsOpen(true);
    };

    const handleEditorKeyPress = (event: KeyboardEvent) => {
      if (mode === "edit" && event.key === "Delete" && !hasNoSelection) {
        event.preventDefault();
        handleRemoveFiles();
        return;
      }
      handleKeyPress(event);
    };

    const handleFileInfoRefresh = () => stores.file.refreshFiles({ ids: store.search.selectedIds });

    const handleFullPageLoad = () => store.search.loadFiltered({ withFullCount: true });

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
      if (onSave) await onSave();
      else await store.saveCollection();
    };

    const handleSelectAll = () => {
      store.search.toggleSelected(store.search.results.map(({ id }) => ({ id, isSelected: true })));
      toast.info(`Added all ${store.search.selectedIds.length} files to selection`);
    };

    const handleSelectAllInQuery = async () => {
      const res = await store.search.selectAllInQuery();
      if (!res.success) throw new Error(res.error);
      toast.info(`Added ${res.data} files to selection`);
    };

    const handleSplitFiles = async () => {
      const selectedIds = [...store.search.selectedIds];
      const createRes = await stores.collection.createCollection({
        fileIdIndexes: store.fileIndexes
          .filter(({ fileId }) => selectedIds.includes(fileId))
          .map(({ fileId }, index) => ({ fileId, index })),
        title: "Untitled Collection",
      });
      if (!createRes.success) return toast.error(createRes.error);

      const removeRes = await store.removeFiles(selectedIds);
      if (!removeRes.success) {
        await stores.collection.deleteCollections([createRes.data.id]);
        return toast.error(removeRes.error);
      }

      await store.loadCollection(createRes.data.id);
    };

    const handleTitleChange = (val: string) => {
      store.setHasUnsavedChanges(true);
      store.setTitle(val);
    };

    const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "instant" });

    const toggleAddingFiles = () => setIsAddingFiles((prev) => !prev);

    const content = (
      <>
        <Modal.Header
          leftNode={
            mode === "edit" ? (
              <Button
                text={isAddingFiles ? "Hide Search" : "Add Files"}
                icon={isAddingFiles ? "VisibilityOff" : "Add"}
                onClick={toggleAddingFiles}
                disabled={store.isLoading}
                color={colors.foregroundCard}
                colorOnHover={colors.custom.purple}
              />
            ) : null
          }
          rightNode={
            isCreate ? null : (
              <View row align="center" spacing="0.5rem">
                <RatingButton rating={store.collection?.rating} setRating={handleRating} />

                <Chip label={`${store.fileIndexes.length} files`} />

                {mode === "edit" && (
                  <MenuButton color={colors.custom.grey}>
                    <ListItem
                      text="Delete"
                      icon="Delete"
                      onClick={handleDelete}
                      color={colors.custom.red}
                      iconProps={{ color: colors.custom.red }}
                    />

                    <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
                  </MenuButton>
                )}
              </View>
            )
          }
        >
          <Text preset="title">
            {mode === "merge" ? "Merge Collections" : `${isCreate ? "Create" : "Edit"} Collection`}
          </Text>
        </Modal.Header>

        <Modal.Content dividers={false} row flex={1} height="100%" spacing="0.5rem">
          {mode === "edit" && isAddingFiles && <FileSearchColumn />}

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
                  {mode === "edit" && (
                    <>
                      <MultiActionButton
                        name="Delete"
                        tooltip="Remove Files From Collection"
                        iconProps={{ color: colors.custom.red }}
                        onClick={handleRemoveFiles}
                        disabled={hasNoSelection}
                      />

                      <MultiActionButton
                        name="ContentCut"
                        tooltip="Split Files Into New Collection"
                        onClick={handleSplitFiles}
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
                    </>
                  )}

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

                  <MultiActionButton
                    name="LibraryAddCheck"
                    tooltip="Select All Files in Query"
                    onClick={handleSelectAllInQuery}
                  />
                </View>

                <SortMenu
                  value={store.search.sortValue}
                  setValue={store.setSortValue}
                  rows={SORT_OPTIONS.FileCollectionFile}
                  width="100%"
                  height="auto"
                />
              </Card>
            </View>

            <Card column flex={1} overflow="auto" position="relative">
              <SearchLoadingOverlay
                isLoading={
                  mode === "merge"
                    ? !isSaving && (store.isLoading || store.search.isLoading)
                    : undefined
                }
                onCancel={mode === "merge" ? onCancelLoad : undefined}
                store={store.search}
              />

              <CardGrid
                ref={filesRef}
                maxCards={maxCards}
                cards={store.search.results.map((f) => (
                  <FileCollectionFile key={f.id} file={f} store={store.search} />
                ))}
                cardsProps={{ onKeyDown: handleEditorKeyPress, tabIndex: 1 }}
              />

              <Pagination
                count={store.search.pageCount}
                page={store.search.page}
                isLoading={store.search.isPageCountLoading && !store.search.isLoading}
                onChange={handlePageChange}
                onFullLoad={handleFullPageLoad}
              />
            </Card>
          </View>
        </Modal.Content>

        {!embedded && (
          <Modal.Footer>
            <Button
              text={mode === "merge" || store.hasUnsavedChanges ? "Cancel" : "Close"}
              icon="Close"
              onClick={confirmClose}
              disabled={store.isLoading}
              colorOnHover={
                mode === "merge" || store.hasUnsavedChanges ? colors.custom.red : undefined
              }
            />

            <Button
              text={mode === "merge" ? "Merge" : "Save"}
              icon={mode === "merge" ? "Merge" : "Save"}
              onClick={handleSave}
              disabled={(mode === "edit" && !store.hasUnsavedChanges) || store.isLoading}
              color={colors.custom.purple}
            />
          </Modal.Footer>
        )}

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
      </>
    );

    return embedded ? (
      <View column flex={1} overflow="hidden">
        {content}
      </View>
    ) : (
      <Modal.Container
        isLoading={mode === "edit" ? store.isLoading : isSaving}
        onClose={confirmClose}
        height="100%"
        width="100%"
      >
        {content}
      </Modal.Container>
    );
  },
);

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
