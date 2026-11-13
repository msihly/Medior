import { useEffect, useState } from "react";
import { checkFileExists } from "trabecula/utils/server";
import { Comp, FileBase, MediaProgramMissingChip, View } from "medior/components";
import { File, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { formatMediaProgramDate } from "medior/utils/common";

/** Searches for an episode's Reddit discussion, like the Episode Discussion script. */
export const EPISODE_DISCUSSION_MENU_ITEM = { icon: "Forum", label: "Episode Discussion" } as const;

/** Translates the title the metadata source gives the episode, or those of the selected episodes. */
export const EPISODE_TITLE_TRANSLATION_MENU_ITEM = {
  icon: "Translate",
  label: "Translate Title",
} as const;

export interface MediaProgramEpisodeProps {
  episodeNumber: number;
  file: File;
}

/**
 * An episode with its still, title, and air date from the metadata source when it has them, marked
 * missing when its file is no longer on disk. Hovering a still plays the file's own frames when it
 * has them, which shows when a file sits at another episode's number. Files sharing a number are conflicts, and a
 * file at a number the source doesn't list is unmatched.
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
  // Hovering only cycles from a still to frames, since cycling between two images flickers.
  const isAnimated = file.thumb?.frameHeight > 0 && file.thumb?.frameWidth > 0;
  const meta = store.getEpisodeMeta(file.id);
  const title = store.getEpisodeTitle(meta?.title) ?? file.originalName;
  const subtitle = [formatMediaProgramDate(meta?.airDate), meta?.title ? file.originalName : null]
    .filter(Boolean)
    .join(" · ");
  const footerOffset = subtitle ? "2.6rem" : "1.5rem";
  const statusChip = isMissing
    ? null
    : store.conflictNumbers.has(episodeNumber)
      ? { bgColor: colors.custom.orange, label: "Conflict" }
      : store.getIsUnmatched(file.id)
        ? { bgColor: colors.custom.blueGrey, label: "Unmatched" }
        : null;

  const handleClick = async (event: React.MouseEvent) => {
    const res = await store.selectFileEpisode({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: file.id,
    });
    if (!res.success) toast.error(res.error);
  };

  const handleDiscussion = async () => {
    const res = await store.openEpisodeDiscussion({ episodeNumber, fileName: file.originalName });
    if (!res.success) toast.error(res.error);
  };

  const handlePlay = async () => {
    const res = await store.play(file.id);
    if (!res.success) toast.error(res.error);
  };

  const handleTitleTranslation = () =>
    stores.mediaProgram.titleTranslation.open({
      programId: store.program.id,
      titles: store.getTitlesToTranslate({ fileId: file.id }),
    });

  return (
    <FileBase.ContextMenu
      file={file}
      store={store.search}
      carouselFileIds={store.episodeIds}
      extraMenuItems={[
        meta?.title
          ? { ...EPISODE_TITLE_TRANSLATION_MENU_ITEM, onClick: handleTitleTranslation }
          : null,
        { ...EPISODE_DISCUSSION_MENU_ITEM, divider: "bottom", onClick: handleDiscussion },
      ]}
    >
      <FileBase.Tooltip file={file}>
        <FileBase.Container
          height="auto"
          onClick={handleClick}
          onDoubleClick={handlePlay}
          selected={store.search.getIsSelected(file.id)}
        >
          <View position="relative" overflow="hidden" className={css.thumb}>
            {meta?.stillPath ? (
              <FileBase.Image
                thumbs={[{ path: meta.stillPath }, ...(isAnimated ? [file.thumb] : [])]}
                title={title}
                fit="cover"
              />
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
              label={store.getEpisodeLabel(episodeNumber)}
              icon={isWatched ? "CheckCircle" : undefined}
              iconColor={colors.custom.green}
              color={colors.custom.white}
            />

            {isMissing && (
              <MediaProgramMissingChip
                position="bottom-left"
                size="small"
                footerOffset={footerOffset}
              />
            )}

            {statusChip && (
              <FileBase.Chip
                {...statusChip}
                position="bottom-left"
                size="small"
                color={colors.custom.white}
                footerOffset={footerOffset}
              />
            )}

            <FileBase.Duration
              position="bottom-right"
              size="small"
              file={file}
              footerOffset={footerOffset}
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
