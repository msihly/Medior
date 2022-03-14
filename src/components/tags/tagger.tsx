import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { editFileTags } from "database";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Text } from "components";
import { TagInput } from ".";
import { makeStyles } from "utils";
import { toast } from "react-toastify";

const TRANSITION_DURATION = 200;

const Tagger = observer(({ isOpen, setIsOpen }: any) => {
  const { fileStore, tagStore } = useStores();
  const { classes: css } = useClasses();

  const activeTagCounts = fileStore.getTagCounts();

  const tagOptions = useMemo(() => {
    return tagStore.tags.reduce((acc, cur) => {
      const tagCount = activeTagCounts.find((t) => t.id === cur.id);
      const label = tagStore.getById(cur.id)?.label;
      acc.push(!tagCount ? { id: cur.id, count: 0, label } : { ...tagCount, label });
      return acc;
    }, []);
  }, [activeTagCounts, tagStore]);

  /* ------------------------------ BEGIN - MODAL ----------------------------- */
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setTimeout(() => setIsMounted(isOpen), TRANSITION_DURATION);
  }, [isOpen]);

  const closeModal = () => setIsOpen(false);
  /* ------------------------------- END - MODAL ------------------------------ */

  /* ------------------------------ BEGIN - FORM ------------------------------ */
  const [addedTags, setAddedTags] = useState([]);
  const [removedTags, setRemovedTags] = useState([]);

  const handleTagAdded = (tags) => {
    setAddedTags(tags);
    setRemovedTags(removedTags.filter((r) => !tags.find((t) => t.id === r.id)));
  };

  const handleTagRemoved = (tags) => {
    setRemovedTags(tags);
    setAddedTags(addedTags.filter((a) => !tags.find((t) => t.id === a.id)));
  };

  const handleSubmit = async () => {
    if (addedTags.length === 0 && removedTags.length === 0)
      return toast.error("You must enter at least one tag");

    await editFileTags(
      fileStore,
      fileStore.selected.map((f) => f.id),
      addedTags.map((t) => t.id),
      removedTags.map((t) => t.id)
    );

    closeModal();
  };
  /* ------------------------------- END - FORM ------------------------------- */

  return (
    isMounted && (
      <Dialog
        open={isOpen}
        onClose={closeModal}
        transitionDuration={TRANSITION_DURATION}
        scroll="paper"
      >
        <DialogTitle className={css.dialogTitle}>Update Tags</DialogTitle>

        <DialogContent dividers={true} className={css.dialogContent}>
          <Text align="center" className={css.sectionTitle}>
            Current Tags
          </Text>
          <TagInput value={fileStore.selectedTagCounts} disabled opaque className={css.input} />

          <Text align="center" className={css.sectionTitle}>
            Added Tags
          </Text>
          <TagInput
            options={tagOptions}
            value={addedTags}
            onChange={handleTagAdded}
            className={css.input}
          />

          <Text align="center" className={css.sectionTitle}>
            Removed Tags
          </Text>
          <TagInput
            options={tagOptions}
            value={removedTags}
            onChange={handleTagRemoved}
            className={css.input}
          />
        </DialogContent>

        <DialogActions className={css.dialogActions}>
          <Button onClick={closeModal} color="secondary">
            Close
          </Button>

          <Button onClick={handleSubmit}>Submit</Button>
        </DialogActions>
      </Dialog>
    )
  );
});

export default Tagger;

const useClasses = makeStyles()({
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
  input: {
    minWidth: "15rem",
  },
  sectionTitle: {
    marginTop: "0.3rem",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    fontSize: "0.8em",
  },
  tagCount: {
    borderRadius: "0.3rem",
    marginRight: "0.5em",
    width: "1.5rem",
    textAlign: "center",
    backgroundColor: colors.blue["800"],
  },
});
