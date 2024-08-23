import { observer, useStores } from "medior/store";
import { FileBase } from "medior/components";
import { colors, dayjs } from "medior/utils";

export const THUMB_WIDTH = 135; // px

interface CarouselThumbProps {
  id: string;
  isDragging?: boolean;
  style: React.CSSProperties;
}

export const CarouselThumb = observer(({ id, isDragging = false, style }: CarouselThumbProps) => {
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
      height={THUMB_WIDTH}
      width={THUMB_WIDTH}
      style={style}
    >
      <FileBase.Chip
        label={file?.rating}
        icon="Star"
        iconColor={colors.custom.orange}
        position="top-left"
      />

      <FileBase.Image thumbPaths={file?.thumbPaths} title={file?.originalName} />

      <FileBase.Chip label={file?.ext} position="top-right" />

      {file?.duration && (
        <FileBase.Chip
          label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
          position="bottom-right"
        />
      )}
    </FileBase.Container>
  );
});
