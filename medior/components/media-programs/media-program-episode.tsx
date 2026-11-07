import { useEffect, useState } from "react";
import { checkFileExists } from "trabecula/utils/server";
import { Comp, FileBase, MediaProgramMissingChip, View } from "medior/components";
import { File, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { formatMediaProgramDate } from "medior/utils/common";

export interface MediaProgramEpisodeProps {
  episodeNumber: number;
  file: File;
}

/**
 * An episode with its still, title, and air date from the metadata source when it has them, marked
 * missing when its file is no longer on disk.
 */
export const MediaProgramEpisode = Comp(({ episodeNumber, file }: MediaProgramEpisodeProps) => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const { css } = useClasses(null);

  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      const exists = await checkFileExists(file.path);
      if (!isCancelled) setIsMissing(!exists);
    })();

    return () => {
      isCancelled = true;
    };
  }, [file.path]);

  const isWatched = store.program?.watchedIdSet.has(file.id);
  const meta = store.getEpisodeMeta(file.id);
  const title = meta?.title ?? file.originalName;
  const subtitle = [formatMediaProgramDate(meta?.airDate), meta?.title ? file.originalName : null]
    .filter(Boolean)
    .join(" · ");

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
          height="auto"
          onClick={handleClick}
          onDoubleClick={handlePlay}
          selected={store.search.getIsSelected(file.id)}
        >
          <View position="relative" overflow="hidden" className={css.thumb}>
            {meta?.stillPath ? (
              <FileBase.Image thumb={{ path: meta.stillPath }} title={title} fit="cover" />
            ) : (
              <FileBase.Image
                thumb={file.thumb}
                fileId={file.id}
                isCorrupted={file.isCorrupted}
                title={title}
                fit="cover"
              />
            )}

            <FileBase.RatingChip position="top-left" rating={file.rating} size="small" />

            <FileBase.Chip
              position="top-right"
              size="small"
              label={`EP ${episodeNumber}`}
              icon={isWatched ? "CheckCircle" : undefined}
              iconColor={colors.custom.green}
              color={colors.custom.white}
            />

            {isMissing && (
              <MediaProgramMissingChip
                position="bottom-left"
                size="small"
                footerOffset={subtitle ? "2.6rem" : "1.5rem"}
              />
            )}

            <FileBase.Duration
              position="bottom-right"
              size="small"
              file={file}
              footerOffset={subtitle ? "2.6rem" : "1.5rem"}
            />

            <FileBase.Footer height={subtitle ? "3rem" : "1.8rem"}>
              <View column width="100%" overflow="hidden">
                <FileBase.FooterText text={title} noTooltip textProps={{ fontWeight: 600 }} />

                <FileBase.FooterText
                  text={subtitle}
                  noTooltip
                  textProps={{ color: colors.custom.lightGrey, fontSize: "0.75em" }}
                />
              </View>
            </FileBase.Footer>
          </View>
        </FileBase.Container>
      </FileBase.Tooltip>
    </FileBase.ContextMenu>
  );
});

const useClasses = makeClasses({
  thumb: {
    aspectRatio: "16 / 9",
    borderRadius: "inherit",
  },
});
