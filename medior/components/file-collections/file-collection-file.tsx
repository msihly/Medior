import { CSSProperties } from "react";
import { observer, useStores } from "medior/store";
import { useSortable } from "@alissavrk/dnd-kit-sortable";
import { CSS as CSSUtils } from "@alissavrk/dnd-kit-utilities";
import { FileBase, View } from "medior/components";
import { dayjs, openCarouselWindow } from "medior/utils";

export interface FileCollectionFileProps {
  disabled?: boolean;
  id: string;
  height?: CSSProperties["height"];
  style?: CSSProperties;
  width?: CSSProperties["width"];
}

export const FileCollectionFile = observer(
  ({ disabled, id, height, style = {}, width }: FileCollectionFileProps) => {
    const stores = useStores();

    const file = stores.collection.editor.getFileById(id);
    if (!file) return null;

    const fileIndex = stores.collection.editor.getSortedIndex(id);

    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const handleClick = async (event: React.MouseEvent) => {
      if (disabled) return;
      if (event.shiftKey) {
        const { idsToDeselect, idsToSelect } = stores.collection.editor.getShiftSelectedIds(id);
        stores.collection.editor.toggleFilesSelected([
          ...idsToDeselect.map((i) => ({ id: i, isSelected: false })),
          ...idsToSelect.map((i) => ({ id: i, isSelected: true })),
        ]);
      } else if (event.ctrlKey) {
        /** Toggle the selected state of the file that was clicked. */
        stores.collection.editor.toggleFilesSelected([
          { id, isSelected: !stores.collection.editor.getIsSelected(id) },
        ]);
      } else {
        /** Deselect all the files and select the file that was clicked. */
        stores.collection.editor.toggleFilesSelected([
          ...stores.collection.editor.selectedIds.map((id) => ({ id, isSelected: false })),
          { id, isSelected: true },
        ]);
      }
    };

    const handleDoubleClick = () =>
      openCarouselWindow({
        file,
        selectedFileIds: stores.collection.editor.collection.fileIdIndexes.map(
          ({ fileId }) => fileId
        ),
      });

    const handleTagPress = (tagId: string) => {
      stores.tag.setActiveTagId(tagId);
      stores.tag.setIsTagEditorOpen(true);
    };

    return (
      <View
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={{ ...style, transform: CSSUtils.Transform.toString(transform), transition }}
      >
        <FileBase.ContextMenu {...{ disabled, file }}>
          <FileBase.Container
            {...{ disabled, height, width }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            selected={stores.collection.editor.getIsSelected(id)}
          >
            <FileBase.Image
              thumbPaths={file.thumbPaths}
              title={file.originalName}
              disabled={disabled}
              fit="contain"
              height={250}
            >
              <FileBase.Chip position="top-left" label={fileIndex} opacity={0.8} />

              <FileBase.RatingChip position="top-right" rating={file.rating} />

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
        </FileBase.ContextMenu>
      </View>
    );
  }
);
