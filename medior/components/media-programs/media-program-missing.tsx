import { ComponentProps } from "react";
import { Comp, FileBase, Icon, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor, makeClasses } from "medior/utils/client";
import {
  Fmt,
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
 * it be marked watched elsewhere or skipped.
 */
export const MediaProgramMissingEpisode = Comp(({ episode }: MediaProgramMissingEpisodeProps) => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const { css } = useClasses(null);

  const mark = store.getMissingMark(episode.number);
  const subtitle = formatMediaProgramDate(episode.airDate);

  const handleClick = (event: React.MouseEvent) =>
    store.selectMissingEpisode({ hasShift: event.shiftKey, number: episode.number });

  return (
    <FileBase.Container
      height="auto"
      onClick={handleClick}
      selected={store.selectedMissingNumbers.includes(episode.number)}
    >
      <View
        column
        position="relative"
        align="center"
        justify="center"
        overflow="hidden"
        className={css.thumb}
      >
        <Icon name="VideocamOff" size="2.5rem" color={colors.custom.grey} />

        <FileBase.Chip
          position="top-right"
          size="small"
          label={`EP ${episode.number}`}
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
            <FileBase.FooterText
              text={episode.title ?? `Episode ${episode.number}`}
              noTooltip
              textProps={{ fontWeight: 600 }}
            />

            <FileBase.FooterText
              text={subtitle}
              noTooltip
              textProps={{ color: colors.custom.lightGrey, fontSize: "0.75em" }}
            />
          </View>
        </FileBase.Footer>
      </View>
    </FileBase.Container>
  );
});

export interface MediaProgramMissingSeasonProps {
  onClick: (number: number) => void;
  season: MediaProgramMetaSeason;
}

/**
 * A season the metadata source lists that the program has no files for, beside its seasons.
 * Selecting it shows its episodes, each of them missing.
 */
export const MediaProgramMissingSeason = Comp(
  ({ onClick, season }: MediaProgramMissingSeasonProps) => {
    const stores = useStores();
    const store = stores.mediaProgram.editor;

    const handleClick = () => onClick(season.number);

    return (
      <FileBase.Container
        width="12rem"
        height="17.5rem"
        flex="none"
        onClick={handleClick}
        selected={store.activeMissingSeason?.number === season.number}
      >
        <View column flex={1} align="center" justify="center">
          <Icon name="Movie" size="2.5rem" color={colors.custom.grey} />
        </View>

        <MediaProgramMissingChip position="top-left" size="small" />

        {season.episodes.length > 0 && (
          <FileBase.Chip
            position="top-right"
            size="small"
            label={`${Fmt.commas(season.episodes.length)} Episodes`}
            color={colors.custom.white}
          />
        )}

        <FileBase.Footer height={season.title ? "3rem" : "1.8rem"}>
          <View column width="100%" overflow="hidden">
            <FileBase.FooterText
              text={makeSeasonLabel(season.number)}
              textProps={{ fontWeight: 600 }}
            />

            {season.title && (
              <FileBase.FooterText
                text={season.title}
                textProps={{ color: colors.custom.lightGrey, fontSize: "0.75em" }}
              />
            )}
          </View>
        </FileBase.Footer>
      </FileBase.Container>
    );
  },
);

const useClasses = makeClasses({
  thumb: {
    aspectRatio: "16 / 9",
    borderRadius: "inherit",
  },
});
