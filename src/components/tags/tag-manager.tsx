import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Dialog, DialogTitle } from "@mui/material";
import { DirToTag, TagEditor, TagSearch } from ".";
import { makeClasses } from "utils";

const TITLES = {
  create: "Create Tag",
  edit: "Edit Tag",
  search: "Manage Tags",
};

export const TagManager = observer(() => {
  const { tagStore } = useStores();
  const { css } = useClasses(null);

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const handleEditorBack = () => tagStore.setTagManagerMode("search");

  return (
    <Dialog open onClose={closeModal} scroll="paper" PaperProps={{ className: css.dialog }}>
      <DialogTitle className={css.dialogTitle}>{TITLES[tagStore.tagManagerMode]}</DialogTitle>

      {tagStore.tagManagerMode === "search" ? (
        <TagSearch />
      ) : tagStore.tagManagerMode === "dirToTag" ? (
        <DirToTag />
      ) : (
        <TagEditor create={tagStore.tagManagerMode === "create"} goBack={handleEditorBack} />
      )}
    </Dialog>
  );
});

const useClasses = makeClasses({
  dialog: {
    width: "25rem",
  },
  dialogTitle: {
    margin: 0,
    padding: "0.5rem 0",
    textAlign: "center",
  },
});
