import { useRef, useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Button,
  CenteredText,
  Chip,
  Comp,
  ConfirmModal,
  FileActionButtons,
  ListItem,
  MEDIA_PROGRAM_BUTTON_PROPS,
  MediaProgramEpisode,
  MediaProgramEpisodeNumbering,
  MediaProgramEpisodeNumberModal,
  MediaProgramMissingEpisode,
  MediaProgramSection,
  MenuButton,
  MultiActionButton,
  Pagination,
  SearchLoadingOverlay,
  SelectionButtons,
  SortMenu,
  SortMenuProps,
  useMediaProgramHotkeys,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { Fmt, makeSeasonLabel, MEDIA_PROGRAM_EPISODE_LABELS } from "medior/utils/common";

/** The active season's episodes, with actions on the selected ones. */
export const MediaProgramEpisodes = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const { css } = useClasses(null);

  const [isNumberOpen, setIsNumberOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);

  const handleKeyPress = useMediaProgramHotkeys({
    itemLabel: "episodes",
    rate: (id, rating) => stores.file.setFileRating({ fileIds: [id], rating }),
    search: store.search,
    selection: store.episodeSelection,
  });

  const activeSeason = store.activeSeason;
  const missingSeason = store.activeMissingSeason;
  // A season's episodes without files show among its episodes, so they count among them too.
  const episodeCount = activeSeason
    ? activeSeason.fileIds.length + store.missingEpisodes.length
    : missingSeason?.episodes.length;
  const otherSeasons = store.seasons.filter((season) => season.id !== store.activeSeasonId);
  const selectedCount = store.search.selectedIds.length;
  const selectedMissingCount = store.selectedMissingNumbers.length;
  const isBusy = store.isLoading || store.isSaving;
  const isDisabled = isBusy || !selectedCount;
  // Episodes without files can be marked, but nothing else.
  const isMarkDisabled = isBusy || !(selectedCount || selectedMissingCount);
  const selectedNumbers = store.search.selectedIds
    .map((id) => store.activeEpisodeNumbers.get(id))
    .filter(Boolean);
  const labels = MEDIA_PROGRAM_EPISODE_LABELS.find(({ value }) => value === store.episodeLabels);
  const otherLabels = MEDIA_PROGRAM_EPISODE_LABELS.find((option) => option !== labels);

  const handleLabelsToggle = () => store.setEpisodeLabels(otherLabels.value);

  const handleMarkSkipped = async () => {
    const res = await store.markMissingEpisodes("skipped");
    if (!res.success) toast.error(res.error);
  };

  /** Episodes with files get watch marks, and those without them get watched marks or none. */
  const handleMarkWatched = async (isWatched: boolean) => {
    if (selectedCount) {
      const res = await store.setEpisodesWatched({
        fileIds: [...store.search.selectedIds],
        isWatched,
      });
      if (!res.success) toast.error(res.error);
    }

    if (selectedMissingCount) {
      const res = await store.markMissingEpisodes(isWatched ? "watched" : null);
      if (!res.success) toast.error(res.error);
    }
  };

  const handleMove = async (down: boolean) => {
    const res = await store.moveEpisodes({ delta: 1, down });
    if (!res.success) toast.error(res.error);
  };

  const handleMoveToSeason = async (seasonId: string) => {
    const res = await store.moveEpisodesToSeason(seasonId);
    if (!res.success) toast.error(res.error);
  };

  const handleNumber = async ({ mode, value }: MediaProgramEpisodeNumbering) => {
    const res =
      mode === "names"
        ? await store.numberEpisodesFromNames(value)
        : await store.numberEpisodes(value);
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  /** The new page starts at the top of the episodes, which the pagination below them scrolled past. */
  const handlePageChange = async (page: number) => {
    const res = await store.search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
    else sectionRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  };

  const handleRemove = async () => {
    const res = await store.removeEpisodes();
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleSort = async (sortValue: SortMenuProps["value"]) => {
    const res = await store.sortEpisodes(sortValue);
    if (!res.success) toast.error(res.error);
  };

  return (
    <MediaProgramSection
      ref={sectionRef}
      title={
        activeSeason?.label || (missingSeason ? makeSeasonLabel(missingSeason.number) : "Episodes")
      }
      subtitle={activeSeason?.meta?.title ?? missingSeason?.title}
      info={
        <>
          {episodeCount !== undefined && <Chip label={`${Fmt.commas(episodeCount)} Episodes`} />}

          {selectedCount + selectedMissingCount > 0 && (
            <Chip
              label={`${Fmt.commas(selectedCount + selectedMissingCount)} Selected`}
              bgColor={colors.custom.blue}
            />
          )}
        </>
      }
      actions={
        <>
          <MultiActionButton
            name="CheckCircle"
            tooltip="Mark Selected Watched"
            iconProps={{ color: isMarkDisabled ? colors.custom.grey : colors.custom.green }}
            onClick={() => handleMarkWatched(true)}
            disabled={isMarkDisabled}
          />

          <MultiActionButton
            name="RadioButtonUnchecked"
            tooltip="Mark Selected Unwatched"
            onClick={() => handleMarkWatched(false)}
            disabled={isMarkDisabled}
          />

          <MultiActionButton
            name="SkipNext"
            tooltip="Mark Selected Missing Episodes Skipped"
            onClick={handleMarkSkipped}
            disabled={isBusy || !selectedMissingCount}
          />

          <MultiActionButton
            name="ArrowUpward"
            tooltip="Move Selected Earlier"
            onClick={() => handleMove(false)}
            disabled={isDisabled}
          />

          <MultiActionButton
            name="ArrowDownward"
            tooltip="Move Selected Later"
            onClick={() => handleMove(true)}
            disabled={isDisabled}
          />

          <MultiActionButton
            name="FormatListNumbered"
            tooltip="Number Selected Episodes"
            onClick={() => setIsNumberOpen(true)}
            disabled={isDisabled}
          />

          <MenuButton
            icon="DriveFileMove"
            tooltip="Move Selected to Season"
            tooltipProps={{ placement: "bottom" }}
            disabled={isDisabled || !otherSeasons.length}
          >
            {(onClose) =>
              otherSeasons.map((season) => (
                <ListItem
                  key={season.id}
                  text={season.label || "Untitled Season"}
                  onClick={() => {
                    onClose();
                    handleMoveToSeason(season.id);
                  }}
                />
              ))
            }
          </MenuButton>

          <MultiActionButton
            name="PlaylistRemove"
            tooltip="Remove Selected From Season"
            iconProps={{ color: isDisabled ? colors.custom.grey : colors.custom.red }}
            onClick={() => setIsRemoveOpen(true)}
            disabled={isDisabled}
          />

          <FileActionButtons isHome store={store.search} />

          <SelectionButtons itemLabel="episodes" store={store.episodeSelection} toast={toast} />

          <Button
            {...MEDIA_PROGRAM_BUTTON_PROPS}
            text={labels.label}
            icon="Numbers"
            tooltip={`Label Episodes as ${otherLabels.label}`}
            onClick={handleLabelsToggle}
            margins={{ left: "0.3rem", right: "0.5rem" }}
          />

          <SortMenu
            value={store.episodeSort}
            setValue={handleSort}
            rows={SORT_OPTIONS.MediaProgramEpisode}
            width="9rem"
            disabled={isBusy}
          />
        </>
      }
    >
      <View column position="relative" minHeight="10rem" spacing="0.75rem">
        <SearchLoadingOverlay store={store.search} />

        {store.pageEpisodes.length ? (
          <View tabIndex={1} onKeyDown={handleKeyPress} className={css.grid}>
            {store.pageEpisodes.map((item) =>
              "file" in item ? (
                <MediaProgramEpisode
                  key={item.file.id}
                  episodeNumber={item.number}
                  file={item.file}
                />
              ) : (
                <MediaProgramMissingEpisode key={`missing-${item.number}`} episode={item.episode} />
              ),
            )}
          </View>
        ) : (
          <CenteredText
            text={activeSeason || missingSeason ? "No episodes" : "No season selected"}
          />
        )}

        {store.search.pageCount > 1 && (
          <Pagination
            inline
            count={store.search.pageCount}
            page={store.search.page}
            onChange={handlePageChange}
            isLoading={store.search.isPageCountLoading && !store.search.isLoading}
          />
        )}
      </View>

      {isNumberOpen && (
        <MediaProgramEpisodeNumberModal
          count={selectedCount}
          firstNumber={selectedNumbers.length ? Math.min(...selectedNumbers) : 1}
          onSave={handleNumber}
          setVisible={setIsNumberOpen}
        />
      )}

      {isRemoveOpen && (
        <ConfirmModal
          headerText="Remove Episodes"
          subText={`Remove ${Fmt.commas(selectedCount)} episodes from ${activeSeason?.label || "this season"}? Their files stay in your library.`}
          confirmText="Remove"
          setVisible={setIsRemoveOpen}
          onConfirm={handleRemove}
        />
      )}
    </MediaProgramSection>
  );
});

const useClasses = makeClasses({
  // File cards space themselves, so the grid adds no gap of its own.
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
  },
});
