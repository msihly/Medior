import { CardBase, Comp, FileBase } from "medior/components";
import { useFileDrag } from "medior/components/files/hooks";
import { File, FileSearch, useStores } from "medior/store";
import { colors, CSS, openCarouselWindow, toast } from "medior/utils/client";

export interface FileCollectionFileProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  store: FileSearch;
  width?: CSS["width"];
}

export const FileCollectionFile = Comp(
  ({ disabled, file, height, store, width }: FileCollectionFileProps) => {
    const stores = useStores();
    const editor = stores.collection.editor;

    const fileDragProps = useFileDrag(file, editor.search.selectedIds);

    const fileIndex = editor.getIndexById(file.id);
    const hasChangedIndex = fileIndex !== editor.getOriginalIndex(file.id);

    const handleClick = async (event: React.MouseEvent) => {
      if (disabled) return;

      const res = await editor.search.handleSelect({
        hasCtrl: event.ctrlKey,
        hasShift: event.shiftKey,
        id: file.id,
      });

      if (!res?.success) toast.error(res.error);
    };

    const handleDoubleClick = async () => {
      if (!disabled) {
        openCarouselWindow({
          file,
          selectedFileIds: editor.getFileIdsForCarousel(),
        });
      }
    };

    return (
      <FileBase.ContextMenu
        {...{ disabled, file }}
        store={store}
        carouselFileIds={editor.getFileIdsForCarousel()}
      >
        <FileBase.Tooltip {...{ file }}>
          <FileBase.Container
            {...{ disabled, height, width }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            selected={editor.search.getIsSelected(file.id)}
            opacity={file.isArchived ? 0.5 : 1}
          >
            <FileBase.Image
              {...fileDragProps}
              {...{ disabled, height }}
              thumb={file.thumb}
              fileId={file.id}
              isCorrupted={file.isCorrupted}
              title={file.originalName}
              draggable
            >
              <CardBase.Chip
                position="top-left"
                label={fileIndex + 1}
                bgColor={hasChangedIndex ? colors.custom.purple : colors.custom.black}
                opacity={0.6}
                radiuses={{ bottomRight: "inherit", left: 0, top: 0 }}
                flush
              />

              <FileBase.ExtAndIcons position="top-right" file={file} />

              <FileBase.RatingChip position="bottom-left" rating={file.rating} hasFooter />

              <FileBase.Duration position="bottom-right" file={file} hasFooter />
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
