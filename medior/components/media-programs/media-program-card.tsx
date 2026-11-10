import {
  Comp,
  ContextMenu,
  FileBase,
  getWatchStatusMeta,
  Icon,
  View,
  WatchStatusChip,
} from "medior/components";
import { getRatingMenuItems } from "medior/components/buttons/rating-option-row";
import { MediaProgram, MediaProgramSearch, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import {
  getMediaProgramDetails,
  MEDIA_PROGRAM_WATCH_STATUSES,
  MediaProgramWatchStatus,
} from "medior/utils/common";

/**
 * Fades in gradually over the footer's top 3rem, easing into the shade, so the title below it always
 * sits on shade, and ends in the card's color.
 */
export const POSTER_FOOTER_BACKGROUND = `linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.25) 1rem, rgba(0, 0, 0, 0.6) 2rem, rgba(0, 0, 0, 0.85) 3rem, ${colors.foreground})`;

export interface MediaProgramCardProps {
  program: MediaProgram;
  /** The program's place in a ranking, marked when it differs from the saved order. */
  rank?: { index: number; isChanged: boolean };
  /** The search the card selects in and loads posters through; the manager's by default. */
  search?: MediaProgramSearch;
}

/** A program laid out like a file card, with its name, details, and genres in the footer. */
export const MediaProgramCard = Comp(({ program, rank, search }: MediaProgramCardProps) => {
  const stores = useStores();
  const store = stores.mediaProgram;

  const programSearch = search ?? store.manager.search;
  const posterPath = program.meta?.posterPath;
  const poster = programSearch.files.get(program.posterFileId);
  const hasGenres = program.genres.length > 0;

  const handleClick = async (event: React.MouseEvent) => {
    const res = await programSearch.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: program.id,
    });

    if (!res?.success) toast.error(res.error);
  };

  const handleDelete = () => {
    store.setIdsForConfirmDelete([program.id]);
    store.setIsConfirmDeleteOpen(true);
  };

  const handleMatchMeta = () => store.setMetaMatchProgramId(program.id);

  const handleOpen = async () => {
    store.editor.setIsOpen(true);

    const res = await store.editor.loadProgram(program.id);

    if (!res.success) toast.error(res.error);
  };

  const handleRating = async (rating: number) => {
    const res = await store.updateMediaProgram({ id: program.id, updates: { rating } });
    if (!res.success) toast.error(res.error);
  };

  const handleRefreshMeta = async () => {
    const res = await store.regenMediaProgramMeta([program.id]);

    if (!res.success) toast.error(res.error);
  };

  const handleWatchStatus = async (watchStatus: MediaProgramWatchStatus) => {
    const res = await store.updateMediaProgram({ id: program.id, updates: { watchStatus } });
    if (!res.success) toast.error(res.error);
  };

  return (
    <ContextMenu
      id={program.id}
      menuItems={[
        { icon: "Edit", label: "Open", onClick: handleOpen },
        {
          icon: "Visibility",
          label: "Watch Status",
          subItems: MEDIA_PROGRAM_WATCH_STATUSES.map(({ label, value }) => ({
            icon: value === program.watchStatus ? "CheckCircle" : "Circle",
            iconProps: { color: getWatchStatusMeta(value, false).bgColor },
            label,
            onClick: () => handleWatchStatus(value),
          })),
        },
        {
          icon: "Star",
          label: "Rate",
          subItems: getRatingMenuItems(stores.home.settings.file.ratingDisplay, handleRating),
        },
        { icon: "TravelExplore", label: "Match Metadata", onClick: handleMatchMeta },
        { icon: "Refresh", label: "Refresh Metadata", onClick: handleRefreshMeta },
        { color: colors.custom.red, icon: "Delete", label: "Delete", onClick: handleDelete },
      ]}
    >
      <FileBase.Container
        height="24rem"
        onClick={handleClick}
        onDoubleClick={handleOpen}
        selected={programSearch.getIsSelected(program.id)}
      >
        {posterPath ? (
          <FileBase.Image thumb={{ path: posterPath }} title={program.name} fit="cover" />
        ) : poster ? (
          <FileBase.Image
            thumb={poster.thumb}
            fileId={poster.id}
            isCorrupted={poster.isCorrupted}
            title={program.name}
            fit="cover"
          />
        ) : (
          <View column flex={1} align="center" justify="center">
            <Icon name="LiveTv" size="3rem" color={colors.custom.grey} />
          </View>
        )}

        <FileBase.RatingChip position="top-left" rating={program.rating} size="small" />

        <WatchStatusChip
          position="top-right"
          size="small"
          isRewatching={program.isRewatching}
          total={program.episodeCounts.total}
          watched={program.episodeCounts.watched}
          watchStatus={program.watchStatus}
        />

        {rank && (
          <FileBase.Chip
            position="bottom-left"
            size="small"
            footerOffset={hasGenres ? "4.6rem" : "2.6rem"}
            label={`#${rank.index + 1}`}
            bgColor={rank.isChanged ? colors.custom.purple : undefined}
            color={colors.custom.white}
          />
        )}

        <FileBase.Footer
          height={hasGenres ? "7.25rem" : "5.5rem"}
          background={POSTER_FOOTER_BACKGROUND}
        >
          <View column width="100%" overflow="hidden">
            <FileBase.FooterText text={program.name} textProps={{ fontWeight: 600 }} />

            <FileBase.FooterText
              text={getMediaProgramDetails(program)}
              textProps={{ color: colors.custom.lightGrey, fontSize: "0.75em" }}
            />

            {hasGenres && <FileBase.Tags compact tags={program.genres} />}
          </View>
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
  );
});
