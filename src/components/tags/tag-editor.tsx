import { ipcRenderer } from "electron";
import { useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Checkbox, ChipInput, ChipOption, Input, TagInput, Text, View } from "components";
import { ConfirmDeleteModal } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

interface TagEditorProps {
  create: boolean;
  goBack: () => void;
}

export const TagEditor = observer(({ create, goBack }: TagEditorProps) => {
  const { tagStore } = useStores();
  const { css } = useClasses(null);

  const labelRef = useRef<HTMLDivElement>(null);

  const [isCreate, setIsCreate] = useState(create);

  const [aliases, setAliases] = useState<ChipOption[]>(
    isCreate ? [] : tagStore.activeTag?.aliases?.map((a) => ({ label: a, value: a })) ?? []
  );
  const [childTags, setChildTags] = useState<TagOption[]>(
    isCreate || !tagStore.activeTag
      ? []
      : tagStore.getChildTags(tagStore.activeTag).map((t) => t.tagOption)
  );
  const [hasContinue, setHasContinue] = useState(false);
  const [hasKeepChildTags, setHasKeepChildTags] = useState(false);
  const [hasKeepParentTags, setHasKeepParentTags] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [label, setLabel] = useState<string>(isCreate ? "" : tagStore.activeTag?.label ?? "");
  const [parentTags, setParentTags] = useState<TagOption[]>(
    isCreate || !tagStore.activeTag
      ? []
      : tagStore.getParentTags(tagStore.activeTag).map((t) => t.tagOption)
  );

  const isDuplicateTag =
    (isCreate || label.toLowerCase() !== tagStore.activeTag?.label?.toLowerCase()) &&
    !!tagStore.getByLabel(label);

  const [childTagOptions, parentTagOptions] = useMemo(() => {
    const invalidParentIds = [tagStore.activeTagId, ...childTags.map((t) => t.id)];
    const invalidChildIds = [tagStore.activeTagId, ...parentTags.map((t) => t.id)];
    return tagStore.tagOptions.reduce(
      (acc, cur) => {
        if (!invalidChildIds.includes(cur.id)) acc[0].push(cur);
        if (!invalidParentIds.includes(cur.id)) acc[1].push(cur);
        return acc;
      },
      [[], []] as TagOption[][]
    );
  }, [tagStore.activeTagId, tagStore.tagOptions]);

  const clearInputs = () => {
    setLabel("");
    setAliases([]);
    if (!hasKeepParentTags) setParentTags([]);
    if (!hasKeepChildTags) setChildTags([]);
    labelRef.current?.focus();
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleEditExisting = () => {
    setIsCreate(false);
    tagStore.setTagManagerMode("edit");

    const tag = tagStore.getByLabel(label);
    setLabel(tag.label);
    setAliases(tag.aliases.map((a) => ({ label: a, value: a })) ?? []);
    setChildTags(tagStore.getChildTags(tag).map((t) => t.tagOption) ?? []);
    setParentTags(tagStore.getParentTags(tag).map((t) => t.tagOption) ?? []);
    tagStore.setActiveTagId(tag.id);
  };

  const saveTag = async () => {
    if (isDuplicateTag) return toast.error("Tag label must be unique");
    if (!label.trim().length) return toast.error("Tag label cannot be blank");

    const childIds = childTags.map((t) => t.id);
    const parentIds = parentTags.map((t) => t.id);
    const aliasStrings = aliases.map((a) => a.value);

    ipcRenderer.send(isCreate ? "createTag" : "editTag", {
      aliases: aliasStrings,
      childIds,
      id: !isCreate ? tagStore.activeTagId : undefined,
      label,
      parentIds,
    });

    hasContinue ? clearInputs() : goBack();
  };

  return (
    <>
      <DialogContent dividers className={css.dialogContent}>
        <View column>
          <Text className={css.sectionTitle}>{"Label"}</Text>
          <Input
            ref={labelRef}
            value={label}
            setValue={setLabel}
            textAlign="center"
            error={isDuplicateTag}
            hasHelper
            helperText={
              isDuplicateTag && (
                <View row align="center" justify="center">
                  <Text>{"Tag already exists"}</Text>
                  <Button
                    variant="text"
                    text="(Click to edit)"
                    onClick={handleEditExisting}
                    fontSize="0.85em"
                  />
                </View>
              )
            }
          />

          <Text className={css.sectionTitle}>{"Aliases"}</Text>
          <ChipInput value={aliases} setValue={setAliases} hasHelper />

          <Text className={css.sectionTitle}>{"Parent Tags"}</Text>
          <TagInput
            value={parentTags}
            setValue={setParentTags}
            options={parentTagOptions}
            hasHelper
          />

          <Text className={css.sectionTitle}>{"Child Tags"}</Text>
          <TagInput value={childTags} setValue={setChildTags} options={childTagOptions} hasHelper />

          {isCreate && (
            <View column justify="center">
              <Text className={css.sectionTitle}>{"Create Options"}</Text>

              <View row>
                <Checkbox
                  label="Continue"
                  checked={hasContinue}
                  setChecked={setHasContinue}
                  center
                />

                <Checkbox
                  label="Parent"
                  checked={hasKeepParentTags}
                  setChecked={setHasKeepParentTags}
                  disabled={!hasContinue}
                  center
                />

                <Checkbox
                  label="Child"
                  checked={hasKeepChildTags}
                  setChecked={setHasKeepChildTags}
                  disabled={!hasContinue}
                  center
                />
              </View>
            </View>
          )}
        </View>
      </DialogContent>

      {isConfirmDeleteOpen && (
        <ConfirmDeleteModal setVisible={setIsConfirmDeleteOpen} goBack={goBack} />
      )}

      <DialogActions className={css.dialogActions}>
        <Button text="Cancel" icon="Close" onClick={goBack} color={colors.grey["700"]} />

        {!isCreate && (
          <Button text="Delete" icon="Delete" onClick={handleDelete} color={colors.red["800"]} />
        )}

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
    width: "25rem",
  },
  sectionTitle: {
    fontSize: "0.8em",
    textAlign: "center",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
});
