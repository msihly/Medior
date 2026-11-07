import { useState } from "react";
import {
  Chip,
  Comp,
  ConfirmModal,
  ContextMenu,
  ContextMenuProps,
  FileBase,
  Icon,
  MEDIA_PROGRAM_BORDER,
  MEDIA_PROGRAM_RADIUS,
  MediaProgramMissingSeason,
  MediaProgramRating,
  MediaProgramSeasonModal,
  MediaProgramSection,
  MultiActionButton,
  Text,
  View,
  WatchStatusChip,
} from "medior/components";
import { getRatingMenuItems } from "medior/components/buttons/rating-option-row";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt, MediaProgramSeason } from "medior/utils/common";

/**
 * The program's seasons as posters, with actions on the active season. Ctrl or Shift chooses more
 * seasons, which the watched actions also apply to.
 */
export const MediaProgramSeasons = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);

  const activeSeason = store.activeSeason;
  const isBusy = store.isLoading || store.isSaving;
  const selectedCount = store.selectedSeasonIdSet.size;

  const handleAdd = async (label: string) => {
    const res = await store.addSeason(label);
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleCopyCollections = () => {
    stores.collection.manager.setSelectedFileIds([]);
    stores.collection.manager.setIsOpen(true);
    stores.collection.manager.setSeasonsProgramId(store.program.id);
  };

  const handleMetaOpen = () => stores.mediaProgram.setMetaMatchProgramId(store.program.id);

  /** Shows a season the program has no files for, with each of its episodes missing. */
  const handleMissingSelect = async (number: number) => {
    store.setActiveSeasonId(null);
    store.setActiveMissingSeasonNumber(number);
    store.setSelectedSeasonIds([]);

    const res = await store.loadEpisodes();
    if (!res.success) toast.error(res.error);
  };

  const handleMove = async (id: string, down: boolean) => {
    const res = await store.moveSeason({ down, id });
    if (!res.success) toast.error(res.error);
  };

  const handleRating = async (id: string, rating: number) => {
    const res = await store.rateSeason({ id, rating });
    if (!res.success) toast.error(res.error);
  };

  const handleRemove = async () => {
    const res = await store.removeSeason(activeSeason.id);
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleRename = async (label: string) => {
    const res = await store.renameSeason({ id: activeSeason.id, label });
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleSeasonClick = (id: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.shiftKey) store.chooseSeason({ hasShift: event.shiftKey, id });
    else handleSelect(id);
  };

  /** Shows the season's episodes, leaving it the only season chosen. */
  const handleSelect = async (id: string) => {
    store.setActiveMissingSeasonNumber(null);
    store.setActiveSeasonId(id);
    store.setSelectedSeasonIds([]);

    const res = await store.loadEpisodes();
    if (!res.success) toast.error(res.error);
  };

  /** A season's own menu acts on every chosen season when it's one of them. */
  const handleWatched = async (id: string, isWatched: boolean) => {
    const ids = store.selectedSeasonIdSet.has(id) ? [...store.selectedSeasonIdSet] : [id];

    const res = await store.setSeasonsWatched({ ids, isWatched });
    if (!res.success) toast.error(res.error);
  };

  /** The season becomes the active one, which the confirmation names. */
  const openRemove = (id: string) => {
    handleSelect(id);
    setIsRemoveOpen(true);
  };

  /** The season becomes the active one, whose label the modal edits. */
  const openRename = (id: string) => {
    handleSelect(id);
    setIsRenameOpen(true);
  };

  return (
    <MediaProgramSection
      title="Seasons"
      info={
        <>
          {store.seasons.length > 0 && <Chip label={Fmt.commas(store.seasons.length)} />}

          {selectedCount > 1 && (
            <Chip label={`${Fmt.commas(selectedCount)} Selected`} bgColor={colors.custom.blue} />
          )}
        </>
      }
      actions={
        <>
          <MultiActionButton
            name="Add"
            tooltip="Add Season"
            onClick={() => setIsAddOpen(true)}
            disabled={isBusy || !store.program}
          />

          <MultiActionButton
            name="LibraryAdd"
            tooltip="Copy Collections as Seasons"
            onClick={handleCopyCollections}
            disabled={isBusy || !store.program}
          />

          <MultiActionButton
            name="Edit"
            tooltip="Rename Season"
            onClick={() => setIsRenameOpen(true)}
            disabled={isBusy || !activeSeason}
          />

          <MultiActionButton
            name="ArrowBack"
            tooltip="Move Season Earlier"
            onClick={() => handleMove(activeSeason.id, false)}
            disabled={isBusy || store.activeSeasonIndex < 1}
          />

          <MultiActionButton
            name="ArrowForward"
            tooltip="Move Season Later"
            onClick={() => handleMove(activeSeason.id, true)}
            disabled={
              isBusy ||
              store.activeSeasonIndex < 0 ||
              store.activeSeasonIndex >= store.seasons.length - 1
            }
          />

          <MultiActionButton
            name="CheckCircle"
            tooltip="Mark Selected Seasons Watched"
            iconProps={{
              color: isBusy || !activeSeason ? colors.custom.grey : colors.custom.green,
            }}
            onClick={() => handleWatched(activeSeason.id, true)}
            disabled={isBusy || !activeSeason}
          />

          <MultiActionButton
            name="RadioButtonUnchecked"
            tooltip="Mark Selected Seasons Unwatched"
            onClick={() => handleWatched(activeSeason.id, false)}
            disabled={isBusy || !activeSeason}
          />

          <MultiActionButton
            name="Delete"
            tooltip="Remove Season From Program"
            iconProps={{ color: isBusy || !activeSeason ? colors.custom.grey : colors.custom.red }}
            onClick={() => setIsRemoveOpen(true)}
            disabled={isBusy || !activeSeason}
          />

          {activeSeason && (
            <MediaProgramRating
              rating={activeSeason.rating}
              setRating={(rating) => handleRating(activeSeason.id, rating)}
            />
          )}
        </>
      }
    >
      {store.seasons.length || store.missingSeasons.length ? (
        // File cards space themselves, so the row adds no gap of its own.
        <View row overflow="auto hidden" padding={{ bottom: "0.3rem" }}>
          {store.seasons.map((season) => (
            <SeasonCard
              key={season.id}
              onClick={handleSeasonClick}
              onMatchMeta={handleMetaOpen}
              onMove={handleMove}
              onRate={handleRating}
              onRemove={openRemove}
              onRename={openRename}
              onWatched={handleWatched}
              season={season}
            />
          ))}

          {store.missingSeasons.map((season) => (
            <MediaProgramMissingSeason
              key={season.number}
              onClick={handleMissingSelect}
              season={season}
            />
          ))}
        </View>
      ) : (
        <View
          padding={{ all: "0.75rem" }}
          bgColor={colors.foreground}
          borders={{ all: MEDIA_PROGRAM_BORDER }}
          borderRadiuses={{ all: MEDIA_PROGRAM_RADIUS }}
        >
          <Text color={colors.custom.lightGrey} fontSize="0.85em">
            {"Add a season or copy collections into seasons to build this program."}
          </Text>
        </View>
      )}

      {isAddOpen && (
        <MediaProgramSeasonModal
          headerText="Add Season"
          onSave={handleAdd}
          setVisible={setIsAddOpen}
        />
      )}

      {isRenameOpen && (
        <MediaProgramSeasonModal
          headerText="Rename Season"
          label={activeSeason?.label}
          onSave={handleRename}
          setVisible={setIsRenameOpen}
        />
      )}

      {isRemoveOpen && (
        <ConfirmModal
          headerText="Remove Season"
          subText={`Remove ${activeSeason?.label || "this season"} from the program? Its episode files stay in your library.`}
          confirmText="Remove"
          setVisible={setIsRemoveOpen}
          onConfirm={handleRemove}
        />
      )}
    </MediaProgramSection>
  );
});

