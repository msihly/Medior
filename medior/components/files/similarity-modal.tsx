import { Button, CardGrid, Comp, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { FileCard } from "./file-card";

export const SimilarityModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.similarity;
  const sourceFile = store.activeFileId ? stores.file.getById(store.activeFileId) : null;

  const handleRefresh = () => void store.loadSimilar();

  return (
    <Modal.Container height="100%" width="100%" isLoading={store.isLoading} onClose={store.close}>
      <Modal.Header>
        <View column>
          <Text preset="title">{"Similarity Lookup"}</Text>

          {sourceFile && <Text preset="sub-text">{sourceFile.originalName}</Text>}
        </View>
      </Modal.Header>

      <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }}>
        <CardGrid
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
      </Modal.Content>

      <Modal.Footer>
        <Button text="Refresh" icon="Refresh" onClick={handleRefresh} disabled={store.isLoading} />

        <Button text="Close" icon="Close" onClick={store.close} disabled={store.isLoading} />
      </Modal.Footer>
    </Modal.Container>
  );
});
