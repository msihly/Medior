import { dialog } from "@electron/remote";
import { useState } from "react";
import { createImportBatch, deleteAllImportBatches, useFileImportQueue } from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Checkbox, IconButton, ImportBatch, Text, View } from "components";
import { dayjs, dirToFileImports, filePathsToImports, makeClasses } from "utils";
import { toast } from "react-toastify";

interface ImporterProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const Importer = observer(({ isOpen = false, setIsOpen }: ImporterProps) => {
  const { importStore } = useStores();
  const { css } = useClasses(null);

  useFileImportQueue();

  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);

  const deleteAll = async () => {
    await deleteAllImportBatches(importStore);
    toast.success("All import batches deleted");
    setIsConfirmDeleteAllOpen(false);
  };

  const handleClose = () => setIsOpen(false);

  const importFiles = async (isDir = false) => {
    try {
      const res = await dialog.showOpenDialog({
        properties: isDir ? ["openDirectory"] : ["openFile", "multiSelections"],
      });
      if (res.canceled) return;

      const createdAt = dayjs().toISOString();
      const imports = await (isDir
        ? dirToFileImports(res.filePaths[0])
        : filePathsToImports(res.filePaths));

      const batchRes = await createImportBatch({ createdAt, imports, importStore });
      if (!batchRes.success) throw new Error(batchRes?.error);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} scroll="paper">
      <DialogTitle className={css.dialogTitle}>
        <View />

        <Text>{"Import Files"}</Text>

        <View row justify="flex-end" padding={{ right: "1.7rem" }}>
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
      </DialogTitle>

      <DialogContent dividers className={css.dialogContent}>
        {importStore.batches?.length > 0 ? (
          [...importStore.batches]
            .reverse()
            .map((batch) => <ImportBatch key={batch.createdAt} createdAt={batch.createdAt} />)
        ) : (
          <View className={css.emptyContainer}>
            <Text color={colors.grey["300"]}>{"No Imports"}</Text>
          </View>
        )}
      </DialogContent>

      <Checkbox
        label="Delete on Import"
        checked={importStore.deleteOnImport}
        setChecked={(checked) => importStore.setDeleteOnImport(checked)}
        center
      />

      <DialogActions className={css.dialogActions}>
        <Button text="Close" icon="Cancel" onClick={handleClose} color={colors.grey["700"]} />

        <Button text="Files" icon="InsertDriveFile" onClick={() => importFiles(false)} />

        <Button text="Folder" icon="Folder" onClick={() => importFiles(true)} />
      </DialogActions>
    </Dialog>
  );
});

const useClasses = makeClasses({
  dialogActions: {
    justifyContent: "center",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem 1rem",
    height: "15rem",
    width: "25rem",
    overflowX: "hidden",
  },
  dialogTitle: {
    display: "flex",
    justifyContent: "space-between",
    margin: 0,
    padding: "0.5rem 0",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 0 2px black",
    "> *": { flex: "33%" },
  },
  emptyContainer: {
    display: "flex",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    margin: "0 1rem 0.5rem",
    width: "100%",
  },
  sectionTitle: {
    marginTop: "0.3rem",
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
