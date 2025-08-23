import { useState } from "react";
import Color from "color";
import {
  Button,
  Card,
  Checkbox,
  Comp,
  ConfirmModal,
  HeaderWrapper,
  Modal,
  TagInput,
  TagInputs,
  TagList,
  Text,
  UniformList,
  View,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { colors, makeClasses, toast, useDeepEffect } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export const TagMerger = Comp(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const [aliases, setAliases] = useState<string[]>([]);
  const [childTags, setChildTags] = useState<TagOption[]>([]);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState<string>("");
  const [parentTags, setParentTags] = useState<TagOption[]>([]);
  const [regEx, setRegEx] = useState<string>("");
  const [selectedTagValue, setSelectedTagValue] = useState<TagOption[]>([]);
  const [tagIdToKeep, setTagIdToKeep] = useState<string>("");
  const [tagIdToMerge, setTagIdToMerge] = useState<string>("");
  const [tagLabelToKeep, setTagLabelToKeep] = useState<null | "base" | "merge">(null);

  const hasSelectedTag = selectedTagValue.length > 0;
  const disabled = isSaving || !hasSelectedTag;
  const baseTag = stores.tag.subEditor.isOpen ? stores.tag.subEditor.tag : stores.tag.editor.tag;

  const updateInputs = async () => {
    if (!selectedTagValue.length) {
      setAliases([]);
      setChildTags([]);
      setLabel("");
      setParentTags([]);
      setRegEx("");
      setTagLabelToKeep(null);
      return;
    }

    const tag = (await trpc.listTag.mutate({ args: { filter: { id: selectedTagValue[0].id } } }))
      .data.items[0];

    const tagToKeep = tag.count > baseTag.count ? tag : baseTag;
    const tagToMerge = !(tag.count > baseTag.count) ? tag : baseTag;
    setTagIdToKeep(tagToKeep.id);
    setTagIdToMerge(tagToMerge.id);
    if (!tagLabelToKeep)
      setTagLabelToKeep(tagToKeep.id === stores.tag.merger.tagId ? "base" : "merge");

    const aliasToSet = tagLabelToKeep === "merge" ? baseTag.label : tag.label;
    setAliases([...new Set([aliasToSet, ...tagToKeep.aliases, ...tagToMerge.aliases])]);
    setLabel(tagLabelToKeep === "base" ? baseTag.label : tag.label);
    setRegEx(tagToKeep.regEx);

    const childIds = [...tagToKeep.childIds, ...tagToMerge.childIds];
    const parentIds = [...tagToKeep.parentIds, ...tagToMerge.parentIds];
    const tagIdsToExclude = [tagToKeep.id, tagToMerge.id];
    setChildTags(await mergeRelatedTags(childIds, tagIdsToExclude));
    setParentTags(await mergeRelatedTags(parentIds, tagIdsToExclude));
  };

  useDeepEffect(() => {
    updateInputs();
  }, [selectedTagValue, tagLabelToKeep, updateInputs]);

  const handleClose = async () => {
    setIsConfirmDiscardOpen(false);
    stores.tag.merger.setIsOpen(false);
    stores.file.search.reloadIfQueued();
    return true;
  };

  const handleConfirm = async () => {
    try {
      setIsSaving(true);
      const res = await stores.tag.mergeTags({
        aliases,
        childIds: childTags.map((t) => t.id),
        label,
        parentIds: parentTags.map((t) => t.id),
        regEx,
        tagIdToKeep,
        tagIdToMerge,
      });
      if (!res.success) throw new Error(res.error);
      setIsSaving(false);

      stores.tag.merger.setIsOpen(false);
      stores.tag.merger.setTagId(tagIdToKeep);
      stores.tag.editor.setIsOpen(true);

      toast.success("Tags merged successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.message);
      setIsSaving(false);
    }
  };

  const mergeRelatedTags = async (tagIds: string[], tagIdsToExclude: string[]) => {
    const result = new Set<TagOption>();
    const tagIdsSet = new Set(tagIds);
    const tagIdsToExcludeSet = new Set(tagIdsToExclude);
    const tags = (await trpc.listTag.mutate({ args: { filter: { id: tagIds } } })).data.items;
    const tagMap = new Map(tags.map((tag) => [tag.id, tag]));

    tagIdsSet.forEach((curId) => {
      const tagOption = tagMap.has(curId) ? tagToOption(tagMap.get(curId)) : null;
      if (tagIdsToExcludeSet.has(curId) || result.has(tagOption)) return;

      const hasDescendants = Array.from(tagIdsSet).some((otherId) => {
        const otherTag = tagMap.get(otherId);
        if (!otherTag) return false;
        const parentIds = new Set(otherTag.ancestorIds ?? []);
        return parentIds.has(curId);
      });

      if (!hasDescendants && tagOption) result.add(tagOption);
    });

    return Array.from(result);
  };

  return (
    <Modal.Container isLoading={isSaving} onClose={handleClose} width="50rem" draggable>
      <Modal.Header>
        <Text preset="title">{"Merge Tags"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
        <Card column>
          <UniformList row spacing="0.5rem">
            <View column flex={1}>
              <HeaderWrapper header="Base Tag">
                <TagList search={{ onChange: null, value: [baseTag] }} hasDelete={false} hasInput />
              </HeaderWrapper>

              <Checkbox
                label="Keep This Label"
                checked={tagLabelToKeep === "base"}
                setChecked={() => setTagLabelToKeep("base")}
                disabled={disabled}
                center
              />
            </View>

            <View column flex={1}>
              <TagInput
                header="Tag to Merge"
                excludedIds={[stores.tag.merger.tagId]}
                value={selectedTagValue}
                onChange={setSelectedTagValue}
                single
              />

              <Checkbox
                label="Keep This Label"
                checked={tagLabelToKeep === "merge"}
                setChecked={() => setTagLabelToKeep("merge")}
                disabled={disabled}
                center
              />
            </View>
          </UniformList>
        </Card>

        <Card column position="relative" spacing="0.5rem">
          {disabled && <View className={css.disabledOverlay} />}

          <View row flex={1} spacing="0.5rem">
            <TagInputs.Label value={label} setValue={setLabel} disabled hasHelper={false} />
          </View>

          <View row height="12rem" spacing="0.5rem">
            <TagInputs.Aliases value={aliases} onChange={setAliases} disabled hasHelper={false} />

            <TagInputs.Relations
              header="Parent Tags"
              excludedIds={[stores.tag.merger.tagId, ...childTags.map((t) => t.id)]}
              value={parentTags}
              setValue={setParentTags}
              disabled
              hasDelete={false}
            />

            <TagInputs.Relations
              header="Child Tags"
              excludedIds={[stores.tag.merger.tagId, ...parentTags.map((t) => t.id)]}
              value={childTags}
              setValue={setChildTags}
              disabled
              hasDelete={false}
            />
          </View>

          <Text align="center" fontStyle="italic" fontSize="0.8em">
            {"Edit after merging"}
          </Text>
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Cancel"
          icon="Close"
          onClick={handleClose}
          disabled={isSaving}
          color={colors.custom.grey}
        />

        <Button
          text="Confirm"
          icon="Check"
          onClick={handleConfirm}
          color={colors.custom.purple}
          {...{ disabled }}
        />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to cancel merging?"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleClose}
        />
      )}
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  disabledOverlay: {
    position: "absolute",
    borderRadius: "inherit",
    width: "100%",
    height: "100%",
    background: Color(colors.background).fade(0.3).string(),
    zIndex: 20,
  },
});
