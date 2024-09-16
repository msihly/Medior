import { ReactNode, useEffect, useState } from "react";
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
  Card,
  CardGrid,
  CenteredText,
  ConfirmModal,
  FileCollectionFile,
  FileFilterMenu,
  FileSearchFile,
  Input,
  ListItem,
  LoadingOverlay,
  MenuButton,
  Modal,
  MultiActionButton,
  Pagination,
  TagChip,
  Text,
  View,
} from "medior/components";
import { EditorFiles } from ".";
import { colors, makeClasses } from "medior/utils";
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
  const [title, setTitle] = useState<string>(stores.collection.editor.collection?.title);

  useEffect(() => {
    return () => {
      stores.collection.editor.loadCollection({ id: null });
      stores.collection.editor.search.reset();
    };
  }, [stores.collection.editor.collection?.id]);

  const confirmClose = () => {
    if (stores.collection.editor.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const confirmRemoveFiles = async () => {
    const res = await stores.collection.editor.removeFiles();
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
    stores.collection.editor.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleDelete = () => stores.collection.setIsConfirmDeleteOpen(true);

  const handleDeselectAll = () => {
    stores.collection.editor.toggleFilesSelected(
      stores.collection.editor.selectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all files");
  };

  const handleDragCancel = () => setDraggedFileId(null);

  const handleDragEnd = (event: DragEndEvent) => {
    stores.collection.editor.moveFileIndex(draggedFileId, event.over.id as string);
    setDraggedFileId(null);
  };

  const handleDragStart = (event: DragStartEvent) => setDraggedFileId(event.active.id as string);

  const handleEditTags = () => {
    stores.tag.setFileTagEditorBatchId(null);
    stores.tag.setFileTagEditorFileIds([...stores.collection.editor.selectedIds]);
    stores.tag.setIsFileTagEditorOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshSelectedFiles();

  const handlePageChange = (page: number) => stores.collection.editor.search.loadFiltered({ page });

  const handleRefreshMeta = () =>
    stores.collection.regenCollMeta([stores.collection.editor.collection.id]);

  const handleRemoveFiles = () => setIsConfirmRemoveFilesOpen(true);

  const handleSave = async () => {
    if (!title) return toast.error("Title is required!");
    await stores.collection.editor.saveCollection();
  };

  const handleSelectAll = () => {
    stores.collection.editor.toggleFilesSelected(
      stores.collection.editor.sortedFiles.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added all ${stores.collection.editor.selectedIds.length} files to selection`);
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
            colorOnHover={colors.custom.purple}
          />
        }
        rightNode={
          <MenuButton color={colors.custom.grey}>
            <ListItem text="Delete" icon="Delete" onClick={handleDelete} />
            <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
          </MenuButton>
        }
      >
        <Text align="center">
          {`${stores.collection.editor.collection === null ? "Create" : "Edit"} Collection`}
        </Text>
      </Modal.Header>

      <Modal.Content dividers={false}>
        <View row flex={1} height="100%" spacing="0.5rem">
          {isAddingFiles && (
            <Card
              column
              flex="none"
              height="100%"
              width="16rem"
              spacing="0.5rem"
              padding={{ all: 0 }}
            >
              <View column spacing="0.5rem" padding={{ all: "0.5rem" }}>
                <FileFilterMenu
                  store={stores.collection.editor.search}
                  color={colors.custom.black}
                />
              </View>

              <CardGrid
                cards={stores.collection.editor.search.results.map((f) => (
                  <FileSearchFile key={f.id} file={f} />
                ))}
                maxCards={1}
              >
                <Pagination
                  count={stores.collection.editor.search.pageCount}
                  page={stores.collection.editor.search.page}
                  onChange={handlePageChange}
                />
              </CardGrid>
            </Card>
          )}

          <View column flex={1} spacing="0.5rem">
            <View row spacing="0.5rem">
              <Card column flex={1} spacing="0.5rem">
                <HeaderRow label="Title">
                  <Input value={title} setValue={handleTitleChange} width="100%" />
                </HeaderRow>

                <HeaderRow label="Tags">
                  <View spacing="0.5rem" className={css.tags}>
                    {stores.collection.editor.sortedTags.map((tag) => (
                      <TagChip key={tag.id} tag={tag} hasEditor className={css.tag} />
                    ))}
                  </View>
                </HeaderRow>
              </Card>

              <Card column flex="none" height="100%">
                <View row>
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
                    name="Delete"
                    tooltip="Remove Files From Collection"
                    iconProps={{ color: colors.custom.red }}
                    onClick={handleRemoveFiles}
                    disabled={hasNoSelection}
                  />
                </View>

                <View row justify="flex-end">
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
              </Card>
            </View>

            <Card column flex={1}>
              {!stores.collection.editor.files.length ? (
                <CenteredText text="No files found" />
              ) : (
                <View className={css.collection}>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragCancel={handleDragCancel}
                    onDragEnd={handleDragEnd}
                    onDragStart={handleDragStart}
                  >
                    <SortableContext
                      items={stores.collection.editor.sortedFiles}
                      strategy={gridSortingStrategy}
                    >
                      <EditorFiles />
                    </SortableContext>

                    <DragOverlay adjustScale>
                      {draggedFileId ? <FileCollectionFile id={draggedFileId} disabled /> : null}
                    </DragOverlay>
                  </DndContext>
                </View>
              )}
            </Card>
          </View>
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
          color={colors.custom.blue}
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
    <View row align="center" spacing="0.5rem">
      <View column align="flex-start">
        <Text fontSize="1.2em" fontWeight={500} width="3rem" color={colors.custom.lightGrey}>
          {props.label}
        </Text>
      </View>

      {props.children}
    </View>
  );
};

const useClasses = makeClasses({
  collection: {
    display: "flex",
    flexFlow: "row wrap",
    flex: 1,
    width: "100%",
    overflow: "hidden",
  },
  tag: {
    margin: "0.1rem 0",
  },
  tags: {
    display: "flex",
    flexFlow: "row wrap",
    margin: "0.5rem 0",
    maxHeight: "5rem",
    overflowY: "auto",
  },
});
