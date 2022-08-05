import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Text, View } from "components";
import { FileCollection } from ".";
import { makeClasses } from "utils";
import { useMemo } from "react";

const FileCollectionManager = observer(() => {
  const { fileCollectionStore } = useStores();
  const { classes: css } = useClasses(null);

  const collections = useMemo(() => {
    const activeCollectionIds = fileCollectionStore
      .listByFileId(fileCollectionStore.activeFileId)
      .map((c) => c.id);

    return fileCollectionStore.collections
      .reduce((acc, cur) => {
        acc.push({ id: cur.id, isActive: activeCollectionIds.includes(cur.id) });
        return acc;
      }, [] as { id: string; isActive: boolean }[])
      .sort((a, b) => +a.isActive - +b.isActive);
  }, [fileCollectionStore.collections]);

  const closeModal = () => fileCollectionStore.setIsCollectionManagerOpen(false);

  const handleNewCollection = () => {
    fileCollectionStore.setActiveCollectionId(null);
    fileCollectionStore.setIsCollectionEditorOpen(true);
    closeModal();
  };

  const handleSave = async () => {};

  return (
    <Dialog open onClose={closeModal} scroll="paper">
      <DialogTitle className={css.dialogTitle}>Manage Collections</DialogTitle>

      <DialogContent dividers={true} className={css.dialogContent}>
        <View className={css.collections}>
          {collections.length > 0 ? (
            collections.map((c) => <FileCollection key={c.id} id={c.id} active={c.isActive} />)
          ) : (
            <View className={css.emptyContainer}>
              <Text color={colors.grey["600"]}>{"No collections found"}</Text>
            </View>
          )}
        </View>
      </DialogContent>

      <DialogActions className={css.dialogActions}>
        <Button text="Close" icon="Close" onClick={closeModal} color={colors.grey["700"]} />

        <Button
          text="New Collection"
          icon="Add"
          onClick={handleNewCollection}
          color={colors.blueGrey["700"]}
        />

        <Button text="Save" icon="Save" onClick={handleSave} />
      </DialogActions>
    </Dialog>
  );
});

export default FileCollectionManager;

const useClasses = makeClasses({
  collections: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: "0.3rem",
    padding: "0.5rem",
    minHeight: "5rem",
    width: "20rem",
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
  emptyContainer: {
    display: "flex",
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    marginBottom: "0.5rem",
    minWidth: "15rem",
  },
  sectionTitle: {
    marginTop: "0.3rem",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    fontSize: "0.8em",
  },
});
