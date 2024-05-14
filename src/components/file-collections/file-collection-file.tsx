import { CSSProperties } from "react";
import { observer } from "mobx-react-lite";
import { FileCollectionFile as FileColFile, useStores } from "store";
import { useSortable } from "@alissavrk/dnd-kit-sortable";
import { CSS } from "@alissavrk/dnd-kit-utilities";
import { FileBase, View } from "components";
import { colors, dayjs, openCarouselWindow } from "utils";

export interface FileCollectionFileProps {
  disabled?: boolean;
  fileColFile?: FileColFile;
  height?: CSSProperties["height"];
  fileId?: string;
  style?: CSSProperties;
  width?: CSSProperties["width"];
}

export const FileCollectionFile = observer(
  ({ disabled, fileColFile, height, fileId, style = {}, width }: FileCollectionFileProps) => {
    const { fileCollectionStore, tagStore } = useStores();

    if (!fileColFile) fileColFile = fileCollectionStore.getFileById(fileId);
    const file = fileColFile?.file;
    if (!fileColFile || !file) return null;

    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: file?.id,
    });

    const handleClick = async (event: React.MouseEvent) => {
      if (disabled) return;
      if (event.shiftKey) {
        const { idsToDeselect, idsToSelect } = fileCollectionStore.getShiftSelectedIds(file.id);

        fileCollectionStore.toggleFilesSelected([
          ...idsToDeselect.map((i) => ({ id: i, isSelected: false })),
          ...idsToSelect.map((i) => ({ id: i, isSelected: true })),
        ]);
      } else if (event.ctrlKey) {
        /** Toggle the selected state of the file that was clicked. */
        fileCollectionStore.toggleFilesSelected([
          { id: file.id, isSelected: !fileCollectionStore.getIsSelected(file.id) },
        ]);
      } else {
        /** Deselect all the files and select the file that was clicked. */
        fileCollectionStore.toggleFilesSelected([
          ...fileCollectionStore.editorSelectedIds.map((id) => ({ id, isSelected: false })),
          { id: file.id, isSelected: true },
        ]);
      }
    };

    const handleDoubleClick = () =>
      openCarouselWindow({
        file,
        selectedFileIds: fileCollectionStore.activeCollection.fileIdIndexes.map(
          ({ fileId }) => fileId
        ),
      });

    const handleTagPress = (tagId: string) => {
      tagStore.setActiveTagId(tagId);
      tagStore.setIsTagEditorOpen(true);
    };

    return (
      <View
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{ ...style, transform: CSS.Transform.toString(transform), transition }}
      >
        <FileBase.Container
          {...{ disabled, height, width }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          selected={fileCollectionStore.getIsSelected(file.id)}
        >
          <FileBase.Image
            thumbPaths={file.thumbPaths}
            title={file.originalName}
            disabled={disabled}
            fit="contain"
            height={250}
          >
            <FileBase.Chip position="top-left" label={fileColFile.index} opacity={0.8} />

            <FileBase.Chip
              position="top-right"
              icon="Star"
              iconColor={colors.amber["600"]}
              label={file.rating}
            />

            {file.duration && (
              <FileBase.Chip
                position="bottom-right"
                label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
              />
            )}
          </FileBase.Image>

          <FileBase.Footer>
            <FileBase.Tags tagIds={file.tagIds} />

            <FileBase.Tooltip {...{ disabled, file }} onTagPress={handleTagPress} />
          </FileBase.Footer>
        </FileBase.Container>
      </View>
    );
  }
);
