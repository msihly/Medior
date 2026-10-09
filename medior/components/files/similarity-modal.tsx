import { useRef, useState } from "react";
import {
  Button,
  CardGrid,
  Comp,
  HomeMultiActionBar,
  Modal,
  Pagination,
  SearchLoadingOverlay,
  Text,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { FileCard } from "./file-card";
import { SimilarityLoadMoreModal } from "./similarity-load-more-modal";

export const SimilarityModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.similarity;

  const [isLoadMoreOpen, setIsLoadMoreOpen] = useState(false);

  const filesRef = useRef<HTMLDivElement>(null);

  const handlePageChange = async (page: number) => {
    await store.search.loadFiltered({ page });
    filesRef.current?.scrollTo({ top: 0 });
  };

  const handleLoadMore = () => setIsLoadMoreOpen(true);

  const handleRefresh = () => store.loadSimilar();

  const handleScanVariants = () => stores.file.lowerResolution.open(store.activeFileId);

  return (
    <Modal.Container height="100%" width="100%" onClose={store.close}>
      <SearchLoadingOverlay
        isLoading={store.isLoading || store.search.isLoading}
        onCancel={store.cancelLoad}
        store={store.search}
      />

      <Modal.Header>
        <Text preset="title">{"Similarity Lookup"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }} spacing={0}>
        <HomeMultiActionBar isHome store={store.search} />

        <CardGrid
          padding={{ all: "0.3rem" }}
          ref={filesRef}
          cards={store.search.results.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              store={store.search}
              carouselFileIds={store.resultIds}
              similarity={store.getCandidate(file.id)}
            />
          ))}
          bgColor={colors.custom.black}
          noResultsText={store.error || "No similar files found"}
        />

        <Pagination
          inline
          count={store.search.pageCount}
          page={store.search.page}
          onChange={handlePageChange}
        />
      </Modal.Content>

      <Modal.Footer>
        <Button text="Find Variants" icon="ImageSearch" onClick={handleScanVariants} />

        {store.hasMore && (
          <Button text="Load More" icon="Add" onClick={handleLoadMore} disabled={store.isLoading} />
        )}

        <Button text="Refresh" icon="Refresh" onClick={handleRefresh} disabled={store.isLoading} />

        <Button text="Close" icon="Close" onClick={store.close} disabled={store.isLoading} />
      </Modal.Footer>

      {isLoadMoreOpen && <SimilarityLoadMoreModal onClose={() => setIsLoadMoreOpen(false)} />}
    </Modal.Container>
  );
});
