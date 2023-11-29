import { getCurrentWebContents } from "@electron/remote";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { Icon, Text, View } from "components";
import { ContextMenu, FileBase, openFile } from ".";
import { colors, dayjs, uniqueArrayFilter } from "utils";
import { CSSObject } from "tss-react";

interface FileCardProps {
  disabled?: boolean;
  file?: File;
  height?: CSSObject["height"];
  id?: string;
  width?: CSSObject["width"];
}

export const FileCard = observer(({ disabled, file, height, id, width }: FileCardProps) => {
  const { fileCollectionStore, fileStore, homeStore, tagStore } = useStores();
  if (!file) file = fileStore.getById(id);
  const collections = fileCollectionStore.listByFileId(id);

  const handleClick = (event: React.MouseEvent) => {
    if (disabled) return;
    if (event.shiftKey) {
      const clickedIndex = fileStore.filteredFileIds.indexOf(file.id);
      const firstIndex = fileStore.filteredFileIds.indexOf(fileStore.selectedIds[0]);

      const isFirstAfterClicked = firstIndex >= clickedIndex;
      const startIndex = isFirstAfterClicked ? clickedIndex : firstIndex;
      const endIndex = isFirstAfterClicked ? firstIndex : clickedIndex;

      const selectedIds =
        startIndex === endIndex
          ? []
          : uniqueArrayFilter(
              fileStore.filteredFileIds.slice(startIndex, endIndex + 1),
              fileStore.selectedIds
            );

      /** Deselect the files before the clicked file if the first index is after it, or deselect the files after the clicked file if the first index is before it. */
      const unselectedIds = fileStore.selectedIds.filter(
        (id) =>
          (isFirstAfterClicked && fileStore.filteredFileIds.indexOf(id) < clickedIndex) ||
          (!isFirstAfterClicked && fileStore.filteredFileIds.indexOf(id) > clickedIndex)
      );

      fileStore.toggleFilesSelected([
        ...selectedIds.map((id) => ({ id, isSelected: true })),
        ...unselectedIds.map((id) => ({ id, isSelected: false })),
      ]);
    } else if (event.ctrlKey) {
      /** Toggle the selected state of the file that was clicked. */
      fileStore.toggleFilesSelected([
        { id: file.id, isSelected: !fileStore.getIsSelected(file.id) },
      ]);
    } else {
      /** Deselect all the files and select the file that was clicked. */
      fileStore.toggleFilesSelected([
        ...fileStore.selectedIds.map((id) => ({ id, isSelected: false })),
        { id: file.id, isSelected: true },
      ]);
    }
  };

  const handleDoubleClick = () =>
    !disabled && openFile({ file, filteredFileIds: fileStore.filteredFileIds });

  const handleDragEnd = () => homeStore.setIsDraggingOut(false);

  const handleDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    homeStore.setIsDraggingOut(true);

    const hasSelected = fileStore.selectedIds.includes(file.id);
    const files = hasSelected ? await loadSelectedFiles() : null;
    const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
    const icon = hasSelected ? files[0].thumbPaths[0] : file.thumbPaths[0];

    getCurrentWebContents().startDrag({ file: file.path, files: filePaths, icon });
  };

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setTagManagerMode("edit");
    tagStore.setIsTagManagerOpen(true);
  };

  const loadSelectedFiles = async () => {
    const res = await fileStore.loadFiles({ fileIds: fileStore.selectedIds, withOverwrite: false });
    if (!res?.success) throw new Error(res.error);
    return res.data;
  };

  return (
    <ContextMenu key="context-menu" {...{ disabled, file }}>
      <FileBase.Container
        {...{ disabled, height, width }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        selected={fileStore.getIsSelected(file.id)}
      >
        <FileBase.Image
          thumbPaths={file.thumbPaths}
          title={file.originalName}
          height={height}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          fit={homeStore.fileCardFit}
          disabled={disabled}
          draggable
        >
          <FileBase.Chip
            position="top-left"
            icon="Star"
            iconColor={colors.amber["600"]}
            label={file.rating}
          />

          <FileBase.Chip
            position="top-right"
            label={
              <View row>
                {!file.isAnimated && (
                  <Icon
                    name="Face"
                    size="1.2em"
                    color={file.faceModels?.length > 0 ? colors.blue["500"] : colors.grey["600"]}
                    margins={{ right: "0.3em" }}
                  />
                )}
                <Text>{file.ext}</Text>
              </View>
            }
          />

          {collections.length > 0 && (
            <FileBase.Chip position="bottom-left" icon="Collections" label={collections.length} />
          )}

          {file.duration && (
            <FileBase.Chip
              position="bottom-right"
              label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
            />
          )}
        </FileBase.Image>

        <FileBase.Footer>
          {file.tags?.length > 0 ? (
            <FileBase.Tags {...{ disabled }} tags={file.tags} onTagPress={handleTagPress} />
          ) : (
            <View />
          )}

          <FileBase.Tooltip {...{ file }} onTagPress={handleTagPress} />
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
  );
});
