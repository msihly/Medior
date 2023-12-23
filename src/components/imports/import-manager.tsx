import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, CenteredText, IconButton, ImportBatch, Modal, Text, View } from "components";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const ImportManager = observer(() => {
  const { css } = useClasses(null);

  const { importStore } = useStores();

  const completedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (completedRef.current && importStore.completedBatches?.length)
      completedRef.current.scrollTo({ behavior: "smooth", top: completedRef.current.scrollHeight });
  }, [importStore.completedBatches?.length]);

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
        <Text className={css.containerTitle}>{"Completed"}</Text>
        <View ref={completedRef} className={css.batchesContainer} margins={{ bottom: "1rem" }}>
          {importStore.completedBatches?.length > 0 ? (
            [...importStore.completedBatches].map((batch) => (
              <ImportBatch key={batch.id} {...{ batch }} />
            ))
          ) : (
            <CenteredText text="No Completed Imports" color={colors.grey["300"]} />
          )}
        </View>

        <Text className={css.containerTitle}>{"Pending"}</Text>
        <View className={css.batchesContainer}>
          {importStore.incompleteBatches?.length > 0 ? (
            [...importStore.incompleteBatches].map((batch) => (
              <ImportBatch key={batch.id} {...{ batch }} />
            ))
          ) : (
            <CenteredText text="No Pending Imports" color={colors.grey["300"]} />
          )}
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.button.grey} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  batchesContainer: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "0.5rem",
    padding: "0.7rem",
    height: "100%",
    width: "100%",
    backgroundColor: colors.grey["800"],
    overflowX: "hidden",
    overflowY: "auto",
  },
  containerTitle: {
    marginLeft: "0.3rem",
    fontSize: "1.1em",
    fontWeight: 500,
    textAlign: "center",
    overflow: "visible",
  },
  modalContent: {
    flexDirection: "column",
    padding: "1rem",
    overflowX: "hidden",
    overflowY: "auto",
  },
});
