import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { createTag, editTag } from "database";
import { DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Input, TagOption, Text, View } from "components";
import { TagInput } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

interface TagEditorProps {
  isCreate: boolean;
  onCancel: () => void;
  onSave: () => void;
}

const TagEditor = observer(({ isCreate, onCancel, onSave }: TagEditorProps) => {
  const { tagStore } = useStores();
  const { classes: css } = useClasses(null);

  const [aliases, setAliases] = useState<string[]>(
    isCreate ? [] : tagStore.activeTag?.aliases ?? []
  );
  const [label, setLabel] = useState<string>(isCreate ? "" : tagStore.activeTag?.label ?? "");
  const [parentTags, setParentTags] = useState<TagOption[]>(
    isCreate ? [] : tagStore.activeTag?.parentTagOptions ?? []
  );

  const saveTag = async () => {
    if (!label.trim().length) return toast.error("Tag label cannot be blank");

    const parentIds = parentTags.map((t) => t.id);

    if (isCreate) await createTag({ aliases, label, parentIds, tagStore });
    else await editTag({ aliases, id: tagStore.activeTagId, label, parentIds, tagStore });

    toast.success(`Tag '${label}' ${isCreate ? "created" : "edited"}`);
    onSave();
  };

  return (
    <>
      <DialogContent dividers={true} className={css.dialogContent}>
        <View column>
          <Text align="center" className={css.sectionTitle}>
            Label
          </Text>
          <Input value={label} setValue={setLabel} className={css.input} />

          <Text align="center" className={css.sectionTitle}>
            Aliases
          </Text>
          <Input value={aliases} setValue={setAliases} className={css.input} />
          {/* TODO: Change this to a TagInput */}

          <Text align="center" className={css.sectionTitle}>
            Parent Tags
          </Text>
          <TagInput
            value={parentTags}
            onChange={(val) => setParentTags(val)}
            options={tagStore.tagOptions}
            className={css.input}
          />
        </View>
      </DialogContent>

      <DialogActions className={css.dialogActions}>
        <Button onClick={onCancel} color="secondary">
          Cancel
        </Button>

        <Button onClick={saveTag} color="primary">
          Confirm
        </Button>
      </DialogActions>
    </>
  );
});

export default TagEditor;

const useClasses = makeClasses({
  dialogActions: {
    justifyContent: "center",
  },
  dialogContent: {
    padding: "0.5rem 1rem",
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
});
