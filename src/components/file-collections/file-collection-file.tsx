import { CSSProperties } from "react";
import { observer } from "mobx-react-lite";
import { FileCollectionFile as FileColFile, useStores } from "store";
import { useSortable } from "@alissavrk/dnd-kit-sortable";
import { CSS } from "@alissavrk/dnd-kit-utilities";
import { Button, FileBase, View, openFile } from "components";
import { colors, dayjs } from "utils";

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

    const handleDoubleClick = () =>
      openFile({
        file,
        filteredFileIds: fileCollectionStore.activeCollection.fileIdIndexes.map(
          ({ fileId }) => fileId
        ),
      });

    const handleTagPress = (tagId: string) => {
      tagStore.setActiveTagId(tagId);
      tagStore.setTagManagerMode("edit");
      tagStore.setIsTagManagerOpen(true);
    };

    const toggleDeleted = () => {
      fileColFile.setIsDeleted(!fileColFile.isDeleted);
      fileCollectionStore.setHasUnsavedChanges(true);
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
          onDoubleClick={handleDoubleClick}
          selected={fileColFile.isDeleted}
          selectedColor={colors.red["900"]}
        >
          <FileBase.Image
            thumbPaths={file.thumbPaths}
            title={file.originalName}
            disabled={disabled}
            height={200}
          >
            <FileBase.Chip position="top-left" label={fileColFile.index} opacity={0.8} />

            <FileBase.Chip
              position="top-right"
              icon="Star"
              iconColor={colors.amber["600"]}
              label={file.rating}
            />

            <FileBase.Chip
              position="bottom-left"
              label={
                <Button icon="Delete" onClick={toggleDeleted} color={colors.red["900"]} circle />
              }
              padding={{ all: "0 1px" }}
            />

            {file.duration && (
              <FileBase.Chip
                position="bottom-right"
                label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
              />
            )}
          </FileBase.Image>

          <FileBase.Footer>
            <FileBase.Tags {...{ disabled }} tags={file.tags} onTagPress={handleTagPress} />

            <FileBase.Tooltip {...{ disabled, file }} onTagPress={handleTagPress} />
          </FileBase.Footer>
        </FileBase.Container>
      </View>
    );
  }
);
