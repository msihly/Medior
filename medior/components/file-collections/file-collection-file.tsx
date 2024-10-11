import { File, observer, useStores } from "medior/store";
import { FileBase } from "medior/components";
import { colors, CSS, duration, openCarouselWindow } from "medior/utils";
import { toast } from "react-toastify";

export interface FileCollectionFileProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  width?: CSS["width"];
}

export const FileCollectionFile = observer(
  ({ disabled, file, height, width }: FileCollectionFileProps) => {
    const stores = useStores();

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
        <FileBase.Tooltip {...{ disabled, file }}>
          <FileBase.Container
            {...{ disabled, height, width }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            selected={stores.collection.editor.search.getIsSelected(file.id)}
            opacity={file.isArchived ? 0.5 : 1}
          >
            <FileBase.Image
              {...{ disabled, height }}
              animated={file.isAnimated}
              thumb={file.thumb}
              title={file.originalName}
              fit="contain"
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
              <FileBase.Tags tagIds={file.tagIds} />
            </FileBase.Footer>
          </FileBase.Container>
        </FileBase.Tooltip>
      </FileBase.ContextMenu>
    );
  }
);
