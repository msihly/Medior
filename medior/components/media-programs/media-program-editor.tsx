import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardGrid,
  Comp,
  ConfirmModal,
  Dropdown,
  Input,
  ListItem,
  LoadingOverlay,
  MediaProgramDropdown,
  MediaProgramEpisode,
  MenuButton,
  Modal,
  MultiActionButton,
  NumInput,
  Pagination,
  ProgressBar,
  RatingButton,
  SearchLoadingOverlay,
  TagInput,
  TagRow,
  Text,
  View,
  WatchStatusChip,
} from "medior/components";
import { formatDate } from "medior/components/drawer/activity-meta";
import { MediaProgramStatusUpdates, TagOption, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt, MEDIA_PROGRAM_WATCH_STATUSES, MediaProgramWatchStatus } from "medior/utils/common";

export const MediaProgramEditor = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;

  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);

  const episodesRef = useRef<HTMLDivElement>(null);

  const program = store.program;
  const activeSeasonIndex = store.seasons.findIndex((season) => season.id === store.activeSeasonId);
  const hasSelection = store.search.selectedIds.length > 0;
  const isBusy = store.isLoading || store.isSaving;
  const watchedCount = program?.watchedIdSet.size ?? 0;
  const pageOffset = (store.search.page - 1) * store.search.pageSize;

  useEffect(() => {
    return () => store.cancelLoad();
  }, []);

  useEffect(() => {
    episodesRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [store.activeSeasonId, store.search.page]);

  const confirmClose = () => {
    if (store.isSaving) return;

    if (store.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const handleAddSeasons = () => {
    stores.collection.manager.setSelectedFileIds([]);
    stores.collection.manager.setIsOpen(true);
    stores.collection.manager.setSeasonsProgramId(program.id);
  };

  const handleClose = async () => {
    store.setIsOpen(false);

    return true;
  };

  const handleDelete = () => {
    stores.mediaProgram.setIdsForConfirmDelete([program.id]);
    stores.mediaProgram.setIsConfirmDeleteOpen(true);
  };

  const handleEditSeason = async () => {
    stores.collection.editor.setIsOpen(true);

    const res = await stores.collection.editor.loadCollection(store.activeSeasonId);

    if (!res.success) toast.error(res.error);
  };

  const handleGenres = (genres: TagOption[]) => store.updateDraft({ genres });

  const handleLanguage = (language: string) => store.updateDraft({ language });

  const handleMarkWatched = async (isWatched: boolean) => {
    const res = await store.setEpisodesWatched({
      fileIds: [...store.search.selectedIds],
      isWatched,
    });

    if (!res.success) toast.error(res.error);
  };

  const handleMedium = (medium: string) => store.updateDraft({ medium });

  const handleMoveSeason = async (down: boolean) => {
    const res = await store.moveSeason({ down, id: store.activeSeasonId });

    if (!res.success) toast.error(res.error);
  };

  const handleName = (name: string) => store.updateDraft({ name });

  const handlePageChange = async (page: number) => {
    const res = await store.search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
  };

  const handlePlay = async () => {
    const res = await store.play();

    if (!res.success) toast.error(res.error);
  };

  const handleRating = (rating: number) => handleUpdate({ rating });

  const handleRefreshMeta = async () => {
    const res = await stores.mediaProgram.regenMediaProgramMeta([program.id]);

    if (!res.success) toast.error(res.error);
  };

  const handleRemoveSeason = async () => {
    const res = await store.removeSeason(store.activeSeasonId);

    if (!res.success) toast.error(res.error);
  };

  const handleRewatch = () => handleUpdate({ isRewatching: !program.isRewatching });

  const handleSave = async () => {
    const res = await store.saveProgram();

    if (!res.success) toast.error(res.error);
  };

  const handleSeasonSelect = async (id: string) => {
    store.setActiveSeasonId(id);

    const res = await store.loadEpisodes();

    if (!res.success) toast.error(res.error);
  };

  const handleType = (type: string) => store.updateDraft({ type });

  const handleUpdate = async (updates: MediaProgramStatusUpdates) => {
    const res = await stores.mediaProgram.updateMediaProgram({ id: program.id, updates });

    if (!res.success) toast.error(res.error);
  };

  const handleWatchStatus = (watchStatus: MediaProgramWatchStatus) => handleUpdate({ watchStatus });

  const handleYear = (year: number) => store.updateDraft({ year });

  return (
    <Modal.Container isLoading={store.isSaving} onClose={confirmClose} height="100%" width="100%">
      <LoadingOverlay
        isLoading={store.isLoading && !store.isSaving}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header
        leftNode={
          <Button
            text={watchedCount > 0 ? "Continue" : "Play"}
            icon="PlayArrow"
            onClick={handlePlay}
            disabled={isBusy || !store.episodeIds.length}
            color={colors.custom.blue}
          />
        }
        rightNode={
          program && (
            <View row align="center" spacing="0.5rem">
              <RatingButton rating={program.rating} setRating={handleRating} />

              <WatchStatusChip
                isRewatching={program.isRewatching}
                watchStatus={program.watchStatus}
                opacity={1}
              />

              <MenuButton color={colors.custom.grey}>
                <ListItem
                  text="Delete"
                  icon="Delete"
                  onClick={handleDelete}
                  color={colors.custom.red}
                  iconProps={{ color: colors.custom.red }}
                />

                <ListItem text="Refresh Metadata" icon="Refresh" onClick={handleRefreshMeta} />
              </MenuButton>
            </View>
          )
        }
      >
        <Text preset="title">{"Media Program"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} row spacing="0.5rem">
        <Card width="22rem" flex="none" spacing="0.5rem" overflow="hidden auto">
          <Input
            header="Name"
            value={store.name}
            setValue={handleName}
            error={!store.name.trim()}
          />

          <NumInput
            header="Year"
            value={store.year}
            setValue={handleYear}
            minValue={1800}
            maxValue={9999}
          />

          <MediaProgramDropdown
            field="types"
            header="Type"
            value={store.type}
            setValue={handleType}
          />

          <MediaProgramDropdown
            field="mediums"
            header="Medium"
            value={store.medium}
            setValue={handleMedium}
          />

          <MediaProgramDropdown
            field="languages"
            header="Language"
            value={store.language}
            setValue={handleLanguage}
          />

          <TagInput
            header="Genres"
            value={store.genres}
            onChange={handleGenres}
            hasCreate
            hasEditor
          />

          {program?.tags.length > 0 && <TagRow tags={program.tags} />}

          <Card spacing="0.5rem" bgColor={colors.foregroundCard}>
            <Dropdown
              header="Watch Status"
              options={[...MEDIA_PROGRAM_WATCH_STATUSES]}
              value={program?.watchStatus}
              setValue={handleWatchStatus}
              disabled={isBusy}
            />

            <Button
              text={program?.isRewatching ? "Stop Rewatching" : "Start Rewatching"}
              icon="Replay"
              onClick={handleRewatch}
              disabled={isBusy || (!program?.isRewatching && program?.watchStatus !== "watched")}
              tooltip={
                program?.isRewatching || program?.watchStatus === "watched"
                  ? undefined
                  : "Only watched programs can be rewatched"
              }
              color={program?.isRewatching ? colors.custom.purple : colors.foregroundCard}
            />

            <ProgressBar numerator={watchedCount} denominator={program?.fileCount} withText />

            <Text preset="sub-text-muted">
              {`${Fmt.commas(program?.fileCount ?? 0)} episodes, ${Fmt.bytes(program?.size ?? 0)}`}
            </Text>

            {program?.rewatchCount > 0 && (
              <Text preset="sub-text-muted">{`Rewatched ${program.rewatchCount} times`}</Text>
            )}

            {program?.dateLastWatched && (
              <Text preset="sub-text-muted">{`Last watched ${formatDate(program.dateLastWatched)}`}</Text>
            )}
          </Card>
        </Card>

        <View column flex={1} spacing="0.5rem" overflow="hidden">
          <Card
            row
            flex="none"
            spacing="0.5rem"
            wrap="wrap"
            header={
              <View row align="center" justify="space-between" width="100%">
                <Text preset="title">{"Seasons"}</Text>

                <View row>
                  <MultiActionButton
                    name="Add"
                    tooltip="Add Collections as Seasons"
                    onClick={handleAddSeasons}
                    disabled={isBusy || !program}
                  />

                  <MultiActionButton
                    name="ArrowBack"
                    tooltip="Move Season Earlier"
                    onClick={() => handleMoveSeason(false)}
                    disabled={isBusy || activeSeasonIndex < 1}
                  />

                  <MultiActionButton
                    name="ArrowForward"
                    tooltip="Move Season Later"
                    onClick={() => handleMoveSeason(true)}
                    disabled={
                      isBusy ||
                      activeSeasonIndex < 0 ||
                      activeSeasonIndex >= store.seasons.length - 1
                    }
                  />

                  <MultiActionButton
                    name="Edit"
                    tooltip="Edit Season Collection"
                    onClick={handleEditSeason}
                    disabled={isBusy || activeSeasonIndex < 0}
                  />

                  <MultiActionButton
                    name="LinkOff"
                    tooltip="Remove Season From Program"
                    iconProps={{
                      color:
                        isBusy || activeSeasonIndex < 0 ? colors.custom.grey : colors.custom.red,
                    }}
                    onClick={handleRemoveSeason}
                    disabled={isBusy || activeSeasonIndex < 0}
                  />
                </View>
              </View>
            }
          >
            {!store.seasons.length && (
              <Text preset="sub-text-muted">
                {"Add collections as seasons to build this program."}
              </Text>
            )}

            {store.seasons.map((season) => (
              <Button
                key={season.id}
                text={season.title}
                pill={`${store.getWatchedCount(season)} / ${season.fileCount}`}
                onClick={() => handleSeasonSelect(season.id)}
                color={
                  season.id === store.activeSeasonId ? colors.custom.blue : colors.foregroundCard
                }
                dense
              />
            ))}
          </Card>

          <Card
            flex={1}
            minHeight={0}
            overflow="hidden"
            padding={{ all: 0 }}
            header={
              <View row align="center" justify="space-between" width="100%">
                <Text preset="title">{store.activeSeason?.title ?? "Episodes"}</Text>

                <View row>
                  <MultiActionButton
                    name="CheckCircle"
                    tooltip="Mark Selected Watched"
                    iconProps={{ color: colors.custom.green }}
                    onClick={() => handleMarkWatched(true)}
                    disabled={isBusy || !hasSelection}
                  />

                  <MultiActionButton
                    name="RadioButtonUnchecked"
                    tooltip="Mark Selected Unwatched"
                    onClick={() => handleMarkWatched(false)}
                    disabled={isBusy || !hasSelection}
                  />
                </View>
              </View>
            }
          >
            <SearchLoadingOverlay store={store.search} />

            <CardGrid
              cards={store.search.results.map((file, index) => (
                <MediaProgramEpisode
                  key={file.id}
                  episodeNumber={pageOffset + index + 1}
                  file={file}
                />
              ))}
              maxCards={6}
              noResultsText="No episodes"
              padding={{ all: "0.8rem" }}
              ref={episodesRef}
            />

            <Pagination
              inline
              count={store.search.pageCount}
              page={store.search.page}
              onChange={handlePageChange}
              isLoading={store.search.isPageCountLoading && !store.search.isLoading}
            />
          </Card>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={store.hasUnsavedChanges ? "Cancel" : "Close"}
          icon="Close"
          onClick={confirmClose}
          colorOnHover={store.hasUnsavedChanges ? colors.custom.red : undefined}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!store.hasUnsavedChanges || isBusy || !store.name.trim()}
          color={colors.custom.purple}
        />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to discard changes?"
          confirmText="Discard"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleClose}
        />
      )}
    </Modal.Container>
  );
});
