import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  Comp,
  ConfirmModal,
  getWatchStatusMeta,
  ListItem,
  LoadingOverlay,
  MediaProgramCard,
  MediaProgramFilterMenu,
  MediaProgramRankingExportModal,
  MediaProgramRankings,
  MenuButton,
  Modal,
  MultiActionButton,
  Pagination,
  SEARCH_HEADER_PROPS,
  SearchLoadingOverlay,
  SelectionButtons,
  Text,
  UniformList,
  useMediaProgramHotkeys,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { MEDIA_PROGRAM_WATCH_STATUSES, MediaProgramWatchStatus } from "medior/utils/common";

/** Browses the media programs, or ranks them with the header's Rankings toggle. */
export const MediaProgramManager = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.manager;
  const rankings = stores.mediaProgram.rankings;

  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);

  const discardOrder = async () => {
    const res = await rankings.discardOrder();
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleCancel = () => setIsConfirmDiscardOpen(true);

  const handleExport = () => rankings.setIsExportOpen(true);

  const handleNew = async () => {
    store.setIsLoading(true);

    try {
      const res = await stores.mediaProgram.createMediaProgram("Untitled Program");

      if (!res.success) throw new Error(res.error);

      stores.mediaProgram.editor.setIsOpen(true);

      const loaded = await stores.mediaProgram.editor.loadProgram(res.data.id);

      if (!loaded.success) throw new Error(loaded.error);
    } catch (error) {
      toast.error(error);
    } finally {
      store.setIsLoading(false);
    }
  };

  const handleSaveOrder = async () => {
    const res = await rankings.saveOrder();
    if (!res.success) toast.error(res.error);
    else toast.success("Ranking saved");
  };

  return (
    <>
      <LoadingOverlay isLoading={store.isLoading || rankings.isSaving} />

      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        {store.isRankingsView ? <MediaProgramRankings /> : <ProgramsView />}
      </Modal.Content>

      <Modal.Footer>
        {store.isRankingsView ? (
          <>
            <Button
              text="Cancel"
              icon="Close"
              onClick={handleCancel}
              disabled={!rankings.hasUnsavedChanges || rankings.isLoading}
              colorOnHover={colors.custom.red}
            />

            <Button
              text="Export"
              icon="IosShare"
              onClick={handleExport}
              disabled={rankings.isLoading || !rankings.rankedIds.length}
              colorOnHover={colors.custom.blue}
            />

            <Button
              text="Save Order"
              icon="Save"
              onClick={handleSaveOrder}
              disabled={!rankings.canSaveOrder || rankings.isLoading}
              color={colors.custom.purple}
            />
          </>
        ) : (
          <Button text="Create" icon="Add" onClick={handleNew} colorOnHover={colors.custom.blue} />
        )}
      </Modal.Footer>

      {rankings.isExportOpen && <MediaProgramRankingExportModal />}

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to discard the unsaved order?"
          confirmText="Discard"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={discardOrder}
        />
      )}
    </>
  );
});

/**
 * Switches the Media Programs view between browsing and ranking. The rankings load when first
 * shown and keep their unsaved order while the programs are.
 */
export const MediaProgramRankingsToggle = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.manager;
  const rankings = stores.mediaProgram.rankings;

  const handleToggle = async () => {
    const isRankingsView = !store.isRankingsView;
    store.setIsRankingsView(isRankingsView);

    if (isRankingsView && !rankings.isOpen) {
      rankings.setIsOpen(true);

      const res = await rankings.loadRanking();
      if (!res.success) toast.error(res.error);
    }
  };

  return (
    <Button
      text="Rankings"
      icon="EmojiEvents"
      onClick={handleToggle}
      color={store.isRankingsView ? colors.control : "transparent"}
      colorOnHover={colors.control}
      textColor={store.isRankingsView ? colors.custom.white : colors.custom.lightGrey}
    />
  );
});

