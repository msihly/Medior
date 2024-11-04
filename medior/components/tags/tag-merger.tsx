import { useState } from "react";
import { TagSchema } from "medior/database";
import { TagOption, observer, useStores } from "medior/store";
import {
  Button,
  Card,
  Checkbox,
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
import { colors, makeClasses, useDeepEffect, useDeepMemo } from "medior/utils";
import { toast } from "react-toastify";
import Color from "color";

export const TagMerger = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const [aliases, setAliases] = useState<string[]>([]);
  const [childTags, setChildTags] = useState<TagOption[]>([]);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState<string>("");
  const [parentTags, setParentTags] = useState<TagOption[]>([]);
  const [regExMap, setRegExMap] = useState<TagSchema["regExMap"]>({
    regEx: "",
    testString: "",
    types: [],
  });
  const [selectedTagValue, setSelectedTagValue] = useState<TagOption[]>([]);
  const [tagIdToKeep, setTagIdToKeep] = useState<string>("");
  const [tagIdToMerge, setTagIdToMerge] = useState<string>("");
  const [tagLabelToKeep, setTagLabelToKeep] = useState<null | "base" | "merge">(null);

  const hasSelectedTag = selectedTagValue.length > 0;
  const disabled = isSaving || !hasSelectedTag;
  const baseTag = stores.tag.getById(
    stores.tag.isTagSubEditorOpen ? stores.tag.subEditorTagId : stores.tag.activeTagId
  );
  const tagOptions = useDeepMemo(stores.tag.tagOptions);

  useDeepEffect(() => {
    if (!selectedTagValue.length) {
      setAliases([]);
      setChildTags([]);
      setLabel("");
      setParentTags([]);
      setRegExMap({ regEx: "", testString: "", types: [] });
      setTagLabelToKeep(null);
      return;
    }

    const tag = stores.tag.getById(selectedTagValue[0].id);
    const tagToKeep = tag.count > baseTag.count ? tag : baseTag;
    const tagToMerge = !(tag.count > baseTag.count) ? tag : baseTag;
    setTagIdToKeep(tagToKeep.id);
    setTagIdToMerge(tagToMerge.id);
    if (!tagLabelToKeep)
      setTagLabelToKeep(tagToKeep.id === stores.tag.activeTagId ? "base" : "merge");

    const aliasToSet = tagLabelToKeep === "merge" ? baseTag.label : tag.label;
    setAliases([...new Set([aliasToSet, ...tagToKeep.aliases, ...tagToMerge.aliases])]);

    const labelToSet = tagLabelToKeep === "base" ? baseTag.label : tag.label;
    setLabel(labelToSet);

    setRegExMap({ ...tagToMerge.regExMap, ...tagToKeep.regExMap });

    const childIds = [...tagToKeep.childIds, ...tagToMerge.childIds];
    const parentIds = [...tagToKeep.parentIds, ...tagToMerge.parentIds];
    const tagIdsToExclude = [tagToKeep.id, tagToMerge.id];
    setChildTags(mergeRelatedTags(childIds, tagIdsToExclude));
    setParentTags(mergeRelatedTags(parentIds, tagIdsToExclude));
  }, [selectedTagValue, tagLabelToKeep]);

  const handleClose = async () => {
    setIsConfirmDiscardOpen(false);
    stores.tag.setIsTagMergerOpen(false);
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
        regExMap,
        tagIdToKeep,
        tagIdToMerge,
      });
      if (!res.success) throw new Error(res.error);
      setIsSaving(false);

      stores.tag.setIsTagMergerOpen(false);
      stores.tag.setActiveTagId(tagIdToKeep);
      stores.tag.setIsTagEditorOpen(true);

      toast.success("Tags merged successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.message);
      setIsSaving(false);
    }
  };

  const mergeRelatedTags = (tagIds: string[], tagIdsToExclude: string[]) => {
    const tagIdsSet = new Set(tagIds);
    const tagIdsToExcludeSet = new Set(tagIdsToExclude);
    const tagMap = new Map(stores.tag.listByIds(tagIds).map((tag) => [tag.id, tag]));
    const result = new Set<TagOption>();

    tagIdsSet.forEach((curId) => {
      const tagOption = tagMap.get(curId)?.tagOption;
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
                options={tagOptions}
                excludedIds={[stores.tag.activeTagId]}
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
              options={tagOptions}
              excludedIds={[stores.tag.activeTagId, ...childTags.map((t) => t.id)]}
              value={parentTags}
              setValue={setParentTags}
              disabled
              hasDelete={false}
            />

            <TagInputs.Relations
              header="Child Tags"
              options={tagOptions}
              excludedIds={[stores.tag.activeTagId, ...parentTags.map((t) => t.id)]}
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
