import { Comp, FileBase } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { CONSTANTS, duration } from "medior/utils/common";

interface CarouselThumbProps {
  id: string;
  isDragging?: boolean;
  style: React.CSSProperties;
}

export const CarouselThumb = Comp(({ id, isDragging = false, style }: CarouselThumbProps) => {
  const stores = useStores();
  const file = stores.file.getById(id);

  const handleSelect = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (isDragging) event.preventDefault();
    else stores.carousel.setActiveFileId(id);
  };

  return (
    <FileBase.Container
      onClick={handleSelect}
      selected={stores.carousel.activeFileId === id}
      height={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
      width={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
      style={style}
    >
      <FileBase.Chip
        label={file?.rating}
        icon="Star"
        iconColor={colors.custom.orange}
        position="top-left"
      />

      <FileBase.Image thumb={file?.thumb} title={file?.originalName} />

      <FileBase.Chip label={file?.ext} position="top-right" />

      {file?.duration && <FileBase.Chip label={duration(file.duration)} position="bottom-right" />}
    </FileBase.Container>
  );
});
