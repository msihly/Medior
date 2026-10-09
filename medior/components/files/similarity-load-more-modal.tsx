import { useState } from "react";
import { Button, Comp, Modal, NumInput, Text } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

interface SimilarityLoadMoreModalProps {
  onClose: () => void;
}

export const SimilarityLoadMoreModal = Comp(({ onClose }: SimilarityLoadMoreModalProps) => {
  const stores = useStores();
  const store = stores.file.similarity;

  const [limit, setLimit] = useState(store.search.pageSize);

  const hasError =
    !Number.isSafeInteger(limit) || limit < 1 || limit > CONSTANTS.VECTOR.MAX_SIMILAR_RESULTS;

  const handleLoad = () => {
    store.loadSimilar({ append: true, limit });
    onClose();
  };

  return (
    <Modal.Container onClose={onClose} width="24rem">
      <Modal.Header>
        <Text preset="title">{"Load More"}</Text>
      </Modal.Header>

      <Modal.Content row dividers={false} justify="center">
        <NumInput
          placeholder="Limit"
          value={limit}
          setValue={setLimit}
          minValue={1}
          error={hasError}
          maxValue={CONSTANTS.VECTOR.MAX_SIMILAR_RESULTS}
          autoFocus
          textAlign="center"
          width="10rem"
          dense
        />
      </Modal.Content>

      <Modal.Footer uniformWidth="7rem">
        <Button text="Cancel" icon="Close" onClick={onClose} color={colors.foregroundCard} />

        <Button
          text="Load"
          icon="Add"
          onClick={handleLoad}
          disabled={hasError}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
