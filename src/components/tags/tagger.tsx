import { createContext, useContext, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { editFileTags } from "database";
import {
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  colors,
} from "@mui/material";
import { Button, IconButton, Text } from "components";
import { arrayIntersect, makeStyles } from "utils";
import { toast } from "react-toastify";

const TRANSITION_DURATION = 200;

const TagContext = createContext(null);

const Tagger = observer(({ isOpen, setIsOpen }: any) => {
  const { fileStore } = useStores();
  const { classes: css } = useClasses();

  /* ------------------------------ BEGIN - MODAL ----------------------------- */
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setTimeout(() => setIsMounted(isOpen), TRANSITION_DURATION);
  }, [isOpen]);

  const closeModal = () => setIsOpen(false);
  /* ------------------------------- END - MODAL ------------------------------ */

  /* ------------------------------ BEGIN - FORM ------------------------------ */
  const [inputValue, setInputValue] = useState("");

  const [addedTags, setAddedTags] = useState([]);
  const addTag = (tag) => {
    if (removedTags.includes(tag)) setRemovedTags(removedTags.filter((t) => t !== tag));
    if (addedTags.includes(tag)) return;
    setAddedTags([...addedTags, tag]);
  };

  const [removedTags, setRemovedTags] = useState([]);
  const removeTag = (tag) => {
    if (addedTags.includes(tag)) return setAddedTags(addedTags.filter((t) => t !== tag));
    if (removedTags.includes(tag)) return setRemovedTags(removedTags.filter((t) => t !== tag));
    setRemovedTags([...removedTags, tag]);
  };

  const handleSubmit = async () => {
    if (addedTags.length === 0 && removedTags.length === 0)
      return toast.error("You must enter at least one tag");

    const intersection = arrayIntersect(addedTags, removedTags);
    if (intersection.length > 0)
      return toast.warning(`Tags [${intersection}] found in add and remove tables`);

    await editFileTags(
      fileStore,
      fileStore.selected.map((f) => f.id),
      addedTags,
      removedTags
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
          <TagContext.Provider value={{ removeTag }}>
            <Text variant="h6" align="center">
              Current Tags
            </Text>
            <div className={css.tagContainer}>
              {fileStore.selectedTagCounts.map((t) => (
                <Tag key={t.label} text={t.label} count={t.count} removeable />
              ))}
            </div>

            <div className={css.diffRow}>
              <div className={css.diffContainer}>
                <Text variant="h6" align="center">
                  Added Tags
                </Text>

                <div className={css.tagContainer}>
                  {addedTags.map((tag) => (
                    <Tag key={tag} text={tag} removeable />
                  ))}
                </div>
              </div>

              <div className={css.diffContainer}>
                <Text variant="h6" align="center">
                  Removed Tags
                </Text>

                <div className={css.tagContainer}>
                  {removedTags.map((tag) => (
                    <Tag key={tag} text={tag} removeable />
                  ))}
                </div>
              </div>
            </div>

            <div className={css.inputRow}>
              <Autocomplete
                renderInput={(params) => (
                  <TextField {...params} label="Add Tag" variant="outlined" />
                )}
                inputValue={inputValue}
                onInputChange={(_, val) => setInputValue(val)}
                options={fileStore.getTagCounts()}
                size="small"
                freeSolo
                className={css.input}
              />

              <IconButton
                name="Add"
                onClick={() => addTag(inputValue)}
                className={css.addButton}
                size="large"
              />
            </div>
          </TagContext.Provider>
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

const Tag = ({ count = null, removeable = false, text }) => {
  const { removeTag } = useContext(TagContext);
  const { classes: css } = useClasses();

  return (
    <div className={css.tag}>
      {count && <Text className={css.tagCount}>{count}</Text>}
      <Text className={css.tagText}>{text}</Text>
      {removeable && (
        <IconButton name="RemoveCircle" onClick={() => removeTag(text)} size="medium" />
      )}
    </div>
  );
};

const useClasses = makeStyles()({
  addButton: {
    borderRadius: "0.5rem",
    marginLeft: "0.5rem",
    width: "2rem",
    height: "2rem",
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
  diffContainer: {
    width: "10em",
    "&:not(:last-of-type)": {
      marginRight: "1rem",
    },
  },
  diffRow: {
    display: "flex",
    flexFlow: "row nowrap",
    marginBottom: "0.5rem",
  },
  input: {
    flex: 1,
    minWidth: "8em",
  },
  inputRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
  },
  row: {
    display: "flex",
    flexDirection: "row",
  },
  tag: {
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
  },
  tagContainer: {
    borderRadius: "0.5rem",
    padding: "0.5rem",
    height: "5rem",
    backgroundColor: colors.grey["700"],
    overflowY: "auto",
  },
  tagCount: {
    borderRadius: "0.3rem",
    marginRight: "0.5em",
    width: "1.5rem",
    textAlign: "center",
    backgroundColor: colors.blue["800"],
  },
  tagText: {
    flex: 1,
  },
});
