import { getCurrentWebContents } from "@electron/remote";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { Icon, Text, View } from "components";
import { ContextMenu, FileBase } from ".";
import { colors, dayjs, getConfig, openCarouselWindow } from "utils";
import { CSSObject } from "tss-react";

interface FileCardProps {
  disabled?: boolean;
  file?: File;
  height?: CSSObject["height"];
  id?: string;
  width?: CSSObject["width"];
}

export const FileCard = observer(({ disabled, file, height, id, width }: FileCardProps) => {
  const config = getConfig();

  const { fileStore, homeStore, tagStore } = useStores();

  if (!file) file = fileStore.getById(id);
  // const collections = fileCollectionStore.listByFileId(id);

  const handleClick = async (event: React.MouseEvent) => {
    if (disabled) return;
    if (event.shiftKey) {
      const res = await homeStore.getShiftSelectedFiles({
        id: file.id,
        selectedIds: fileStore.selectedIds,
      });
      if (!res?.success) throw new Error(res.error);

      fileStore.toggleFilesSelected([
        ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
        ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
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

  const handleDoubleClick = async () => {
    if (!disabled) {
      const res = await homeStore.listIdsForCarousel();
      if (!res?.success) console.error(res.error);
      else openCarouselWindow({ file, selectedFileIds: res.data });
    }
  };

  const handleDragEnd = () => homeStore.setIsDraggingOut(false);

  const handleDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    homeStore.setIsDraggingOut(true);

    const hasSelected = fileStore.selectedIds.includes(file.id);
    const files = hasSelected ? await loadSelectedFiles() : null;
    const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
    const icon = hasSelected ? files[0].thumbPaths[0] : file.thumbPaths[0];

    try {
      getCurrentWebContents().startDrag({ file: file.path, files: filePaths, icon });
    } catch (err) {
      if (err.message.includes("Failed to load image from path")) {
        try {
          getCurrentWebContents().startDrag({
            file: file.path,
            files: filePaths,
            icon: hasSelected ? files[0].path : file.path,
          });
        } catch (err) {
          console.error(err);
        }
      } else console.error(err);
    }
  };

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setIsTagEditorOpen(true);
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
