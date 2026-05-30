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

    const handleDoubleClick = async () => {
      if (!disabled) {
        const res = await store.listIdsForCarousel();
        if (!res?.success) console.error(res.error);
        else openCarouselWindow({ file, selectedFileIds: res.data });
      }
    };

    return (
      <FileBase.ContextMenu {...{ disabled, file }} store={store}>
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
              <CardBase.Chip
                position="top-left"
                label={fileIndex + 1}
                bgColor={hasChangedIndex ? colors.custom.purple : colors.custom.black}
                opacity={0.6}
                radiuses={{ left: 0, top: 0, bottomRight: "inherit" }}
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
