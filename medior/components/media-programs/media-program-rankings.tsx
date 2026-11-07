import { useEffect, useRef, useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  CardGrid,
  Chip,
  Comp,
  MediaProgramCard,
  MediaProgramFilterMenu,
  MediaProgramRankingsToggle,
  MultiActionButton,
  NumInput,
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

/** The Media Programs modal's ranking of the programs its filters match. */
export const MediaProgramRankings = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.rankings;

  const [maxDelta, setMaxDelta] = useState<number>(null);

  const cardsRef = useRef<HTMLDivElement>(null);

  const handleKeyPress = useMediaProgramHotkeys({
    itemLabel: "programs",
    rate: (id, rating) => stores.mediaProgram.updateMediaProgram({ id, updates: { rating } }),
    search: store.search,
  });

  const hasNoSelection = store.search.selectedIds.length === 0;
  // A move reloads the current page, which would undo a page change still loading.
  const isMoveDisabled = hasNoSelection || store.isLoading || store.search.isLoading;
  const page = store.search.page;
  const pageCount = store.search.pageCount;

  useEffect(() => {
    cardsRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [page, pageCount]);

  useEffect(() => {
    if (
      !store.isLoading &&
      !store.search.isLoading &&
      !store.search.isPageCountLoading &&
      page > Math.max(pageCount, 1)
    )
      handlePageChange(Math.max(pageCount, 1));
  }, [store.isLoading, store.search.isLoading, store.search.isPageCountLoading, page, pageCount]);

  const handleFullPageLoad = async () => {
    const res = await store.search.loadFiltered({ toLastPage: true });
    if (!res.success) toast.error(res.error);
  };

  const handleMoveDown = () => moveRankedIds(true);

  const handleMoveUp = () => moveRankedIds(false);

  const handlePageChange = async (page: number) => {
    const res = await store.search.loadFiltered({ page });
    if (!res.success) toast.error(res.error);
  };

  const handleSearch = async () => {
    const res = await store.loadRanking();
    if (!res.success) toast.error(res.error);
  };

  const moveRankedIds = async (down: boolean) => {
    const res = await store.moveRankedIds({ down, maxDelta });
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
            <MediaProgramFilterMenu
              store={store.filter}
              resetFn={store.resetFilter}
              searchFn={handleSearch}
              sortOptions={SORT_OPTIONS.MediaProgramRanking}
            />

            <MediaProgramRankingsToggle />

            {!hasNoSelection && <Chip label={`${store.search.selectedIds.length} Selected`} />}
          </View>

          <View row justify="center" align="center">
            <Text preset="title">{store.savedSearch?.label ?? "Rankings"}</Text>
          </View>

          <View row justify="flex-end" align="center">
            <MultiActionButton
              name="ArrowUpward"
              tooltip="Move Up"
              onClick={handleMoveUp}
              disabled={isMoveDisabled}
            />

            <MultiActionButton
              name="ArrowDownward"
              tooltip="Move Down"
              onClick={handleMoveDown}
              disabled={isMoveDisabled}
            />

            <NumInput
              placeholder="Delta"
              value={maxDelta}
              setValue={setMaxDelta}
              minValue={1}
              hasHelper={false}
              width="5rem"
              textAlign="center"
            />

            <SelectionButtons itemLabel="programs" store={store.search} toast={toast} />
          </View>
        </UniformList>
      }
    >
      <View flex={1} position="relative" overflow="hidden">
        <SearchLoadingOverlay
          isLoading={store.isLoading || store.search.isLoading || store.search.isSelecting}
          store={store}
        />

        <CardGrid
          ref={cardsRef}
          cards={store.search.results.map((program) => (
            <MediaProgramCard
              key={program.id}
              program={program}
              rank={{
                index: store.getRankIndex(program.id),
                isChanged: store.getIsRankChanged(program.id),
              }}
              search={store.search}
            />
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
