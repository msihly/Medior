import { shell } from "@electron/remote";
import { ReactNode, useState } from "react";
import {
  Button,
  Chip,
  Comp,
  IconButton,
  ListItem,
  MEDIA_PROGRAM_BORDER,
  MEDIA_PROGRAM_BUTTON_PROPS,
  MEDIA_PROGRAM_RADIUS,
  MediaProgramGenresModal,
  MediaProgramSection,
  MenuButton,
  sortTags,
  TagChip,
  Text,
  View,
} from "medior/components";
import { formatDate } from "medior/components/drawer/activity-meta";
import { tagToOption, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { Fmt, formatMediaProgramDate, MEDIA_PROGRAM_META_SOURCES } from "medior/utils/common";

/** The program's details from its metadata source and its viewing history, with its actions. */
export const MediaProgramAbout = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const [isGenresOpen, setIsGenresOpen] = useState(false);

  const program = store.program;
  const canRewatch = program?.isRewatching || program?.watchStatus === "watched";
  const meta = program?.meta;
  const genres = program ? sortTags(program.genres, stores.tag.getCategory) : [];
  // The source's genres follow the program's own, leaving out those it already has.
  const genreLabels = new Set(genres.map(({ label }) => label.toLowerCase()));
  const sourceGenres = (meta?.genres ?? []).filter(
    (genre) => !genreLabels.has(genre.toLowerCase()),
  );
  const sourceLabel = MEDIA_PROGRAM_META_SOURCES.find(({ value }) => value === meta?.source)?.label;
  const startDate = formatMediaProgramDate(meta?.startDate);
  const endDate = formatMediaProgramDate(meta?.endDate);
  const fileCount = Fmt.commas(program?.fileCount ?? 0);
  const rows: { label: string; value: string }[] = [
    {
      label: meta?.source === "anilist" || meta?.isMovie ? "Studio" : "Network",
      value: meta?.network,
    },
    { label: "Format", value: meta?.format },
    { label: "Status", value: meta?.status },
    { label: "Aired", value: startDate ? `${startDate} – ${endDate ?? "Present"}` : null },
    { label: "Score", value: meta?.score ? `${meta.score}%` : null },
    {
      label: "Episodes",
      value: meta?.episodeCount ? `${fileCount} of ${Fmt.commas(meta.episodeCount)}` : fileCount,
    },
    { label: "Size", value: Fmt.bytes(program?.size ?? 0) },
    {
      label: "Watched",
      value: `${Fmt.commas(program?.episodeCounts.watched ?? 0)} of ${Fmt.commas(program?.episodeCounts.total ?? 0)}`,
    },
    {
      label: "Rewatched",
      value: program?.rewatchCount > 0 ? `${Fmt.commas(program.rewatchCount)} times` : null,
    },
    {
      label: "Last Watched",
      value: program?.dateLastWatched ? formatDate(program.dateLastWatched) : null,
    },
  ].filter(({ value }) => value);

  const handleDelete = (onClose: () => void) => {
    onClose();
    stores.mediaProgram.setIdsForConfirmDelete([program.id]);
    stores.mediaProgram.setIsConfirmDeleteOpen(true);
  };

  const handleGenresClose = () => setIsGenresOpen(false);

  const handleGenresOpen = () => {
    store.setGenres(program.genres.map(tagToOption));
    setIsGenresOpen(true);
  };

  const handleMetaModalOpen = (onClose: () => void) => {
    onClose();
    stores.mediaProgram.setMetaMatchProgramId(program.id);
  };

  const handleOpenSource = async () => {
    try {
      await shell.openExternal(meta.url);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleRefreshMeta = async (onClose: () => void) => {
    onClose();

    const res = await stores.mediaProgram.regenMediaProgramMeta([program.id]);
    if (!res.success) toast.error(res.error);
  };

  const handleRewatch = async (onClose: () => void) => {
    onClose();

    const res = await stores.mediaProgram.updateMediaProgram({
      id: program.id,
      updates: { isRewatching: !program.isRewatching },
    });
    if (!res.success) toast.error(res.error);
  };

  return (
    <MediaProgramSection
      title="About"
      flex="none"
      width="16rem"
      actions={
        program && (
          <MenuButton color={colors.custom.lightGrey}>
            {(onClose) => [
              // Only watched programs can be rewatched.
              canRewatch && (
                <ListItem
                  key="rewatch"
                  text={program.isRewatching ? "Stop Rewatching" : "Start Rewatching"}
                  icon="Replay"
                  onClick={() => handleRewatch(onClose)}
                />
              ),
              <ListItem
                key="match"
                text="Match Metadata"
                icon="TravelExplore"
                onClick={() => handleMetaModalOpen(onClose)}
              />,
              <ListItem
                key="refresh"
                text="Refresh Metadata"
                icon="Refresh"
                onClick={() => handleRefreshMeta(onClose)}
              />,
              <ListItem
                key="delete"
                text="Delete"
                icon="Delete"
                onClick={() => handleDelete(onClose)}
                color={colors.custom.red}
                iconProps={{ color: colors.custom.red }}
              />,
            ]}
          </MenuButton>
        )
      }
    >
      <View
        column
        padding={{ all: "0.4rem 0.75rem" }}
        bgColor={colors.foreground}
        borders={{ all: MEDIA_PROGRAM_BORDER }}
        borderRadiuses={{ all: MEDIA_PROGRAM_RADIUS }}
      >
        <AboutRow
          label="Source"
          value={
            <View row align="center" spacing="0.25rem" minWidth={0}>
              <Text fontSize="0.85em" fontWeight={500}>
                {meta ? `${sourceLabel} #${meta.sourceId}` : "Not Matched"}
              </Text>

              {meta?.url && (
                <IconButton
                  name="OpenInNew"
                  size="small"
                  iconProps={{ size: "0.9em" }}
                  tooltip={`Open on ${sourceLabel}`}
                  onClick={handleOpenSource}
                />
              )}
            </View>
          }
        />

        {rows.map(({ label, value }) => (
          <AboutRow
            key={label}
            label={label}
            value={
              <Text fontSize="0.85em" fontWeight={500} textAlign="right" whiteSpace="normal">
                {value}
              </Text>
            }
          />
        ))}
      </View>

      {program && (
        <PillGroup label="Genres">
          {genres.map((genre) => (
            <TagChip key={genre.id} tag={genre} hasEditor />
          ))}

          {sourceGenres.map((genre) => (
            <Chip key={genre} label={genre} />
          ))}

          <Button
            {...MEDIA_PROGRAM_BUTTON_PROPS}
            text={genres.length ? "Edit Genres" : "Add Genres"}
            icon={genres.length ? "Edit" : "Add"}
            onClick={handleGenresOpen}
            textColor={colors.custom.lightGrey}
          />
        </PillGroup>
      )}

      {program?.tags.length > 0 && (
        <PillGroup label="Tags">
          {sortTags(program.tags, stores.tag.getCategory).map((tag) => (
            <TagChip key={tag.id} tag={tag} hasEditor />
          ))}
        </PillGroup>
      )}

      {isGenresOpen && <MediaProgramGenresModal onClose={handleGenresClose} />}
    </MediaProgramSection>
  );
});

interface AboutRowProps {
  label: string;
  value: ReactNode;
}

const AboutRow = Comp(({ label, value }: AboutRowProps) => (
  <View row align="center" justify="space-between" spacing="0.75rem" minHeight="1.6rem">
    <Text color={colors.custom.lightGrey} fontSize="0.8em" flexShrink={0}>
      {label}
    </Text>

    {value}
  </View>
));

interface PillGroupProps {
  children: ReactNode;
  label: string;
}

const PillGroup = Comp(({ children, label }: PillGroupProps) => {
  const { css } = useClasses(null);

  return (
    <View column spacing="0.35rem">
      <Text
        color={colors.custom.lightGrey}
        fontSize="0.7em"
        fontWeight={600}
        textTransform="uppercase"
      >
        {label}
      </Text>

      <View row wrap="wrap" align="center" className={css.pills}>
        {children}
      </View>
    </View>
  );
});

const useClasses = makeClasses({
  pills: {
    gap: "0.3rem",
  },
});
