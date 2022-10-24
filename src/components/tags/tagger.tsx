import { useRef, useState } from "react";
import { editFileTags } from "database";
import { observer } from "mobx-react-lite";
import { File, TagOption, useStores } from "store";
import Draggable from "react-draggable";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  colors,
  Paper,
  PaperProps,
} from "@mui/material";
import { Button, TagInput, Text, View } from "components";
import { TagEditor } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

interface TaggerProps {
  files: File[];
  hasFocusOnOpen?: boolean;
}

export const Tagger = observer(({ files, hasFocusOnOpen = false }: TaggerProps) => {
  const { tagStore } = useStores();
  const { css } = useClasses(null);

  const [addedTags, setAddedTags] = useState<TagOption[]>([]);
  const [removedTags, setRemovedTags] = useState<TagOption[]>([]);

  const handleClose = () => tagStore.setIsTaggerOpen(false);

  const handleEditorBack = () => tagStore.setTaggerMode("edit");

  const handleTagAdded = (tags: TagOption[]) => {
    setAddedTags(tags);
    setRemovedTags(removedTags.filter((r) => !tags.find((t) => t.id === r.id)));
  };

  const handleTagRemoved = (tags: TagOption[]) => {
    setRemovedTags(tags);
    setAddedTags(addedTags.filter((a) => !tags.find((t) => t.id === a.id)));
  };

  const handleSubmit = async () => {
    if (addedTags.length === 0 && removedTags.length === 0)
      return toast.error("You must enter at least one tag");

    await editFileTags(
      files.map((f) => f.id),
      addedTags.map((t) => t.id),
      removedTags.map((t) => t.id)
    );

    handleClose();
  };

  const openTagEditor = () => tagStore.setTaggerMode("create");

  return (
    <Dialog open onClose={handleClose} scroll="paper" PaperComponent={DraggablePaper}>
      <DialogTitle className={css.dialogTitle}>
        {tagStore.taggerMode === "create" ? "Create Tag" : "Update Tags"}
      </DialogTitle>

      {tagStore.taggerMode === "edit" ? (
        <>
          <DialogContent dividers className={css.dialogContent}>
            <View column>
              <Text align="center" className={css.sectionTitle}>
                Current Tags
              </Text>
              <TagInput value={tagStore.getTagCounts(files)} disabled opaque />

              <Text align="center" className={css.sectionTitle}>
                Added Tags
              </Text>
              <TagInput
                value={addedTags}
                setValue={handleTagAdded}
                options={tagStore.tagOptions}
                autoFocus={hasFocusOnOpen}
              />

              <Text align="center" className={css.sectionTitle}>
                Removed Tags
              </Text>
              <TagInput
                value={removedTags}
                setValue={handleTagRemoved}
                options={tagStore.tagOptions}
              />
            </View>
          </DialogContent>

          <DialogActions className={css.dialogActions}>
            <Button text="Close" icon="Close" onClick={handleClose} color={colors.grey["700"]} />

            <Button
              text="New Tag"
              icon="Add"
              onClick={openTagEditor}
              color={colors.blueGrey["700"]}
            />

            <Button text="Submit" icon="Check" onClick={handleSubmit} />
          </DialogActions>
        </>
      ) : (
        <TagEditor isCreate onCancel={handleEditorBack} onSave={handleEditorBack} />
      )}
    </Dialog>
  );
});

const DraggablePaper = (props: PaperProps) => {
  const { css } = useClasses(null);
  const ref = useRef(null);

  return (
    <Draggable nodeRef={ref} cancel={'[class*="MuiDialogContent-root"]'}>
      <Paper {...props} ref={ref} className={css.draggablePaper} />
    </Draggable>
  );
};

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
  draggablePaper: {
    maxWidth: "28rem",
    cursor: "grab",
  },
  sectionTitle: {
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
