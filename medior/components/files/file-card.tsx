import { Comp, LoadingOverlay } from "medior/components";
import { useFileDrag } from "medior/components/files/hooks";
import { File, FileSearch, useStores } from "medior/store";
import { CSS, openCarouselWindow, toast } from "medior/utils/client";
import { FileBase } from ".";

interface FileCardProps {
  disabled?: boolean;
  file?: File;
  height?: CSS["height"];
  id?: string;
  store: FileSearch;
  width?: CSS["width"];
}

export const FileCard = Comp(({ disabled, file, height, id, store, width }: FileCardProps) => {
  const stores = useStores();

  if (!file) file = stores.file.getById(id);
  const fileDragProps = useFileDrag(file, store.selectedIds);

  const handleClick = async (event: React.MouseEvent) => {
    if (disabled) return;
    const res = await store.handleSelect({
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

  if (!file)
    return (
      <FileBase.Container {...{ disabled, height, width }} flex="none">
        <LoadingOverlay isLoading />
      </FileBase.Container>
    );

  return (
    <FileBase.ContextMenu key="context-menu" {...{ disabled, file }} store={store}>
      <FileBase.Tooltip {...{ file }}>
        <FileBase.Container
          {...{ disabled, height, width }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          selected={store.getIsSelected(file.id)}
        >
          <FileBase.Image
            {...fileDragProps}
            thumb={file.thumb}
            title={file.originalName}
            fit={stores.home.fileCardFit}
            height={height}
            draggable
          >
            <FileBase.RatingChip position="top-left" rating={file.rating} />

            <FileBase.ExtAndIcons position="top-right" file={file} />

            <FileBase.Duration position="bottom-right" file={file} hasFooter />
          </FileBase.Image>

          <FileBase.Footer>
            <FileBase.Tags tags={file.tags} />
          </FileBase.Footer>
        </FileBase.Container>
      </FileBase.Tooltip>
    </FileBase.ContextMenu>
  );
});
