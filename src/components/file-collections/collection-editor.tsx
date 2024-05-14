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

  const { fileCollectionStore } = useStores();

  const [draggedFileId, setDraggedFileId] = useState<string>(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState<string>(fileCollectionStore.activeCollection?.title);

  useEffect(() => {
    if (!fileCollectionStore.editorId) return;

    (async () => {
      setIsLoading(true);
      await fileCollectionStore.loadActiveCollection();
      setIsLoading(false);
    })();

    return () => {
      fileCollectionStore.setEditorId(null);
      fileCollectionStore.setEditorFiles([]);
      fileCollectionStore.clearSearch();
    };
  }, [fileCollectionStore.editorId]);

  useDeepEffect(() => {
    (async () => {
      if (!fileCollectionStore.editorSearchValue.length)
        return fileCollectionStore.setEditorSearchResults([]);
      await fileCollectionStore.loadSearchResults();
    })();
  }, [fileCollectionStore.editorSearchValue, fileCollectionStore.editorSearchSort]);

  const confirmClose = () => {
    if (fileCollectionStore.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
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

  const handleClose = () => fileCollectionStore.setIsEditorOpen(false);

  const handleConfirmDelete = async () => {
    const res = await fileCollectionStore.deleteCollection(fileCollectionStore.editorId);

    if (!res.success) toast.error("Failed to delete collection");
    else {
      fileCollectionStore.setEditorId(null);
      fileCollectionStore.setIsEditorOpen(false);
      toast.success("Collection deleted");
    }

    return res.success;
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleDragCancel = () => setDraggedFileId(null);

  const handleDragEnd = (event: DragEndEvent) => {
    fileCollectionStore.moveFileIndex(draggedFileId, event.over.id as string);
    setDraggedFileId(null);
  };

  const handleDragStart = (event: DragStartEvent) => setDraggedFileId(event.active.id as string);

  const handlePageChange = (_, page: number) => fileCollectionStore.loadSearchResults({ page });

  const handleRefreshMeta = async () => {
    setIsLoading(true);
    const res = await fileCollectionStore.regenCollMeta([fileCollectionStore.editorId]);
    setIsLoading(false);

    res.success ? toast.success("Metadata refreshed!") : toast.error(res.error);
  };

  const handleSave = async () => {
    try {
      if (!title) return toast.error("Title is required!");

      setIsLoading(true);

      const res = await fileCollectionStore.updateCollection({
        fileIdIndexes: fileCollectionStore.sortedEditorFiles
          .filter((f) => !f.isDeleted)
          .map((f, i) => ({ fileId: f.file.id, index: i })),
        id: fileCollectionStore.editorId,
        tagIds: fileCollectionStore.activeTagIds,
        title,
      });
      if (!res.success) return toast.error(res.error);

      toast.success("Collection saved!");
      fileCollectionStore.setHasUnsavedChanges(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSortChange = (val: SortMenuProps["value"]) =>
    fileCollectionStore.setEditorSearchSort(val);

  const handleTitleChange = (val: string) => {
    fileCollectionStore.setHasUnsavedChanges(true);
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
          {`${fileCollectionStore.editorId === null ? "Create" : "Edit"} Collection`}
        </Text>
      </Modal.Header>

      <Modal.Content>
        <View className={css.body}>
          {isAddingFiles && (
            <View column className={css.leftColumn}>
              <Text preset="label-glow">{"File Search"}</Text>
              <TagInput
                value={[...fileCollectionStore.editorSearchValue]}
                onChange={(val) => fileCollectionStore.setEditorSearchValue(val)}
                hasSearchMenu
                margins={{ bottom: "0.5rem" }}
              />

              <SortMenu
                rows={CONSTANTS.SORT_MENU_OPTS.FILE_SEARCH}
                value={fileCollectionStore.editorSearchSort}
                setValue={handleSearchSortChange}
                color={colors.button.darkGrey}
                width="100%"
              />

              <View column className={css.searchResults}>
                {fileCollectionStore.editorSearchResults.map((f) => (
                  <FileSearchFile key={f.id} file={f} height="14rem" />
                ))}
              </View>

              <Pagination
                count={fileCollectionStore.editorSearchPageCount}
                page={fileCollectionStore.editorSearchPage}
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
            <View row justify="center" align="center">
              <Input
                label="Title"
                value={title}
                setValue={handleTitleChange}
                textAlign="center"
                className={css.titleInput}
              />
            </View>

            <View className={css.tags}>
              {fileCollectionStore.sortedActiveTags.map((tag) => (
                <Tag key={tag.id} tag={tag} hasEditor className={css.tag} />
              ))}
            </View>

            {fileCollectionStore.editorFiles.length > 0 ? (
              <View className={css.collection}>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragCancel={handleDragCancel}
                  onDragEnd={handleDragEnd}
                  onDragStart={handleDragStart}
                >
                  <SortableContext
                    items={fileCollectionStore.sortedEditorFiles}
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
          text={fileCollectionStore.hasUnsavedChanges ? "Cancel" : "Close"}
          icon="Close"
          onClick={confirmClose}
          disabled={isLoading}
          color={fileCollectionStore.hasUnsavedChanges ? colors.red["800"] : colors.blueGrey["700"]}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!fileCollectionStore.hasUnsavedChanges || isLoading}
        />
      </Modal.Footer>

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Collection"
          subText={fileCollectionStore.activeCollection?.title}
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
