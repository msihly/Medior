import { ipcRenderer } from "electron";
import { useMemo, useRef, useState } from "react";
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
  batchId?: string;
  files: File[];
  setVisible: (visible: boolean) => any;
}

export const Tagger = observer(({ batchId, files, setVisible }: TaggerProps) => {
  const { tagStore } = useStores();
  const { css } = useClasses(null);

  const [addedTags, setAddedTags] = useState<TagOption[]>([]);
  const [removedTags, setRemovedTags] = useState<TagOption[]>([]);
  const [mode, setMode] = useState<"create" | "edit">("edit");

  const currentTagOptions = useMemo(() => {
    return [...new Set(files.flatMap((f) => f.tags.map((t) => t.tagOption)))];
  }, [files, tagStore.tagOptions]);

  const handleClose = () => setVisible(false);

  const handleEditorBack = () => setMode("edit");

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

    ipcRenderer.send("editFileTags", {
      addedTagIds: addedTags.map((t) => t.id),
      batchId,
      fileIds: files.map((f) => f.id),
      removedTagIds: removedTags.map((t) => t.id),
    });

    handleClose();
  };

  const openTagEditor = () => setMode("create");

  return (
    <Dialog open onClose={handleClose} scroll="paper" PaperComponent={DraggablePaper}>
      <DialogTitle className={css.dialogTitle}>
        {mode === "create" ? "Create Tag" : "Update Tags"}
      </DialogTitle>

      {mode === "edit" ? (
        <>
          <DialogContent dividers className={css.dialogContent}>
            <View column>
              <Text align="center" className={css.sectionTitle}>
                {"Current Tags"}
              </Text>
              <TagInput value={currentTagOptions} disabled opaque className={css.tagInput} />

              <Text align="center" className={css.sectionTitle}>
                {"Added Tags"}
              </Text>
              <TagInput
                value={addedTags}
                setValue={handleTagAdded}
                options={[...tagStore.tagOptions]}
                autoFocus
                className={css.tagInput}
              />

              <Text align="center" className={css.sectionTitle}>
                {"Removed Tags"}
              </Text>
              <TagInput
                value={removedTags}
                setValue={handleTagRemoved}
                options={currentTagOptions}
                className={css.tagInput}
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
        <TagEditor isCreate goBack={handleEditorBack} />
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
    width: "25rem",
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
  tagInput: {
    marginBottom: "0.5rem",
  },
});
