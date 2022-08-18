import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FileIdIndex } from "store/collections";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, FileGrid, Input, Tag, TagInput, Text, View } from "components";
import { makeClasses } from "utils";

const FileCollectionEditor = observer(() => {
  const { fileCollectionStore, fileStore, tagStore } = useStores();
  const { classes: css } = useClasses(null);

  const [fileIdIndexes, setFileIdIndexes] = useState<FileIdIndex[]>(
    fileCollectionStore.activeCollection?.fileIdIndexes ?? []
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [title, setTitle] = useState<string>(fileCollectionStore.activeCollection?.title);

  const handleEdit = (fn, ...args) => {
    setHasUnsavedChanges(true);
    fn(...args);
  };

  const handleTitleChange = (val: string) => handleEdit(setTitle, val);

  const tags = useMemo(() => {
    return [...new Set(fileIdIndexes.flatMap((f) => fileStore.getById(f.fileId).tagIds))].map(
      (tagId) => tagStore.getById(tagId)
    );
  }, [fileIdIndexes]);

  const closeModal = () => fileCollectionStore.setIsCollectionEditorOpen(false);

  const handleSave = async () => {};

  return (
    <Dialog open onClose={(_, reason) => reason !== "backdropClick" && closeModal()} scroll="paper">
      <DialogTitle className={css.dialogTitle}>
        {`${fileCollectionStore.activeCollectionId === null ? "Create" : "Edit"} Collection`}
      </DialogTitle>

      <DialogContent dividers={true} className={css.dialogContent}>
        <View row className={css.body}>
          <View column>
            <Input label="Title" value={title} setValue={handleTitleChange} />

            <View className={css.tags}>
              {tags.map((t) => (
                <Tag key={t.id} id={t.id} />
              ))}
            </View>

            <View className={css.collection}>
              {fileIdIndexes.map((f) => (
                <FileGrid key={f.fileId} id={f.fileId} />
              ))}
            </View>
          </View>
        </View>
      </DialogContent>

      <DialogActions className={css.dialogActions}>
        <Button text="Cancel" icon="Close" onClick={closeModal} color={colors.red["800"]} />

        <Button text="Save" icon="Save" onClick={handleSave} disabled={!hasUnsavedChanges} />
      </DialogActions>
    </Dialog>
  );
});

export default FileCollectionEditor;

const useClasses = makeClasses({
  body: {
    minHeight: "10rem",
  },
  collection: {
    display: "flex",
    flex: 1,
    flexFlow: "row wrap",
    borderRadius: "0.3rem",
    padding: "0.5rem",
    minWidth: "15rem",
    backgroundColor: colors.grey["800"],
  },
  dialogActions: {
    justifyContent: "center",
  },
  dialogContent: {
    padding: "0.5rem 1rem",
  },
  dialogTitle: {
    margin: 0,
    padding: "0.5rem 0",
    textAlign: "center",
  },
  files: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    borderRadius: "0.3rem",
    padding: "0.5rem",
    width: "10rem",
    backgroundColor: colors.grey["800"],
  },
  fileInput: {
    width: "10rem",
  },
  fileSearch: {
    marginLeft: "0.5rem",
  },
  input: {
    marginBottom: "0.5rem",
    height: "2.5rem",
  },
  inputTitle: {
    marginTop: "0.3rem",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    fontSize: "0.8em",
  },
  tags: {
    display: "flex",
    flexFlow: "row wrap",
  },
});