const ProgramsView = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.manager;

  const cardsRef = useRef<HTMLDivElement>(null);

  const handleKeyPress = useMediaProgramHotkeys({
    itemLabel: "programs",
    rate: (id, rating) => stores.mediaProgram.updateMediaProgram({ id, updates: { rating } }),
    search: store.search,
  });

  const hasSelection = store.search.selectedIds.length > 0;
  const page = store.search.page;
  const pageCount = store.search.pageCount;

  // Opening the view starts on the first page; returning from the rankings keeps the page.
  useEffect(() => {
    handlePageChange(page);
  }, []);

  useEffect(() => {
    cardsRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [page, pageCount]);

  useEffect(() => {
    if (
      !store.search.isLoading &&
      !store.search.isPageCountLoading &&
      page > Math.max(pageCount, 1)
    )
      handlePageChange(Math.max(pageCount, 1));
  }, [store.search.isLoading, store.search.isPageCountLoading, page, pageCount]);

  const handleDelete = () => {
    stores.mediaProgram.setIdsForConfirmDelete([...store.search.selectedIds]);
    stores.mediaProgram.setIsConfirmDeleteOpen(true);
  };

  const handleFullPageLoad = async () => {
    const res = await store.search.loadFiltered({ toLastPage: true });
    if (!res.success) toast.error(res.error);
  };

  const handlePageChange = async (page: number) => {
    const res = await store.search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
  };

  const handleRefreshMeta = async () => {
    const res = await stores.mediaProgram.regenMediaProgramMeta([...store.search.selectedIds]);

    if (!res.success) toast.error(res.error);
  };

  const handleWatchStatus = async (watchStatus: MediaProgramWatchStatus) => {
    const res = await stores.mediaProgram.setWatchStatus({
      ids: [...store.search.selectedIds],
      watchStatus,
    });
    if (!res.success) toast.error(res.error);
  };

  return (
    <Card
      flex={1}
      height="100%"
      overflow="hidden"
      padding={{ all: 0 }}
      bgColor={colors.background}
      headerProps={SEARCH_HEADER_PROPS}
      header={
        <UniformList row flex={1} justify="space-between">
          <View row align="center" spacing="0.5rem">
            <MediaProgramFilterMenu store={store.search} />

            <MediaProgramRankingsToggle />

            {hasSelection && <Chip label={`${store.search.selectedIds.length} Selected`} />}
          </View>

          <View row justify="center" align="center">
            <Text preset="title">{"Media Programs"}</Text>
          </View>

          <View row justify="flex-end">
            <MultiActionButton
              name="Delete"
              tooltip="Delete"
              iconProps={{ color: hasSelection ? colors.custom.red : colors.custom.grey }}
              onClick={handleDelete}
              disabled={!hasSelection}
            />

            <MultiActionButton
              name="Refresh"
              tooltip="Refresh Metadata"
              onClick={handleRefreshMeta}
              disabled={!hasSelection}
            />

            <MenuButton
              icon="Visibility"
              tooltip="Set Watch Status"
              tooltipProps={{ placement: "bottom" }}
              disabled={!hasSelection}
            >
              {(onClose) =>
                MEDIA_PROGRAM_WATCH_STATUSES.map(({ label, value }) => (
                  <ListItem
                    key={value}
                    text={label}
                    icon="Circle"
                    iconProps={{ color: getWatchStatusMeta(value, false).bgColor }}
                    onClick={() => {
                      onClose();
                      handleWatchStatus(value);
                    }}
                  />
                ))
              }
            </MenuButton>

            <SelectionButtons itemLabel="programs" store={store.search} toast={toast} />
          </View>
        </UniformList>
      }
    >
      <View flex={1} position="relative" overflow="hidden">
        <SearchLoadingOverlay store={store.search} />

        <CardGrid
          ref={cardsRef}
          cards={store.search.results.map((program) => (
            <MediaProgramCard key={program.id} program={program} />
          ))}
          cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
          maxCards={8}
          noResultsText="No media programs found"
          height="100%"
        />
      </View>

      <Pagination
        inline
        count={pageCount}
        page={page}
        onChange={handlePageChange}
        isLoading={store.search.isPageCountLoading && !store.search.isLoading}
        onFullLoad={handleFullPageLoad}
      />
    </Card>
  );
});
