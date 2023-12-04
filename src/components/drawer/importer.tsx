import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, Checkbox, IconButton, ImportBatch, Modal, Text, View } from "components";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const Importer = observer(() => {
  const { importStore } = useStores();
  const { css } = useClasses(null);

  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);

  const deleteAll = async () => {
    await importStore.deleteAllImportBatches();
    toast.success("All import batches deleted");
    setIsConfirmDeleteAllOpen(false);
  };

  const handleClose = () => importStore.setIsImporterOpen(false);

  return (
    <Modal.Container
      visible={importStore.isImporterOpen}
      onClose={handleClose}
      width="40rem"
      height="30rem"
    >
      <Modal.Header justify="space-between" className={css.modalHeader}>
        <View />

        <Text>{"Import Files"}</Text>

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
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        {importStore.batches?.length > 0 ? (
          [...importStore.batches]
            .reverse()
            .map((batch, i) => (
              <ImportBatch key={`${batch.createdAt}-${i}`} createdAt={batch.createdAt} />
            ))
        ) : (
          <View className={css.emptyContainer}>
            <Text color={colors.grey["300"]}>{"No Imports"}</Text>
          </View>
        )}
      </Modal.Content>

      <View row>
        <Checkbox
          label="Folders to Tags"
          checked={importStore.folderToTags}
          setChecked={(checked) => importStore.setFolderToTags(checked)}
          center={!importStore.folderToTags}
        />

        <Checkbox
          label="Delete on Import"
          checked={importStore.deleteOnImport}
          setChecked={(checked) => importStore.setDeleteOnImport(checked)}
          center={!importStore.folderToTags}
        />
      </View>

      {importStore.folderToTags && (
        <View row>
          <Checkbox
            label="Parent Folders to Parent Tags"
            checked={importStore.folderToTagsMode === "parent"}
            setChecked={() => importStore.setFolderToTagsMode("parent")}
          />

          <Checkbox
            label="Parent Folders to Multi-Tags"
            checked={importStore.folderToTagsMode === "multi"}
            setChecked={() => importStore.setFolderToTagsMode("multi")}
          />
        </View>
      )}

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.grey["700"]} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  emptyContainer: {
    display: "flex",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    flexDirection: "column",
    alignItems: "center",
    overflowX: "hidden",
  },
  modalHeader: {
    "& > &": {
      flexBasis: "100%",
    },
  },
});
