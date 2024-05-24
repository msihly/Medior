import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@alissavrk/dnd-kit-core";
import { SortableContext, SortingStrategy, arrayMove } from "@alissavrk/dnd-kit-sortable";
import { Pagination } from "@mui/material";
import {
  Button,
  CenteredText,
  ConfirmModal,
  FileCollectionFile,
  FileSearchFile,
  Input,
  ListItem,
  LoadingOverlay,
  MenuButton,
  Modal,
  MultiActionButton,
  SortMenu,
  SortMenuProps,
  Tag,
  TagInput,
  Text,
  View,
} from "components";
import { EditorFiles } from ".";
import { CONSTANTS, colors, makeClasses, useDeepEffect } from "utils";
import { toast } from "react-toastify";

export const FileCollectionEditor = observer(() => {
  const { css } = useClasses(null);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }));

  const stores = useStores();

  const hasNoSelection = stores.collection.editorSelectedIds.length === 0;

  const [draggedFileId, setDraggedFileId] = useState<string>(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isConfirmRemoveFilesOpen, setIsConfirmRemoveFilesOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState<string>(stores.collection.activeCollection?.title);

  useEffect(() => {
    if (!stores.collection.editorId) return;

    (async () => {
      setIsLoading(true);

      await stores.collection.loadActiveCollection();
      if (stores.collection.editorWithSelectedFiles)
        stores.collection.addFilesToActiveCollection(stores.collection.managerFiles);

      setIsLoading(false);
    })();

    return () => {
      stores.collection.setEditorId(null);
      stores.collection.setEditorFiles([]);
      stores.collection.setEditorWithSelectedFiles(false);
      stores.collection.clearSearch();
    };
  }, [stores.collection.editorId]);

  useDeepEffect(() => {
    (async () => {
      if (!stores.collection.editorSearchValue.length)
        return stores.collection.setEditorSearchResults([]);
      await stores.collection.loadSearchResults();
    })();
  }, [stores.collection.editorSearchValue, stores.collection.editorSearchSort]);

  const confirmClose = () => {
    if (stores.collection.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const confirmRemoveFiles = async () => {
    const res = await stores.collection.updateCollection({
      fileIdIndexes: stores.collection.sortedEditorFiles
        .filter((f) => stores.collection.editorSelectedIds.includes(f.file.id))
        .map((f, i) => ({ fileId: f.file.id, index: i })),
      id: stores.collection.editorId,
    });

    if (!res.success) toast.error(res.error);
    else toast.success("Files removed from collection");
    return res.success;
  };

  const gridSortingStrategy: SortingStrategy = ({
    activeIndex,
    activeNodeRect: fallbackActiveRect,
    index,
    overIndex,
    rects,
  }) => {
    const activeNodeRect = rects[activeIndex] ?? fallbackActiveRect;
    if (!activeNodeRect) return null;

    const oldRect = rects[index];
    const newRects = arrayMove(rects, overIndex, activeIndex);
    const newRect = newRects[index];
    return !newRect || !oldRect
      ? null
      : {
          scaleX: oldRect.width / newRect.width,
          scaleY: oldRect.height / newRect.height,
          x: newRect.left - oldRect.left,
          y: newRect.top - oldRect.top,
        };
  };

  const handleClose = () => {
    stores.collection.setIsEditorOpen(false);
    stores.home.reloadIfQueued();
  };

  const handleConfirmDelete = async () => {
    const res = await stores.collection.deleteCollection(stores.collection.editorId);

    if (!res.success) toast.error("Failed to delete collection");
    else {
      stores.collection.setEditorId(null);
      stores.collection.setIsEditorOpen(false);
      toast.success("Collection deleted");
    }

    return res.success;
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleDeselectAll = () => {
    stores.collection.toggleFilesSelected(
      stores.collection.editorSelectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all files");
  };

  const handleDragCancel = () => setDraggedFileId(null);

  const handleDragEnd = (event: DragEndEvent) => {
    stores.collection.moveFileIndex(draggedFileId, event.over.id as string);
    setDraggedFileId(null);
  };

  const handleDragStart = (event: DragStartEvent) => setDraggedFileId(event.active.id as string);

  const handleEditTags = () => {
    stores.tag.setTaggerBatchId(null);
    stores.tag.setTaggerFileIds([...stores.collection.editorSelectedIds]);
    stores.tag.setIsTaggerOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshSelectedFiles();

  const handlePageChange = (_, page: number) => stores.collection.loadSearchResults({ page });

  const handleRefreshMeta = async () => {
    setIsLoading(true);
    const res = await stores.collection.regenCollMeta([stores.collection.editorId]);
    setIsLoading(false);

    res.success ? toast.success("Metadata refreshed!") : toast.error(res.error);
  };

  const handleRemoveFiles = () => setIsConfirmRemoveFilesOpen(true);

  const handleSave = async () => {
    try {
      if (!title) return toast.error("Title is required!");

      setIsLoading(true);

      const res = await stores.collection.updateCollection({
        fileIdIndexes: stores.collection.sortedEditorFiles.map((f, i) => ({
          fileId: f.file.id,
          index: i,
        })),
        id: stores.collection.editorId,
        title,
      });
      if (!res.success) return toast.error(res.error);

      toast.success("Collection saved!");
      stores.collection.setHasUnsavedChanges(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSortChange = (val: SortMenuProps["value"]) =>
    stores.collection.setEditorSearchSort(val);

  const handleSelectAll = () => {
    stores.collection.toggleFilesSelected(
      stores.collection.sortedEditorFiles.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added ${stores.file.files.length} files to selection`);
  };

  const handleTitleChange = (val: string) => {
    stores.collection.setHasUnsavedChanges(true);
    setTitle(val);
  };

  const toggleAddingFiles = () => setIsAddingFiles((prev) => !prev);

  return (
    <Modal.Container onClose={confirmClose} maxWidth="100%" width="90%" height="90%">
      <LoadingOverlay isLoading={isLoading} />

      <Modal.Header
        leftNode={
          <Button
            text={isAddingFiles ? "Hide Search" : "Add Files"}
            icon={isAddingFiles ? "VisibilityOff" : "Add"}
            onClick={toggleAddingFiles}
            disabled={isLoading}
            color={colors.blueGrey["700"]}
          />
        }
        rightNode={
          <MenuButton color={colors.button.grey}>
            <ListItem text="Delete" icon="Delete" onClick={handleDelete} />
            <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
          </MenuButton>
        }
      >
        <Text align="center">
          {`${stores.collection.editorId === null ? "Create" : "Edit"} Collection`}
        </Text>
      </Modal.Header>

      <Modal.Content>
        <View className={css.body}>
          {isAddingFiles && (
            <View column className={css.leftColumn}>
              <Text preset="label-glow">{"File Search"}</Text>
              <TagInput
                value={[...stores.collection.editorSearchValue]}
                onChange={(val) => stores.collection.setEditorSearchValue(val)}
                hasSearchMenu
                margins={{ bottom: "0.5rem" }}
              />

              <SortMenu
                rows={CONSTANTS.SORT_MENU_OPTS.FILE_SEARCH}
                value={stores.collection.editorSearchSort}
                setValue={handleSearchSortChange}
                color={colors.button.darkGrey}
                width="100%"
              />

              <View column className={css.searchResults}>
                {stores.collection.editorSearchResults.map((f) => (
                  <FileSearchFile key={f.id} file={f} height="14rem" />
                ))}
              </View>

              <Pagination
                count={stores.collection.editorSearchPageCount}
                page={stores.collection.editorSearchPage}
                onChange={handlePageChange}
                showFirstButton
                showLastButton
                siblingCount={2}
                boundaryCount={2}
                size="small"
                className={css.pagination}
              />
            </View>
          )}

          <View column flex={1}>
            <View row>
              <View row justify="center" align="center" flex={1}>
                <Input
                  label="Title"
                  value={title}
                  setValue={handleTitleChange}
                  textAlign="center"
                  className={css.titleInput}
                />
              </View>

              <View row align="center">
                <MultiActionButton
                  name="Delete"
                  tooltip="Remove Files From Collection"
                  iconProps={{ color: colors.button.red }}
                  onClick={handleRemoveFiles}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Refresh"
                  tooltip="Refresh File Info"
                  onClick={handleFileInfoRefresh}
                  disabled={hasNoSelection}
                />

                <MultiActionButton
                  name="Label"
                  tooltip="Edit Tags"
                  onClick={handleEditTags}
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
            </View>

            <View className={css.tags}>
              {stores.collection.sortedActiveTags.map((tag) => (
                <Tag key={tag.id} tag={tag} hasEditor className={css.tag} />
              ))}
            </View>

            {stores.collection.editorFiles.length > 0 ? (
              <View className={css.collection}>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragCancel={handleDragCancel}
                  onDragEnd={handleDragEnd}
                  onDragStart={handleDragStart}
                >
                  <SortableContext
                    items={stores.collection.sortedEditorFiles}
                    strategy={gridSortingStrategy}
                  >
                    <EditorFiles />
                  </SortableContext>

                  <DragOverlay adjustScale>
                    {draggedFileId ? <FileCollectionFile fileId={draggedFileId} disabled /> : null}
                  </DragOverlay>
                </DndContext>
              </View>
            ) : (
              <CenteredText text="No files found" />
            )}
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={stores.collection.hasUnsavedChanges ? "Cancel" : "Close"}
          icon="Close"
          onClick={confirmClose}
          disabled={isLoading}
          color={stores.collection.hasUnsavedChanges ? colors.red["800"] : colors.blueGrey["700"]}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!stores.collection.hasUnsavedChanges || isLoading}
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

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Collection"
          subText={stores.collection.activeCollection?.title}
          setVisible={setIsConfirmDeleteOpen}
          onConfirm={handleConfirmDelete}
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

const useClasses = makeClasses({
  body: {
    display: "flex",
    flexDirection: "row",
    height: "100%",
    width: "100%",
  },
  collection: {
    display: "flex",
    flex: 1,
    flexFlow: "row wrap",
    borderRadius: "0.3rem",
    minHeight: "30rem",
    width: "100%",
    backgroundColor: colors.grey["800"],
    overflow: "hidden",
  },
  leftColumn: {
    borderRadius: 4,
    marginRight: "0.5rem",
    padding: "0.5rem",
    width: "15rem",
    backgroundColor: colors.grey["800"],
    overflow: "hidden",
  },
  pagination: {
    borderRight: `3px solid ${colors.blue["800"]}`,
    borderLeft: `3px solid ${colors.blue["800"]}`,
    borderRadius: "0.5rem",
    marginTop: "0.5rem",
    padding: "0.3rem",
    background: colors.grey["900"],
    "& > ul": {
      justifyContent: "center",
    },
  },
  searchResults: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
  },
  tag: {
    marginBottom: "0.2rem",
  },
  tags: {
    display: "flex",
    flexFlow: "row wrap",
    justifyContent: "center",
    margin: "0.5rem 0",
    maxHeight: "5rem",
    overflowY: "auto",
  },
  titleInput: {
    width: "100%",
  },
});
