import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, CenteredText, IconButton, ImportBatch, Modal, Text, View } from "components";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const ImportManager = observer(() => {
  const { importStore } = useStores();
  const { css } = useClasses(null);

  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);

  const deleteAll = async () => {
    await importStore.deleteAllImportBatches();
    toast.success("All import batches deleted");
    setIsConfirmDeleteAllOpen(false);
  };

  const handleClose = () => importStore.setIsImportManagerOpen(false);

  const handleRegExMapper = () => {
    importStore.setIsImportManagerOpen(false);
    importStore.setIsImportRegExMapperOpen(true);
  };

  return (
    <Modal.Container
      visible={importStore.isImportManagerOpen}
      onClose={handleClose}
      width="100%"
      height="100%"
    >
      <Modal.Header
        leftNode={<Button text="RegEx Mapper" icon="MultipleStop" onClick={handleRegExMapper} />}
        rightNode={
          <View row justify="flex-end" padding={{ right: "1rem" }}>
            {!isConfirmDeleteAllOpen ? (
              <IconButton
                name="DeleteOutline"
                onClick={() => setIsConfirmDeleteAllOpen(true)}
                iconProps={{ color: colors.grey["500"], size: "0.9em" }}
              />
            ) : (
              <>
                <IconButton
                  name="CloseOutlined"
                  onClick={() => setIsConfirmDeleteAllOpen(false)}
                  iconProps={{ color: colors.grey["500"], size: "0.9em" }}
                  margins={{ right: "0.1rem" }}
                />

                <IconButton
                  name="Delete"
                  onClick={deleteAll}
                  iconProps={{ color: colors.red["700"], size: "0.9em" }}
                />
              </>
            )}
          </View>
        }
      >
        <Text>{"Import Manager"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        {importStore.batches?.length > 0 ? (
          [...importStore.batches]
            .reverse()
            .map((batch, i) => (
              <ImportBatch key={`${batch.createdAt}-${i}`} createdAt={batch.createdAt} />
            ))
        ) : (
          <CenteredText text="No Imports" color={colors.grey["300"]} />
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.button.grey} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  modalContent: {
    flexDirection: "column",
    alignItems: "center",
    overflowX: "hidden",
  },
});
