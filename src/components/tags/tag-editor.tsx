import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Divider } from "@mui/material";
import { Button, Checkbox, ChipOption, IconButton, Modal, Text, View } from "components";
import { ConfirmDeleteModal, TagInputs } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const TagEditor = observer(() => {
  const { css } = useClasses(null);

  const labelRef = useRef<HTMLDivElement>(null);

  const { tagStore } = useStores();

  const isCreate = !tagStore.activeTagId;

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
    label.length > 0 &&
    (isCreate || label.toLowerCase() !== tagStore.activeTag?.label?.toLowerCase()) &&
    !!tagStore.getByLabel(label);

  useEffect(() => {
    if (tagStore.activeTagId) {
      const tag = tagStore.getById(tagStore.activeTagId);
      setLabel(tag.label);
      setAliases(tag.aliases.map((a) => ({ label: a, value: a })) ?? []);
      setChildTags(tagStore.getChildTags(tag).map((t) => t.tagOption) ?? []);
      setParentTags(tagStore.getParentTags(tag).map((t) => t.tagOption) ?? []);
    }
  }, [tagStore.activeTagId]);

  const clearInputs = () => {
    setLabel("");
    setAliases([]);
    if (!hasKeepParentTags) setParentTags([]);
    if (!hasKeepChildTags) setChildTags([]);
    labelRef.current?.focus();
  };

  const handleClose = () => tagStore.setIsTagEditorOpen(false);

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleMerge = () => {
    tagStore.setIsTagMergerOpen(true);
    handleClose();
  };

  const handleRefreshCount = async () => {
    const res = await tagStore.refreshTagCount(tagStore.activeTagId);
    if (res.success) toast.success("Tag count refreshed");
  };

  const saveTag = async () => {
    if (isDuplicateTag) return toast.error("Tag label must be unique");
    if (!label.trim().length) return toast.error("Tag label cannot be blank");

    const childIds = childTags.map((t) => t.id);
    const parentIds = parentTags.map((t) => t.id);
    const aliasStrings = aliases.map((a) => a.value);

    const res = await (isCreate
      ? tagStore.createTag({ aliases: aliasStrings, childIds, label, parentIds })
      : tagStore.editTag({
          aliases: aliasStrings,
          childIds,
          id: tagStore.activeTagId,
          label,
          parentIds,
        }));

    if (res.success) {
      if (hasContinue) {
        clearInputs();
        labelRef.current?.focus();
      } else handleClose();
    }
  };

  return (
    <Modal.Container onClose={handleClose} width="50rem" draggable>
      <Modal.Header
        leftNode={
          !isCreate && (
            <Text
              tooltip={tagStore.activeTagId}
              tooltipProps={{ flexShrink: 1 }}
              className={css.headerText}
            >
              {`ID: ${tagStore.activeTagId}`}
            </Text>
          )
        }
        rightNode={
          !isCreate && (
            <View className={css.spacedRow}>
              <Text
                tooltip={tagStore.activeTag?.count}
                tooltipProps={{ flexShrink: 1 }}
                className={css.headerText}
              >
                {`Count: ${tagStore.activeTag?.count}`}
              </Text>

              <IconButton
                name="Refresh"
                iconProps={{ color: colors.button.grey }}
                onClick={handleRefreshCount}
              />

              <Divider orientation="vertical" flexItem />

              <IconButton
                name="Delete"
                iconProps={{ color: colors.button.red }}
                onClick={handleDelete}
              />
            </View>
          )
        }
      >
        <Text alignSelf="center">{isCreate ? "Create Tag" : "Edit Tag"}</Text>
      </Modal.Header>

      <Modal.Content>
        <View className={css.spacedRow}>
          <TagInputs.Label
            ref={labelRef}
            value={label}
            setValue={setLabel}
            isDuplicate={isDuplicateTag}
          />

          <TagInputs.Aliases value={aliases} setValue={setAliases} />
        </View>

        <TagInputs.Relations
          label="Parent Tags"
          options={[...tagStore.tagOptions]}
          excludedIds={[tagStore.activeTagId, ...childTags.map((t) => t.id)]}
          value={parentTags}
          setValue={setParentTags}
        />

        <TagInputs.Relations
          label="Child Tags"
          options={[...tagStore.tagOptions]}
          excludedIds={[tagStore.activeTagId, ...parentTags.map((t) => t.id)]}
          value={childTags}
          setValue={setChildTags}
        />

        {isCreate && (
          <View column justify="center">
            <Text className={css.sectionTitle}>{"Create Options"}</Text>

            <View row>
              <Checkbox label="Continue" checked={hasContinue} setChecked={setHasContinue} center />

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
      </Modal.Content>

      {isConfirmDeleteOpen && <ConfirmDeleteModal setVisible={setIsConfirmDeleteOpen} />}

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} color={colors.grey["700"]} />

        {!isCreate && (
          <Button
            text="Merge Tags"
            icon="Merge"
            onClick={handleMerge}
            color={colors.blueGrey["700"]}
          />
        )}

        <Button text="Confirm" icon="Check" onClick={saveTag} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  headerText: {
    color: colors.grey["600"],
    fontSize: "0.7em",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  sectionTitle: {
    fontSize: "0.8em",
    textAlign: "center",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
  },
  spacedRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
});
