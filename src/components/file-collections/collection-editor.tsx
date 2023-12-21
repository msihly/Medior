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
  FileCard,
  FileCollectionFile,
  Input,
  Modal,
  SortedFiles,
  Tag,
  TagInput,
  Text,
  View,
} from "components";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const FileCollectionEditor = observer(() => {
  const { css } = useClasses(null);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }));

  const rootStore = useStores();
  const { fileCollectionStore, tagStore } = useStores();

  const [draggedFileId, setDraggedFileId] = useState<string>(null);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState<string>(fileCollectionStore.activeCollection?.title);

  useEffect(() => {
    if (!fileCollectionStore.activeCollectionId) return;

    (async () => {
      setIsLoading(true);
      await fileCollectionStore.loadActiveCollection();
      setIsLoading(false);
    })();

    return () => {
      fileCollectionStore.setActiveCollectionId(null);
      fileCollectionStore.setActiveFiles([]);
      fileCollectionStore.clearSearch();
    };
  }, [fileCollectionStore.activeCollectionId]);

  useEffect(() => {
    (async () => {
      if (!fileCollectionStore.searchValue.length) return fileCollectionStore.setSearchResults([]);
      await fileCollectionStore.loadSearchResults({ rootStore });
    })();
  }, [fileCollectionStore.searchValue]);

  const closeModal = () => fileCollectionStore.setIsCollectionEditorOpen(false);

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

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleDragCancel = () => setDraggedFileId(null);

  const handleDragEnd = (event: DragEndEvent) => {
    fileCollectionStore.moveFileIndex(draggedFileId, event.over.id as string);
    fileCollectionStore.setHasUnsavedChanges(true);
    setDraggedFileId(null);
  };

  const handleDragStart = (event: DragStartEvent) => setDraggedFileId(event.active.id as string);

  const handlePageChange = (_, page: number) =>
    fileCollectionStore.loadSearchResults({ page, rootStore });

  const handleSave = async () => {
    try {
      if (!title) return toast.error("Title is required!");

      setIsSaving(true);

      const res = await fileCollectionStore.updateCollection({
        fileIdIndexes: fileCollectionStore.sortedActiveFiles
          .filter((f) => !f.isDeleted)
          .map((f, i) => ({ fileId: f.file.id, index: i })),
        id: fileCollectionStore.activeCollectionId,
        tagIds: fileCollectionStore.activeTagIds,
        title,
      });
      if (!res.success) return toast.error(res.error);

      toast.success("Collection saved!");
      fileCollectionStore.setHasUnsavedChanges(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTitleChange = (val: string) => {
    fileCollectionStore.setHasUnsavedChanges(true);
    setTitle(val);
  };

  const toggleAddingFiles = () => setIsAddingFiles((prev) => !prev);

  return (
    <Modal.Container onClose={closeModal} closeOnBackdrop={false} maxWidth="65rem" width="100%">
      <Modal.Header>
        <Button
          text={isAddingFiles ? "Hide Search" : "Add Files"}
          icon={isAddingFiles ? "VisibilityOff" : "Add"}
          onClick={toggleAddingFiles}
          disabled={isSaving}
          color={colors.blueGrey["700"]}
        />

        <Text align="center" flex={1}>
          {`${fileCollectionStore.activeCollectionId === null ? "Create" : "Edit"} Collection`}
        </Text>

        <Button
          text="Delete"
          icon="Delete"
          onClick={handleDelete}
          disabled={isSaving}
          color={colors.red["800"]}
        />
      </Modal.Header>

      <Modal.Content>
        <View className={css.body}>
          {isAddingFiles && (
            <View column className={css.leftColumn}>
              <Text align="center" className={css.inputTitle}>
                {"File Search"}
              </Text>
              <TagInput
                value={[...fileCollectionStore.searchValue]}
                onChange={(val) => fileCollectionStore.setSearchValue(val)}
                hasSearchMenu
                margins={{ bottom: "0.5rem" }}
              />

              <View column className={css.searchResults}>
                {fileCollectionStore.searchResults.map((f) => (
                  // TODO: Replace with custom component that can be dragged into collection without removing from results
                  <FileCard key={f.id} file={f} height="14rem" />
                ))}
              </View>

              <Pagination
                count={fileCollectionStore.searchPageCount}
                page={fileCollectionStore.searchPage}
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
              {fileCollectionStore.activeTagIds.map((id) => (
                <Tag key={id} id={id} />
              ))}
            </View>

            {fileCollectionStore.activeFiles.length > 0 ? (
              <View className={css.collection}>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragCancel={handleDragCancel}
                  onDragEnd={handleDragEnd}
                  onDragStart={handleDragStart}
                >
                  <SortableContext
                    items={fileCollectionStore.sortedActiveFiles}
                    strategy={gridSortingStrategy}
                  >
                    <SortedFiles />
                  </SortableContext>

                  <DragOverlay adjustScale>
                    {draggedFileId ? <FileCollectionFile fileId={draggedFileId} disabled /> : null}
                  </DragOverlay>
                </DndContext>
              </View>
            ) : (
              <CenteredText text={isLoading ? "Loading files..." : "No files found"} />
            )}
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={fileCollectionStore.hasUnsavedChanges ? "Cancel" : "Close"}
          icon="Close"
          onClick={closeModal}
          disabled={isSaving}
          color={fileCollectionStore.hasUnsavedChanges ? colors.red["800"] : colors.blueGrey["700"]}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!fileCollectionStore.hasUnsavedChanges || isSaving}
        />
      </Modal.Footer>

      {isConfirmDeleteOpen && <ConfirmDeleteModal setVisible={setIsConfirmDeleteOpen} />}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  body: {
    display: "flex",
    flexDirection: "row",
    minHeight: "30rem",
    maxHeight: "40rem",
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
  inputTitle: {
    marginTop: "0.3rem",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    fontSize: "0.8em",
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
  tags: {
    display: "flex",
    flexFlow: "row wrap",
    justifyContent: "center",
    margin: "0.5rem 0",
  },
  titleInput: {
    width: "100%",
  },
});
