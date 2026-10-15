import { useEffect, useRef } from "react";
import {
  Button,
  Card,
  CardGrid,
  Chip,
  Comp,
  MediaProgramCard,
  MediaProgramFilterMenu,
  Modal,
  MultiActionButton,
  Pagination,
  SearchLoadingOverlay,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export const MediaProgramManager = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.manager;

  const cardsRef = useRef<HTMLDivElement>(null);

  const hasSelection = store.search.selectedIds.length > 0;
  const page = store.search.page;
  const pageCount = store.search.pageCount;

  useEffect(() => {
    store.search.loadFiltered({ page: 1 });
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

  const handleClose = () => {
    if (store.isLoading) return;

    store.search.cancelLoad();
    store.setIsOpen(false);
  };

  const handleDelete = () => {
    stores.mediaProgram.setIdsForConfirmDelete([...store.search.selectedIds]);
    stores.mediaProgram.setIsConfirmDeleteOpen(true);
  };

  const handleFullPageLoad = () => store.search.loadFiltered({ toLastPage: true });

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

  const handlePageChange = (page: number) => store.search.loadFiltered({ page });

  const handleRefreshMeta = async () => {
    const res = await stores.mediaProgram.regenMediaProgramMeta([...store.search.selectedIds]);

    if (!res.success) toast.error(res.error);
  };

  return (
    <Modal.Container isLoading={store.isLoading} onClose={handleClose} height="100%" width="100%">
      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        <Card
          flex={1}
          height="100%"
          overflow="hidden"
          padding={{ all: 0 }}
          bgColor={colors.background}
          headerProps={{ flex: "none" }}
          header={
            <UniformList row flex={1} justify="space-between" padding={{ all: "0.3rem" }}>
              <View row align="center" spacing="0.5rem">
                <MediaProgramFilterMenu store={store.search} />

                {hasSelection && <Chip label={`${store.search.selectedIds.length} Selected`} />}
              </View>

              <View row justify="center" align="center">
                <Text preset="title">{"Media Programs"}</Text>
              </View>

              <View row justify="flex-end">
                <MultiActionButton
                  name="Delete"
                  tooltip="Delete"
                  iconProps={{ color: colors.custom.red }}
                  onClick={handleDelete}
                  disabled={!hasSelection}
                />

                <MultiActionButton
                  name="Refresh"
                  tooltip="Refresh Metadata"
                  onClick={handleRefreshMeta}
                  disabled={!hasSelection}
                />
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
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button
          text="New Media Program"
          icon="Add"
          onClick={handleNew}
          colorOnHover={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
