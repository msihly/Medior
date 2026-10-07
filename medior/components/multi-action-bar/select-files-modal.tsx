import { useState } from "react";
import { Button, Comp, Modal, NumInput, SearchLoadingOverlay, Text } from "medior/components";
import { FileSearch, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

interface SelectFilesModalProps {
  onClose: () => void;
  store?: FileSearch;
}

export const SelectFilesModal = Comp(({ onClose, store: suppliedStore }: SelectFilesModalProps) => {
  const stores = useStores();
  const store = suppliedStore ?? stores.file.search;

  const [isSelecting, setIsSelecting] = useState(false);
  const [limit, setLimit] = useState(store.pageSize);

  const hasError = !Number.isSafeInteger(limit) || limit < 1;

  const handleClose = () => {
    if (isSelecting) store.cancelLoad();

    onClose();
  };

  const handleSelect = async () => {
    if (hasError || isSelecting) return;

    setIsSelecting(true);

    const res = await store.selectFirstInQuery(limit);

    setIsSelecting(false);

    if (!res.success) toast.error(res.error);
    else if (res.data !== null) {
      toast.info(`Added ${res.data} files to selection`);
      onClose();
    }
  };

  return (
    <Modal.Container onClose={handleClose} width="24rem">
      <SearchLoadingOverlay isLoading={isSelecting} onCancel={handleClose} store={store} />

      <Modal.Header>
        <Text preset="title">{"Select First Files"}</Text>
      </Modal.Header>

      <Modal.Content row dividers={false} justify="center">
        <NumInput
          placeholder="Limit"
          value={limit}
          setValue={setLimit}
          minValue={1}
          error={hasError}
          helperText="Number of files to select"
          autoFocus
          textAlign="center"
          width="12rem"
          dense
        />
      </Modal.Content>

      <Modal.Footer uniformWidth="7rem">
        <Button text="Cancel" icon="Close" onClick={handleClose} color={colors.foregroundCard} />

        <Button
          text="Select"
          icon="Checklist"
          onClick={handleSelect}
          disabled={hasError || isSelecting}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
