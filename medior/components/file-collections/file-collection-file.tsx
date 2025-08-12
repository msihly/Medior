import { Comp, FileBase } from "medior/components";
import { File, useStores } from "medior/store";
import { colors, CSS, openCarouselWindow, toast, useFileDrag } from "medior/utils/client";
import { duration } from "medior/utils/common";

export interface FileCollectionFileProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  width?: CSS["width"];
}

export const FileCollectionFile = Comp(
  ({ disabled, file, height, width }: FileCollectionFileProps) => {
    const stores = useStores();

    const fileDragProps = useFileDrag(file, stores.collection.editor.search.selectedIds);

    const fileIndex = stores.collection.editor.getIndexById(file.id);
    const hasChangedIndex = fileIndex !== stores.collection.editor.getOriginalIndex(file.id);

    const handleClick = async (event: React.MouseEvent) => {
      if (disabled) return;
      const res = await stores.collection.editor.search.handleSelect({
        hasCtrl: event.ctrlKey,
        hasShift: event.shiftKey,
        id: file.id,
      });
      if (!res?.success) toast.error(res.error);
    };

    const handleDoubleClick = () =>
      openCarouselWindow({ file, selectedFileIds: stores.collection.editor.search.ids });

    return (
      <FileBase.ContextMenu {...{ disabled, file }}>
        <FileBase.Tooltip {...{ file }}>
          <FileBase.Container
            {...{ disabled, height, width }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            selected={stores.collection.editor.search.getIsSelected(file.id)}
            opacity={file.isArchived ? 0.5 : 1}
          >
            <FileBase.Image
              {...fileDragProps}
              {...{ disabled, height }}
              thumb={file.thumb}
              title={file.originalName}
              draggable
            >
              <FileBase.Chip
                position="top-left"
                label={fileIndex + 1}
                bgColor={hasChangedIndex ? colors.custom.purple : colors.custom.black}
                opacity={0.8}
              />

              <FileBase.RatingChip position="top-right" rating={file.rating} />

              {file.duration && (
                <FileBase.Chip label={duration(file.duration)} position="bottom-right" hasFooter />
              )}
            </FileBase.Image>

            <FileBase.Footer>
              <FileBase.Tags tags={file.tags} />
            </FileBase.Footer>
          </FileBase.Container>
        </FileBase.Tooltip>
      </FileBase.ContextMenu>
    );
  },
);
