import { useEffect, useState } from "react";
import { dialog } from "@electron/remote";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Checkbox, ImportBatch, TagInput, Text } from "components";
import { dayjs, dirToFileImports, filePathsToImports, makeClasses } from "utils";
import { createImportBatch } from "database";

interface ImporterProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const Importer = observer(({ isOpen = false, setIsOpen }: ImporterProps) => {
  const { importStore, tagStore } = useStores();
  const { css } = useClasses(null);

  const [tags, setTags] = useState<TagOption[]>([]);

  useEffect(() => {
    if (isOpen) setTags([]);
  }, [isOpen]);

  const handleClose = () => setIsOpen(false);

  const importFiles = async (isDir = false) => {
    try {
      const res = await dialog.showOpenDialog({
        properties: isDir ? ["openDirectory"] : ["openFile", "multiSelections"],
      });
      if (res.canceled) return;

      const addedAt = dayjs().toISOString();
      const fileImports = await (isDir
        ? dirToFileImports(res.filePaths[0])
        : filePathsToImports(res.filePaths));
      const tagIds = [...tags].map((t) => t.id);

      const batchRes = await createImportBatch(addedAt, fileImports, tagIds);
      if (!batchRes.success) throw new Error(batchRes?.error);

      setTags([]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} scroll="paper">
      <DialogTitle className={css.dialogTitle}>Import Files</DialogTitle>

      <DialogContent dividers className={css.dialogContent}>
        {importStore.batches?.length > 0 ? (
          importStore.batches.map((batch) => (
            <ImportBatch key={batch.addedAt} addedAt={batch.addedAt} />
          ))
        ) : (
          <Text color={colors.grey["300"]}>No Imports</Text>
        )}
      </DialogContent>

      <Text align="center" className={css.sectionTitle}>
        Add Tags
      </Text>
      <TagInput
        value={tags}
        setValue={setTags}
        options={tagStore.tagOptions}
        className={css.input}
      />

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
    maxHeight: "30rem",
    overflowX: "hidden",
  },
  dialogTitle: {
    margin: 0,
    padding: "0.5rem 0",
    textAlign: "center",
  },
  input: {
    margin: "0 1rem 0.5rem",
    width: "20rem",
  },
  sectionTitle: {
    marginTop: "0.3rem",
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
