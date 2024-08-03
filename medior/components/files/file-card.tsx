import { getCurrentWebContents } from "@electron/remote";
import { File, observer, useStores } from "medior/store";
import { Icon, Text, View } from "medior/components";
import { ContextMenu, FileBase } from ".";
import { colors, CSS, dayjs, getConfig, openCarouselWindow } from "medior/utils";

interface FileCardProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  id?: string;
  width?: CSS["width"];
}

export const FileCard = observer(({ disabled, file, height, id, width }: FileCardProps) => {
  const config = getConfig();

  const stores = useStores();

  if (!file) file = stores.file.getById(id);
  // const collections = stores.collection.listByFileId(id);

  const handleClick = async (event: React.MouseEvent) => {
    if (disabled) return;
    if (event.shiftKey) {
      const res = await stores.home.getShiftSelectedFiles({
        id: file.id,
        selectedIds: stores.file.selectedIds,
      });
      if (!res?.success) throw new Error(res.error);

      stores.file.toggleFilesSelected([
        ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
        ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
      ]);
    } else if (event.ctrlKey) {
      /** Toggle the selected state of the file that was clicked. */
      stores.file.toggleFilesSelected([
        { id: file.id, isSelected: !stores.file.getIsSelected(file.id) },
      ]);
    } else {
      /** Deselect all the files and select the file that was clicked. */
      stores.file.toggleFilesSelected([
        ...stores.file.selectedIds.map((id) => ({ id, isSelected: false })),
        { id: file.id, isSelected: true },
      ]);
    }
  };

  const handleDoubleClick = async () => {
    if (!disabled) {
      const res = await stores.home.listIdsForCarousel();
      if (!res?.success) console.error(res.error);
      else openCarouselWindow({ file, selectedFileIds: res.data });
    }
  };

  const handleDragEnd = () => stores.home.setIsDraggingOut(false);

  const handleDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    stores.home.setIsDraggingOut(true);

    const hasSelected = stores.file.selectedIds.includes(file.id);
    const files = hasSelected ? await loadSelectedFiles() : null;
    const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
    const icon = hasSelected ? files[0].thumbPaths[0] : file.thumbPaths[0];

    try {
      getCurrentWebContents().startDrag({ file: file.path, files: filePaths, icon });
    } catch (error) {
      console.error(error);
    }
  };

  const handleTagPress = (tagId: string) => {
    stores.tag.setActiveTagId(tagId);
    stores.tag.setIsTagEditorOpen(true);
  };

  const loadSelectedFiles = async () => {
    const res = await stores.file.loadFiles({
      fileIds: stores.file.selectedIds,
      withOverwrite: false,
    });
    if (!res?.success) throw new Error(res.error);
    return res.data;
  };

  return (
    <ContextMenu key="context-menu" {...{ disabled, file }}>
      <FileBase.Container
        {...{ disabled, height, width }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        selected={stores.file.getIsSelected(file.id)}
      >
        <FileBase.Image
          thumbPaths={file.thumbPaths}
          title={file.originalName}
          height={height}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          fit={stores.home.fileCardFit}
          disabled={disabled}
          draggable
        >
          {(file.rating > 0 || !config.file.hideUnratedIcon) && (
            <FileBase.Chip
              position="top-left"
              icon="Star"
              iconColor={colors.amber["600"]}
              label={file.rating}
            />
          )}

          <FileBase.Chip
            position="top-right"
            label={
              <View row>
                {!file.isAnimated && (
                  <Icon
                    name="Face"
                    size="1.2em"
                    color={file.hasFaceModels ? colors.blue["500"] : colors.grey["600"]}
                    margins={{ right: "0.3em" }}
                  />
                )}
                <Text>{file.ext}</Text>
              </View>
            }
          />

          {/* {collections.length > 0 && (
            <FileBase.Chip position="bottom-left" icon="Collections" label={collections.length} />
          )} */}

          {file.duration && (
            <FileBase.Chip
              position="bottom-right"
              label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
            />
          )}
        </FileBase.Image>

        <FileBase.Footer>
          {file.tagIds?.length > 0 ? (
            <FileBase.Tags {...{ disabled }} tagIds={file.tagIds} />
          ) : (
            <View />
          )}

          <FileBase.Tooltip {...{ file }} onTagPress={handleTagPress} />
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
  );
});
