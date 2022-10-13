import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { createTag, editTag } from "database";
import { DialogContent, DialogActions, colors } from "@mui/material";
import { Button, ChipInput, ChipOption, Input, TagOption, TagInput, Text, View } from "components";
import { ConfirmDeleteModal } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

interface TagEditorProps {
  isCreate: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export const TagEditor = observer(({ isCreate, onCancel, onSave }: TagEditorProps) => {
  const { tagStore } = useStores();
  const { classes: css } = useClasses(null);

  const [aliases, setAliases] = useState<ChipOption[]>(
    isCreate ? [] : tagStore.activeTag?.aliases?.map((a) => ({ label: a, value: a })) ?? []
  );
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [label, setLabel] = useState<string>(isCreate ? "" : tagStore.activeTag?.label ?? "");
  const [parentTags, setParentTags] = useState<TagOption[]>(
    isCreate ? [] : tagStore.activeTag?.parentTagOptions ?? []
  );

  const isDuplicateTag =
    (isCreate || label !== tagStore.activeTag?.label) && !!tagStore.getByLabel(label);

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const saveTag = async () => {
    if (isDuplicateTag) return toast.error("Tag label must be unique");
    if (!label.trim().length) return toast.error("Tag label cannot be blank");

    const parentIds = parentTags.map((t) => t.id);
    const aliasStrings = aliases.map((a) => a.value);

    if (isCreate) await createTag({ aliases: aliasStrings, label, parentIds });
    else
      await editTag({
        aliases: aliasStrings,
        id: tagStore.activeTagId,
        label,
        parentIds,
      });

    toast.success(`Tag '${label}' ${isCreate ? "created" : "edited"}`);
    onSave();
  };

  return (
    <>
      <DialogContent dividers className={css.dialogContent}>
        <View column>
          <Text align="center" className={css.sectionTitle}>
            Label
          </Text>
          <Input
            value={label}
            setValue={setLabel}
            textAlign="center"
            error={isDuplicateTag}
            helperText={isDuplicateTag ? "Tag already exists" : undefined}
          />

          <Text align="center" className={css.sectionTitle}>
            Aliases
          </Text>
          <ChipInput value={aliases} setValue={setAliases} />

          <Text align="center" className={css.sectionTitle}>
            Parent Tags
          </Text>
          <TagInput
            value={parentTags}
            setValue={setParentTags}
            options={tagStore.tagOptions.filter((opt) => opt.id !== tagStore.activeTagId)}
          />
        </View>
      </DialogContent>

      {isConfirmDeleteOpen && <ConfirmDeleteModal setVisible={setIsConfirmDeleteOpen} />}

      <DialogActions className={css.dialogActions}>
        <Button text="Cancel" icon="Close" onClick={onCancel} color={colors.grey["700"]} />

        <Button text="Delete" icon="Delete" onClick={handleDelete} color={colors.red["800"]} />

        <Button text="Confirm" icon="Check" onClick={saveTag} />
      </DialogActions>
    </>
  );
});

const useClasses = makeClasses({
  dialogActions: {
    justifyContent: "center",
  },
  dialogContent: {
    padding: "0.5rem 1rem",
  },
  sectionTitle: {
    fontSize: "0.8em",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
