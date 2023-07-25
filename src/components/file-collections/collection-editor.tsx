import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { FileIdIndex, useStores } from "store";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, FileCard, Input, Tag, View } from "components";
import { makeClasses } from "utils";

export const FileCollectionEditor = observer(() => {
  const { fileCollectionStore, fileStore } = useStores();
  const { css } = useClasses(null);

  const [fileIdIndexes] = useState<FileIdIndex[]>(
    fileCollectionStore.activeCollection?.fileIdIndexes ?? []
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [title, setTitle] = useState<string>(fileCollectionStore.activeCollection?.title);

  const handleTitleChange = (val: string) => {
    setHasUnsavedChanges(true);
    setTitle(val);
  };

  const tagIds = useMemo(() => {
    return [...new Set(fileIdIndexes.flatMap((f) => fileStore.getById(f.fileId).tagIds))];
  }, [fileIdIndexes]);

  const closeModal = () => fileCollectionStore.setIsCollectionEditorOpen(false);

  const handleSave = async () => {};

  return (
    <Dialog open onClose={(_, reason) => reason !== "backdropClick" && closeModal()} scroll="paper">
      <DialogTitle className={css.dialogTitle}>
        {`${fileCollectionStore.activeCollectionId === null ? "Create" : "Edit"} Collection`}
      </DialogTitle>

      <DialogContent dividers className={css.dialogContent}>
        <View row className={css.body}>
          <View column>
            <Input label="Title" value={title} setValue={handleTitleChange} />

            <View className={css.tags}>
              {tagIds.map((id) => (
                <Tag key={id} id={id} />
              ))}
            </View>

            <View className={css.collection}>
              {fileIdIndexes.map((f) => (
                <FileCard key={f.fileId} id={f.fileId} />
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
