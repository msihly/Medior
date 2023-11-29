import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FileBase } from "components";
import { colors, dayjs } from "utils";

export const THUMB_WIDTH = 135; // px

interface CarouselThumbProps {
  id: string;
  isDragging?: boolean;
  style: React.CSSProperties;
}

export const CarouselThumb = observer(({ id, isDragging = false, style }: CarouselThumbProps) => {
  const { carouselStore, fileStore } = useStores();
  const file = fileStore.getById(id);

  const handleSelect = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (isDragging) event.preventDefault();
    else carouselStore.setActiveFileId(id);
  };

  return (
    <FileBase.Container
      onClick={handleSelect}
      selected={carouselStore.activeFileId === id}
      height={THUMB_WIDTH}
      width={THUMB_WIDTH}
      style={style}
    >
      <FileBase.Chip
        label={file?.rating}
        icon="Star"
        iconColor={colors.amber["600"]}
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
