import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { createTag, editTag } from "database";
import { DialogContent, DialogActions, colors } from "@mui/material";
import { Button, ChipInput, ChipOption, Input, TagOption, Text, View } from "components";
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

  const [aliases, setAliases] = useState<ChipOption[]>(
    isCreate ? [] : tagStore.activeTag?.aliases?.map((a) => ({ label: a, value: a })) ?? []
  );
  const [label, setLabel] = useState<string>(isCreate ? "" : tagStore.activeTag?.label ?? "");
  const [parentTags, setParentTags] = useState<TagOption[]>(
    isCreate ? [] : tagStore.activeTag?.parentTagOptions ?? []
  );

  const saveTag = async () => {
    if (!label.trim().length) return toast.error("Tag label cannot be blank");

    const parentIds = parentTags.map((t) => t.id);
    const aliasStrings = aliases.map((a) => a.value);

    if (isCreate) await createTag({ aliases: aliasStrings, label, parentIds, tagStore });
    else
      await editTag({
        aliases: aliasStrings,
        id: tagStore.activeTagId,
        label,
        parentIds,
        tagStore,
      });

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
          <Input value={label} setValue={setLabel} textAlign="center" className={css.input} />

          <Text align="center" className={css.sectionTitle}>
            Aliases
          </Text>
          <ChipInput value={aliases} setValue={setAliases} className={css.input} />

          <Text align="center" className={css.sectionTitle}>
            Parent Tags
          </Text>
          <TagInput
            value={parentTags}
            setValue={setParentTags}
            options={tagStore.tagOptions.filter((opt) => opt.id !== tagStore.activeTagId)}
            className={css.input}
          />
        </View>
      </DialogContent>

      <DialogActions className={css.dialogActions}>
        <Button text="Cancel" icon="Close" onClick={onCancel} color={colors.red["800"]} />

        <Button text="Confirm" icon="Check" onClick={saveTag} />
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
  },
  sectionTitle: {
    marginTop: "0.3rem",
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