interface SeasonCardProps {
  onClick: (id: string, event: React.MouseEvent) => void;
  onMatchMeta: () => void;
  onMove: (id: string, down: boolean) => void;
  onRate: (id: string, rating: number) => void;
  onRemove: (id: string) => void;
  onRename: (id: string) => void;
  onWatched: (id: string, isWatched: boolean) => void;
  season: MediaProgramSeason;
}

/**
 * A season laid out like a file card, with the season actions in its context menu, and the
 * program's metadata match.
 */
const SeasonCard = Comp(
  ({
    onClick,
    onMatchMeta,
    onMove,
    onRate,
    onRemove,
    onRename,
    onWatched,
    season,
  }: SeasonCardProps) => {
    const stores = useStores();
    const store = stores.mediaProgram.editor;

    const posterPath = season.meta?.posterPath ?? store.program?.meta?.posterPath;
    const label = season.label || "Untitled Season";
    const index = store.seasons.findIndex(({ id }) => id === season.id);
    const menuItems: ContextMenuProps["menuItems"] = [
      {
        icon: "CheckCircle",
        iconProps: { color: colors.custom.green },
        label: "Mark Watched",
        onClick: () => onWatched(season.id, true),
      },
      {
        icon: "RadioButtonUnchecked",
        label: "Mark Unwatched",
        onClick: () => onWatched(season.id, false),
      },
      { icon: "Edit", label: "Rename", onClick: () => onRename(season.id) },
      {
        icon: "Star",
        label: "Rate",
        subItems: getRatingMenuItems(stores.home.settings.file.ratingDisplay, (rating) =>
          onRate(season.id, rating),
        ),
      },
      ...((index > 0
        ? [{ icon: "ArrowBack", label: "Move Earlier", onClick: () => onMove(season.id, false) }]
        : []) satisfies ContextMenuProps["menuItems"]),
      ...((index < store.seasons.length - 1
        ? [{ icon: "ArrowForward", label: "Move Later", onClick: () => onMove(season.id, true) }]
        : []) satisfies ContextMenuProps["menuItems"]),
      { icon: "TravelExplore", label: "Match Metadata", onClick: onMatchMeta },
      {
        color: colors.custom.red,
        divider: "top",
        icon: "Delete",
        label: "Remove From Program",
        onClick: () => onRemove(season.id),
      },
    ];

    const handleClick = (event: React.MouseEvent) => onClick(season.id, event);

    return (
      <ContextMenu id={season.id} menuItems={menuItems} flex="none">
        <FileBase.Container
          width="12rem"
          height="17.5rem"
          onClick={handleClick}
          selected={store.selectedSeasonIdSet.has(season.id)}
        >
          {posterPath ? (
            <FileBase.Image thumb={{ path: posterPath }} title={label} fit="cover" />
          ) : (
            <View column flex={1} align="center" justify="center">
              <Icon name="Movie" size="2.5rem" color={colors.custom.grey} />
            </View>
          )}

          <FileBase.RatingChip position="top-left" rating={season.rating} size="small" />

          <WatchStatusChip
            position="top-right"
            size="small"
            total={season.fileIds.length}
            watched={store.getWatchedCount(season)}
          />

          <FileBase.Footer height={season.meta?.title ? "3rem" : "1.8rem"}>
            <View column width="100%" overflow="hidden">
              <FileBase.FooterText text={label} textProps={{ fontWeight: 600 }} />

              {season.meta?.title && (
                <FileBase.FooterText
                  text={season.meta.title}
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
