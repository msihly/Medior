import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, CenteredText, IconButton, ImportBatch, Modal, Text, View } from "components";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const ImportManager = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const completedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (completedRef.current && stores.import.completedBatches?.length)
      completedRef.current.scrollTo({ behavior: "smooth", top: completedRef.current.scrollHeight });
  }, [stores.import.completedBatches?.length]);

  const handleClose = () => {
    stores.import.setIsImportManagerOpen(false);
    stores.home.reloadIfQueued();
  }

  const handleTagManager = () => stores.tagManager.setIsOpen(true);

  return (
    <Modal.Container
      visible={stores.import.isImportManagerOpen}
      onClose={handleClose}
      maxWidth="60rem"
      width="100%"
      height="100%"
    >
      <Modal.Header leftNode={<Button text="Tag Manager" icon="More" onClick={handleTagManager} />}>
        <Text>{"Import Manager"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        <ContainerHeader type="completed" />
        <View ref={completedRef} className={css.batchesContainer} margins={{ bottom: "1rem" }}>
          {stores.import.completedBatches?.length > 0 ? (
            [...stores.import.completedBatches].map((batch) => (
              <ImportBatch key={batch.id} {...{ batch }} />
            ))
          ) : (
            <CenteredText text="No Completed Imports" color={colors.grey["300"]} />
          )}
        </View>

        <ContainerHeader type="pending" />
        <View className={css.batchesContainer}>
          {stores.import.incompleteBatches?.length > 0 ? (
            [...stores.import.incompleteBatches].map((batch) => (
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

interface ContainerHeaderProps {
  type: "completed" | "pending";
}

const ContainerHeader = ({ type }: ContainerHeaderProps) => {
  const { css } = useClasses(null);

  return (
    <View className={css.containerHeader}>
      <View />
      <Text className={css.containerTitle}>{type === "completed" ? "Completed" : "Pending"}</Text>
      <DeleteToggleButton {...{ type }} />
    </View>
  );
};

interface DeleteToggleButtonProps {
  type: "completed" | "pending";
}

const DeleteToggleButton = observer(({ type }: DeleteToggleButtonProps) => {
  const stores = useStores();

  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);

  const deleteAll = async () => {
    await stores.import.deleteImportBatches({
      ids: (type === "completed"
        ? stores.import.completedBatches
        : stores.import.incompleteBatches
      ).map((batch) => batch.id),
    });

    toast.success(`Deleted all ${type} import batches`);
    setIsConfirmDeleteAllOpen(false);
  };

  return (
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
  containerHeader: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.5rem",
    "& > *": {
      width: "calc(100% / 3)",
    },
  },
  containerTitle: {
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
