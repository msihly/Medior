import { CardBase, Comp, FileBase } from "medior/components";
import { File, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export interface MediaProgramEpisodeProps {
  episodeNumber: number;
  file: File;
}

export const MediaProgramEpisode = Comp(({ episodeNumber, file }: MediaProgramEpisodeProps) => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const isWatched = store.program?.watchedIdSet.has(file.id);

  const handleClick = async (event: React.MouseEvent) => {
    const res = await store.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: file.id,
    });

    if (!res?.success) toast.error(res.error);
  };

  const handlePlay = async () => {
    const res = await store.play(file.id);

    if (!res.success) toast.error(res.error);
  };

  return (
    <FileBase.ContextMenu file={file} store={store.search} carouselFileIds={store.episodeIds}>
      <FileBase.Tooltip file={file}>
        <FileBase.Container
          onClick={handleClick}
          onDoubleClick={handlePlay}
          selected={store.search.getIsSelected(file.id)}
          opacity={isWatched ? 0.6 : 1}
        >
          <FileBase.Image
            thumb={file.thumb}
            fileId={file.id}
            isCorrupted={file.isCorrupted}
            title={file.originalName}
          >
            <CardBase.Chip
              position="top-left"
              label={episodeNumber}
              bgColor={colors.custom.black}
              opacity={0.6}
              radiuses={{ bottomRight: "inherit", left: 0, top: 0 }}
              flush
            />

            {isWatched && (
              <FileBase.Chip
                position="top-right"
                icon="CheckCircle"
                iconColor={colors.custom.green}
                label="Watched"
                opacity={0.9}
              />
            )}

            <FileBase.RatingChip position="bottom-left" rating={file.rating} hasFooter />

            <FileBase.Duration position="bottom-right" file={file} hasFooter />
          </FileBase.Image>

          <FileBase.Footer>
            <FileBase.FooterText text={file.originalName} />
          </FileBase.Footer>
        </FileBase.Container>
      </FileBase.Tooltip>
    </FileBase.ContextMenu>
  );
});
