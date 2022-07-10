import { useEffect, useState } from "react";
import { remote } from "electron";
import fs from "fs/promises";
import path from "path";
import dirTree from "directory-tree";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { addImportToBatch, createImportBatch, FileImport, ImportQueue } from "database";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, ImportBatch, TagInput, TagOption, Text } from "components";
import { makeClasses } from "utils";
import dayjs from "dayjs";

const Importer = observer(({ isOpen = false, setIsOpen }: any) => {
  const { importStore, tagStore } = useStores();
  const { classes: css } = useClasses(null);

  const [tags, setTags] = useState<TagOption[]>([]);

  useEffect(() => {
    if (isOpen) setTags([]);
  }, [isOpen]);

  const handleClose = () => setIsOpen(false);

  const importFiles = async (isDir = false) => {
    try {
      const res = await remote.dialog.showOpenDialog({
        properties: isDir ? ["openDirectory"] : ["openFile", "multiSelections"],
      });
      if (res.canceled) return;

      const tagIds = tags.map((t) => t.id);
      const addedAt = dayjs().toISOString();

      const batchRes = await createImportBatch(importStore, addedAt, tagIds);
      if (!batchRes.success) throw new Error(batchRes?.error);

      if (isDir) {
        dirTree(
          res.filePaths[0],
          {
            extensions: /\.(jpe?g|png|gif|webp|jif?f|jfif|mp4|webm|mkv)$/,
            attributes: ["birthtime"],
          },
          async (fileObj, _, fileStats) => {
            const fileImport: FileImport = {
              dateCreated: fileStats.birthtime.toISOString(),
              extension: fileObj.extension,
              name: fileObj.name,
              path: fileObj.path,
              size: fileObj.size,
              status: "PENDING",
            };

            ImportQueue.add(() => addImportToBatch(importStore, addedAt, fileImport));
          }
        );
      } else {
        res.filePaths.forEach(async (p) => {
          const { birthtime, size } = await fs.stat(p);

          const fileImport: FileImport = {
            dateCreated: birthtime.toISOString(),
            extension: path.extname(p),
            name: path.parse(p).name,
            path: p,
            size,
            status: "PENDING",
          };

          ImportQueue.add(() => addImportToBatch(importStore, addedAt, fileImport));
        });
      }

      setTags([]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} scroll="paper">
      <DialogTitle className={css.dialogTitle}>Import Files</DialogTitle>

      <DialogContent dividers={true} className={css.dialogContent}>
        {importStore.batches.map((batch) => (
          <ImportBatch key={batch.addedAt} addedAt={batch.addedAt} />
        ))}

        <Text align="center" className={css.sectionTitle}>
          Add Tags
        </Text>

        <TagInput
          value={tags}
          onChange={(val) => setTags(val)}
          options={tagStore.tagOptions}
          className={css.input}
        />
      </DialogContent>

      <DialogActions className={css.dialogActions}>
        <Button onClick={handleClose} color="secondary">
          Cancel
        </Button>

        <Button onClick={() => importFiles(false)} color="primary">
          Files
        </Button>

        <Button onClick={() => importFiles(true)} color="primary">
          Folder
        </Button>
      </DialogActions>
    </Dialog>
  );
});

export default Importer;

const useClasses = makeClasses({
  dialogActions: {
    justifyContent: "center",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem 1rem",
  },
  dialogTitle: {
    margin: 0,
    padding: "0.5rem 0",
    textAlign: "center",
  },
  input: {
    marginBottom: "0.5rem",
    width: "20rem",
  },
  sectionTitle: {
    marginTop: "0.3rem",
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
