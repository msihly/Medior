import { useEffect, useState } from "react";
import { observer, useStores } from "medior/store";
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
  Pagination,
  SortMenu,
  SortMenuProps,
  Tag,
  TagInput,
  Text,
  View,
} from "medior/components";
import { EditorFiles } from ".";
import { CONSTANTS, colors, makeClasses, useDeepEffect } from "medior/utils";
import { toast } from "react-toastify";

export const FileCollectionEditor = observer(() => {
  const { css } = useClasses(null);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }));

  const stores = useStores();

  const hasNoSelection = stores.collection.editor.selectedIds.length === 0;

  const [draggedFileId, setDraggedFileId] = useState<string>(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isConfirmRemoveFilesOpen, setIsConfirmRemoveFilesOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [title, setTitle] = useState<string>(stores.collection.activeCollection?.title);

  useEffect(() => {
    if (!stores.collection.editor.id) return;

    (async () => {
      stores.collection.editor.setIsLoading(true);

      await stores.collection.loadActiveCollection();
      if (stores.collection.editor.withSelectedFiles)
        stores.collection.addFilesToActiveCollection(stores.collection.manager.files);

      stores.collection.editor.setIsLoading(false);
    })();

    return () => {
      stores.collection.editor.setId(null);
      stores.collection.editor.setFiles([]);
      stores.collection.editor.setWithSelectedFiles(false);
      stores.collection.clearSearch();
    };
  }, [stores.collection.editor.id]);

  useDeepEffect(() => {
    (async () => {
      if (!stores.collection.editor.search.value.length)
        return stores.collection.editor.search.setResults([]);
      await stores.collection.loadSearchResults();
    })();
  }, [stores.collection.editor.search.value, stores.collection.editor.search.sort]);

  const confirmClose = () => {
    if (stores.collection.editor.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const confirmRemoveFiles = async () => {
    const res = await stores.collection.updateCollection({
      fileIdIndexes: stores.collection.sortedEditorFiles
        .filter((f) => stores.collection.editor.selectedIds.includes(f.file.id))
        .map((f, i) => ({ fileId: f.file.id, index: i })),
      id: stores.collection.editor.id,
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
    stores.file.search.reloadIfQueued();
  };

  const handleDelete = () => stores.collection.setIsConfirmDeleteOpen(true);

  const handleDeselectAll = () => {
    stores.collection.toggleFilesSelected(
      stores.collection.editor.selectedIds.map((id) => ({ id, isSelected: false }))
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
    stores.tag.setFileTagEditorBatchId(null);
    stores.tag.setFileTagEditorFileIds([...stores.collection.editor.selectedIds]);
    stores.tag.setIsFileTagEditorOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshSelectedFiles();

  const handlePageChange = (page: number) => stores.collection.loadSearchResults({ page });

  const handleRefreshMeta = () => stores.collection.regenCollMeta([stores.collection.editor.id]);

  const handleRemoveFiles = () => setIsConfirmRemoveFilesOpen(true);

  const handleSave = async () => {
    try {
      if (!title) return toast.error("Title is required!");

      stores.collection.editor.setIsLoading(true);

      const res = await stores.collection.updateCollection({
        fileIdIndexes: stores.collection.sortedEditorFiles.map((f, i) => ({
          fileId: f.file.id,
          index: i,
        })),
        id: stores.collection.editor.id,
        title,
      });
      if (!res.success) return toast.error(res.error);

      toast.success("Collection saved!");
      stores.collection.editor.setHasUnsavedChanges(false);
    } catch (err) {
      console.error(err);
    } finally {
      stores.collection.editor.setIsLoading(false);
    }
  };

  const handleSearchSortChange = (val: SortMenuProps["value"]) =>
    stores.collection.editor.search.setSort(val);

  const handleSelectAll = () => {
    stores.collection.toggleFilesSelected(
      stores.collection.sortedEditorFiles.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added ${stores.file.files.length} files to selection`);
  };

  const handleTitleChange = (val: string) => {
    stores.collection.editor.setHasUnsavedChanges(true);
    setTitle(val);
  };

  const toggleAddingFiles = () => setIsAddingFiles((prev) => !prev);

  return (
    <Modal.Container onClose={confirmClose} maxWidth="100%" width="90%" height="90%">
      <LoadingOverlay isLoading={stores.collection.editor.isLoading} />

      <Modal.Header
        leftNode={
          <Button
            text={isAddingFiles ? "Hide Search" : "Add Files"}
            icon={isAddingFiles ? "VisibilityOff" : "Add"}
            onClick={toggleAddingFiles}
            disabled={stores.collection.editor.isLoading}
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
          {`${stores.collection.editor.id === null ? "Create" : "Edit"} Collection`}
        </Text>
      </Modal.Header>

      <Modal.Content>
        <View className={css.body}>
          {isAddingFiles && (
            <View column spacing="0.5rem" className={css.leftColumn}>
              <TagInput
                label="File Search"
                value={[...stores.collection.editor.search.value]}
                onChange={(val) => stores.collection.editor.search.setValue(val)}
                detachLabel
                hasSearchMenu
              />

              <SortMenu
                rows={CONSTANTS.SORT_MENU_OPTS.FILE_SEARCH}
                value={stores.collection.editor.search.sort}
                setValue={handleSearchSortChange}
                color={colors.button.darkGrey}
                width="100%"
              />

              <View column className={css.searchResults}>
                {stores.collection.editor.search.results.map((f) => (
                  <FileSearchFile key={f.id} file={f} height="14rem" />
                ))}
              </View>

              <Pagination
                count={stores.collection.editor.search.pageCount}
                page={stores.collection.editor.search.page}
                onChange={handlePageChange}
                size="small"
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

            {stores.collection.editor.files.length > 0 ? (
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
          text={stores.collection.editor.hasUnsavedChanges ? "Cancel" : "Close"}
          icon="Close"
          onClick={confirmClose}
          disabled={stores.collection.editor.isLoading}
          color={
            stores.collection.editor.hasUnsavedChanges ? colors.red["800"] : colors.blueGrey["700"]
          }
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={
            !stores.collection.editor.hasUnsavedChanges || stores.collection.editor.isLoading
          }
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
