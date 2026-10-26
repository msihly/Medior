import { Comp, FileBase } from "medior/components";
import { useStores } from "medior/store";
import { CONSTANTS } from "medior/utils/common";

interface CarouselThumbProps {
  id: string;
  isDragging?: boolean;
  style: React.CSSProperties;
}

export const CarouselThumb = Comp(({ id, isDragging = false, style }: CarouselThumbProps) => {
  const stores = useStores();
  const store = stores.carousel;

  const file = stores.file.getById(id);

  const handleSelect = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (isDragging) event.preventDefault();
    else store.setActiveFileId(id);
  };

  return (
    <FileBase.Container
      onClick={handleSelect}
      selected={store.activeFileId === id}
      height={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
      width={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
      style={style}
    >
      <FileBase.Image
        thumb={file?.thumb}
        title={file?.originalName}
        fileId={file?.id}
        isCorrupted={file?.isCorrupted}
      />

      {file && <FileBase.RatingChip position="top-left" rating={file.rating} />}

      <FileBase.Chip label={file?.ext} position="top-right" />

      {file && <FileBase.Duration position="bottom-right" file={file} />}
    </FileBase.Container>
  );
});
