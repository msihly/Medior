import { useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Divider } from "@mui/material";
import {
  Button,
  ChipOption,
  InputWrapper,
  Modal,
  Tag,
  TagInput,
  TagInputs,
  Text,
  View,
} from "components";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const TagMerger = observer(() => {
  const { css } = useClasses(null);

  const { tagStore } = useStores();

  const [aliases, setAliases] = useState<ChipOption[]>([]);
  const [childTags, setChildTags] = useState<TagOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState<string>("");
  const [parentTags, setParentTags] = useState<TagOption[]>([]);
  const [selectedTagValue, setSelectedTagValue] = useState<TagOption[]>([]);
  const [tagIdToKeep, setTagIdToKeep] = useState<string>("");
  const [tagIdToMerge, setTagIdToMerge] = useState<string>("");

  const hasSelectedTag = selectedTagValue.length > 0;
  const disabled = isSaving || !hasSelectedTag;

  const handleClose = () => tagStore.setIsTagMergerOpen(false);

  const handleConfirm = async () => {
    try {
      setIsSaving(true);
      const res = await tagStore.mergeTags({
        aliases: aliases.map((a) => a.value),
        childIds: childTags.map((t) => t.id),
        label,
        parentIds: parentTags.map((t) => t.id),
        tagIdToKeep,
        tagIdToMerge,
      });
      if (!res.success) throw new Error(res.error);
      setIsSaving(false);

      tagStore.setIsTagMergerOpen(false);
      tagStore.setActiveTagId(tagIdToKeep);
      tagStore.setIsTagEditorOpen(true);

      toast.success("Tags merged successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.message);
      setIsSaving(false);
    }
  };

  const handleSelectedTagChange = (val: TagOption[]) => {
    setSelectedTagValue(val);
    if (!val.length) {
      setLabel("");
      setAliases([]);
      setParentTags([]);
      setChildTags([]);
      return;
    }

    const tag = tagStore.getById(val[0].id);
    const tagToKeep = tag.count > tagStore.activeTag.count ? tag : tagStore.activeTag;
    const tagToMerge = tag.count > tagStore.activeTag.count ? tagStore.activeTag : tag;

    setTagIdToKeep(tagToKeep.id);
    setTagIdToMerge(tagToMerge.id);
    setLabel(tagToKeep.label);
    setAliases(
      [...new Set([tagToMerge.label, ...tagToKeep.aliases, ...tagToMerge.aliases])].map((a) => ({
        label: a,
        value: a,
      }))
    );

    const childIds = [...tagToKeep.childIds, ...tagToMerge.childIds];
    const parentIds = [...tagToKeep.parentIds, ...tagToMerge.parentIds];
    const tagIdsToExclude = [tagToKeep.id, tagToMerge.id];
    setChildTags(mergeRelatedTags(childIds, tagIdsToExclude));
    setParentTags(mergeRelatedTags(parentIds, [...tagIdsToExclude, ...tagToMerge.parentIds]));
  };

  const mergeRelatedTags = (tagIds: string[], tagIdsToExclude: string[]) =>
    [...new Set(tagIds)].reduce((acc, cur) => {
      if (tagIdsToExclude.includes(cur)) return acc;
      else acc.push(tagStore.getById(cur).tagOption);
      return acc;
    }, [] as TagOption[]);

  return (
    <Modal.Container onClose={handleClose} width="50rem" draggable>
      <Modal.Header>
        <Text>{"Merge Tags"}</Text>
      </Modal.Header>

      <Modal.Content>
        <InputWrapper label="Base Tag" align="center" margins={{ bottom: "1rem" }}>
          <Tag tag={tagStore.activeTag} />
        </InputWrapper>

        <InputWrapper label="Select Tag to Merge" align="center">
          <TagInput
            options={[...tagStore.tagOptions]}
            excludedIds={[tagStore.activeTagId]}
            value={selectedTagValue}
            onChange={handleSelectedTagChange}
            hasDelete
            maxTags={1}
            width="20rem"
          />
        </InputWrapper>

        <Divider className={css.divider} />

        <View className={css.editorContainer}>
          {disabled && <View className={css.disabledOverlay} />}

          <View className={css.spacedRow}>
            <TagInputs.Label value={label} setValue={setLabel} disabled disableWithoutFade />

            <TagInputs.Aliases value={aliases} setValue={setAliases} disabled disableWithoutFade />
          </View>

          <TagInputs.Relations
            label="Parent Tags"
            options={[...tagStore.tagOptions]}
            excludedIds={[tagStore.activeTagId, ...childTags.map((t) => t.id)]}
            value={parentTags}
            setValue={setParentTags}
            disabled
            disableWithoutFade
            hasDelete={false}
          />

          <TagInputs.Relations
            label="Child Tags"
            options={[...tagStore.tagOptions]}
            excludedIds={[tagStore.activeTagId, ...parentTags.map((t) => t.id)]}
            value={childTags}
            setValue={setChildTags}
            disabled
            disableWithoutFade
            hasDelete={false}
          />
        </View>

        {!disabled && (
          <Text align="center" fontStyle="italic" fontSize="0.8em">
            {"Edit after merging"}
          </Text>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Cancel"
          icon="Close"
          onClick={handleClose}
          disabled={isSaving}
          color={colors.button.grey}
        />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} {...{ disabled }} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  disabledOverlay: {
    position: "absolute",
    borderRadius: 4,
    width: "100%",
    height: "100%",
    background: "rgb(55 55 55 / 70%)",
    zIndex: 20,
  },
  divider: {
    margin: "1rem 0",
  },
  editorContainer: {
    position: "relative",
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
