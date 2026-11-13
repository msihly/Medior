import { ComponentProps } from "react";
import {
  Comp,
  ContextMenu,
  ContextMenuProps,
  EPISODE_DISCUSSION_MENU_ITEM,
  EPISODE_TITLE_TRANSLATION_MENU_ITEM,
  FileBase,
  Icon,
  View,
  WatchStatusChip,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor, makeClasses, toast } from "medior/utils/client";
import {
  formatMediaProgramDate,
  makeSeasonLabel,
  MediaProgramEpisodeMeta,
  MediaProgramMetaSeason,
  MediaProgramMissingMark,
} from "medior/utils/common";

const MARK_CHIPS: Record<
  MediaProgramMissingMark | "missing",
  { bgColor: CssColor; label: string }
> = {
  missing: { bgColor: colors.custom.red, label: "Missing" },
  skipped: { bgColor: colors.custom.purple, label: "Skipped" },
  watched: { bgColor: colors.custom.green, label: "Watched" },
};

export interface MediaProgramMissingChipProps extends Omit<
  ComponentProps<typeof FileBase.Chip>,
  "bgColor" | "color" | "label"
> {
  mark?: MediaProgramMissingMark | null;
}

/** Marks an episode or season that has no file on disk, or how an episode without one was seen. */
export const MediaProgramMissingChip = Comp(({ mark, ...props }: MediaProgramMissingChipProps) => (
  <FileBase.Chip {...props} {...MARK_CHIPS[mark ?? "missing"]} color={colors.custom.white} />
));

export interface MediaProgramMissingEpisodeProps {
  episode: MediaProgramEpisodeMeta;
}

/**
 * An episode the metadata source lists without a file, in place of its file card. Selecting it lets
 * it be marked watched elsewhere or skipped, and its menu has the episode actions that need no
 * file.
 */
export const MediaProgramMissingEpisode = Comp(({ episode }: MediaProgramMissingEpisodeProps) => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const { css } = useClasses(null);

  const mark = store.getMissingMark(episode.number);
  const title = store.getEpisodeTitle(episode.title) ?? `Episode ${episode.number}`;
  const subtitle = formatMediaProgramDate(episode.airDate);

  const handleClick = (event: React.MouseEvent) =>
    store.selectMissingEpisode({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      number: episode.number,
    });

  const handleDiscussion = async () => {
    const res = await store.openEpisodeDiscussion({ episodeNumber: episode.number });
    if (!res.success) toast.error(res.error);
  };

  const handleTitleTranslation = () =>
    stores.mediaProgram.titleTranslation.open({
      programId: store.program.id,
      titles: store.getTitlesToTranslate({ number: episode.number }),
    });

  return (
    <ContextMenu
      id={`missing-episode-${episode.number}`}
      menuItems={[
        episode.title
          ? { ...EPISODE_TITLE_TRANSLATION_MENU_ITEM, onClick: handleTitleTranslation }
          : null,
        { ...EPISODE_DISCUSSION_MENU_ITEM, onClick: handleDiscussion },
      ]}
    >
      <FileBase.Container
        height="auto"
        onClick={handleClick}
        selected={store.selectedMissingNumbers.includes(episode.number)}
      >
        <View position="relative" overflow="hidden" className={css.thumb}>
          {episode.stillPath ? (
            <FileBase.Image thumb={{ path: episode.stillPath }} title={title} fit="cover" />
          ) : (
            <View column height="100%" align="center" justify="center">
              <Icon name="VideocamOff" size="2.5rem" color={colors.custom.grey} />
            </View>
          )}

          <FileBase.Chip
            position="top-right"
            size="small"
            label={store.getEpisodeLabel(episode.number)}
            icon={mark === "watched" ? "CheckCircle" : undefined}
            iconColor={colors.custom.green}
            color={colors.custom.white}
          />

          <MediaProgramMissingChip
            mark={mark}
            position="bottom-left"
            size="small"
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
    </ContextMenu>
  );
});

export interface MediaProgramMissingSeasonProps {
  onClick: (number: number, event: React.MouseEvent) => void;
  onMatchMeta: () => void;
  onWatched: (number: number, isWatched: boolean) => void;
  season: MediaProgramMetaSeason;
}

/**
 * A season the metadata source lists that the program has no files for, beside its seasons, with
 * the season actions that need no files in its context menu. Selecting it shows its episodes, each
 * of them missing.
 */
export const MediaProgramMissingSeason = Comp(
  ({ onClick, onMatchMeta, onWatched, season }: MediaProgramMissingSeasonProps) => {
    const stores = useStores();
    const store = stores.mediaProgram.editor;

    const label = makeSeasonLabel(season.number);
    // Metadata saved before seasons kept their own posters shows the program's.
    const posterPath = season.posterPath ?? store.program?.meta?.posterPath;
    const episodeCounts = store.getMissingSeasonEpisodeCounts(season);
    const menuItems: ContextMenuProps["menuItems"] = [
      {
        icon: "CheckCircle",
        iconProps: { color: colors.custom.green },
        label: "Mark Watched",
        onClick: () => onWatched(season.number, true),
      },
      {
        icon: "RadioButtonUnchecked",
        label: "Mark Unwatched",
        onClick: () => onWatched(season.number, false),
      },
      { icon: "TravelExplore", label: "Match Metadata", onClick: onMatchMeta },
    ];

    const handleClick = (event: React.MouseEvent) => onClick(season.number, event);

    return (
      <ContextMenu id={`missing-season-${season.number}`} menuItems={menuItems} flex="none">
        <FileBase.Container
          width="12rem"
          height="17.5rem"
          onClick={handleClick}
          selected={store.selectedMissingSeasonNumberSet.has(season.number)}
        >
          {posterPath ? (
            <FileBase.Image thumb={{ path: posterPath }} title={label} fit="cover" />
          ) : (
            <View column flex={1} align="center" justify="center">
              <Icon name="Movie" size="2.5rem" color={colors.custom.grey} />
            </View>
          )}

          <MediaProgramMissingChip position="top-left" size="small" />

          <WatchStatusChip
            position="top-right"
            size="small"
            total={episodeCounts.total}
            watched={episodeCounts.watched}
          />

          <FileBase.Footer height={season.title ? "3rem" : "1.8rem"}>
            <View column width="100%" overflow="hidden">
              <FileBase.FooterText text={label} textProps={{ fontWeight: 600 }} />

              {season.title && (
                <FileBase.FooterText
                  text={season.title}
                  textProps={{ color: colors.custom.lightGrey, fontSize: "0.75em" }}
                />
              )}
            </View>
          </FileBase.Footer>
        </FileBase.Container>
      </ContextMenu>
    );
  },
);

const useClasses = makeClasses({
  thumb: {
    aspectRatio: "16 / 9",
    borderRadius: "inherit",
  },
});
