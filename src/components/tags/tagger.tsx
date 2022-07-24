import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { editFileTags } from "database";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Text, View } from "components";
import { TagEditor, TagInput } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

const TRANSITION_DURATION = 200;

const Tagger = observer(({ isOpen, setIsOpen }: any) => {
  const { fileStore, tagStore } = useStores();
  const { classes: css } = useClasses(null);

  /* ------------------------------ BEGIN - MODAL ----------------------------- */
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setTimeout(() => setIsMounted(isOpen), TRANSITION_DURATION);
  }, [isOpen]);

  const closeModal = () => setIsOpen(false);
  /* ------------------------------- END - MODAL ------------------------------ */

  /* ------------------------------ BEGIN - FORM ------------------------------ */
  const [addedTags, setAddedTags] = useState([]);
  const [isCreateMode, setIsCreateMode] = useState(false);
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
        <DialogTitle className={css.dialogTitle}>
          {isCreateMode ? "Create Tag" : "Update Tags"}
        </DialogTitle>

        {!isCreateMode ? (
          <>
            <DialogContent dividers={true} className={css.dialogContent}>
              <View column>
                <Text align="center" className={css.sectionTitle}>
                  Current Tags
                </Text>
                <TagInput
                  value={tagStore.getTagCounts(fileStore.selected)}
                  disabled
                  opaque
                  className={css.input}
                />

                <Text align="center" className={css.sectionTitle}>
                  Added Tags
                </Text>
                <TagInput
                  value={addedTags}
                  setValue={handleTagAdded}
                  options={tagStore.tagOptions}
                  className={css.input}
                />

                <Text align="center" className={css.sectionTitle}>
                  Removed Tags
                </Text>
                <TagInput
                  value={removedTags}
                  setValue={handleTagRemoved}
                  options={tagStore.tagOptions}
                  className={css.input}
                />
              </View>
            </DialogContent>

            <DialogActions className={css.dialogActions}>
              <Button text="Close" icon="Close" onClick={closeModal} color={colors.red["800"]} />

              <Button
                text="New Tag"
                icon="Add"
                onClick={() => setIsCreateMode(true)}
                color={colors.blueGrey["700"]}
              />

              <Button text="Submit" icon="Check" onClick={handleSubmit} />
            </DialogActions>
          </>
        ) : (
          <TagEditor
            isCreate
            onCancel={() => setIsCreateMode(false)}
            onSave={() => setIsCreateMode(false)}
          />
        )}
      </Dialog>
    )
  );
});

export default Tagger;

const useClasses = makeClasses({
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
    marginBottom: "0.5rem",
    minWidth: "15rem",
  },
  sectionTitle: {
    marginTop: "0.3rem",
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
  tagCount: {
    borderRadius: "0.3rem",
    marginRight: "0.5em",
    width: "1.5rem",
    backgroundColor: colors.blue["800"],
    textAlign: "center",
  },
});
