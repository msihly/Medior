import { useState } from "react";
import { RegExMapSchema } from "medior/database";
import { TagOption, observer, useStores } from "medior/store";
import {
  Button,
  Card,
  Checkbox,
  ChipOption,
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

  const [aliases, setAliases] = useState<ChipOption[]>([]);
  const [childTags, setChildTags] = useState<TagOption[]>([]);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState<string>("");
  const [parentTags, setParentTags] = useState<TagOption[]>([]);
  const [regExMap, setRegExMap] = useState<RegExMapSchema>({
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
    setAliases(
      [...new Set([aliasToSet, ...tagToKeep.aliases, ...tagToMerge.aliases])].map((a) => ({
        label: a,
        value: a,
      }))
    );

    const labelToSet = tagLabelToKeep === "base" ? baseTag.label : tag.label;
    setLabel(labelToSet);

    setRegExMap({ ...tagToMerge.regExMap, ...tagToKeep.regExMap });

    const childIds = [...tagToKeep.childIds, ...tagToMerge.childIds];
    const parentIds = [...tagToKeep.parentIds, ...tagToMerge.parentIds];
    const tagIdsToExclude = [tagToKeep.id, tagToMerge.id];
    setChildTags(mergeRelatedTags(childIds, tagIdsToExclude));
    setParentTags(mergeRelatedTags(parentIds, tagIdsToExclude));
  }, [selectedTagValue, tagLabelToKeep]);

  const handleClose = () => {
    setIsConfirmDiscardOpen(false);
    stores.tag.setIsTagMergerOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleConfirm = async () => {
    try {
      setIsSaving(true);
      const res = await stores.tag.mergeTags({
        aliases: aliases.map((a) => a.value),
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

  const handleSelectedTagChange = (val: TagOption[]) => setSelectedTagValue(val);

  const mergeRelatedTags = (tagIds: string[], tagIdsToExclude: string[]) => {
    const filteredTagIds = [...new Set(tagIds)];
    return filteredTagIds.reduce((acc, curId) => {
      if (tagIdsToExclude.includes(curId) || acc.find((t) => t.id === curId)) return acc;

      const hasDescendants = filteredTagIds.some((otherId) => {
        const otherTag = stores.tag.getById(otherId);
        const parentIds = [
          ...new Set([
            otherTag?.parentIds ?? [],
            otherTag ? stores.tag.getParentTags(otherTag, true).map((t) => t.id) : [],
          ]),
        ].flat();

        return parentIds.includes(curId);
      });

      if (!hasDescendants) acc.push(stores.tag.getById(curId).tagOption);
      return acc;
    }, [] as TagOption[]);
  };

  return (
    <Modal.Container onClose={handleClose} width="50rem" draggable>
      <Modal.Header>
        <Text>{"Merge Tags"}</Text>
      </Modal.Header>

      <Modal.Content>
        <View column spacing="0.5rem">
          <Card column>
            <UniformList row spacing="0.5rem">
              <View column flex={1}>
                <HeaderWrapper header="Base Tag">
                  <TagList
                    tags={[baseTag]}
                    search={null}
                    viewProps={{ borderRadiuses: { top: 0 } }}
                  />
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
                {selectedTagValue.length > 0 ? (
                  <HeaderWrapper header=" Tag to Merge">
                    <TagList
                      tags={selectedTagValue}
                      search={{ onChange: handleSelectedTagChange, value: selectedTagValue }}
                      hasDelete
                      viewProps={{ borderRadiuses: { top: 0 } }}
                    />
                  </HeaderWrapper>
                ) : (
                  <TagInput
                    header="Select Tag to Merge"
                    options={tagOptions}
                    excludedIds={[stores.tag.activeTagId]}
                    value={selectedTagValue}
                    onChange={handleSelectedTagChange}
                    hasList={false}
                    maxTags={1}
                  />
                )}

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

          <View column position="relative" spacing="0.5rem">
            {disabled && <View className={css.disabledOverlay} />}

            <Card row flex={1} spacing="0.5rem">
              <TagInputs.Label
                value={label}
                setValue={setLabel}
                disabled
                hasHelper={false}
              />

              <TagInputs.Aliases
                value={aliases}
                setValue={setAliases}
                disabled
                hasHelper={false}
              />
            </Card>

            <Card row height="12rem" spacing="0.5rem">
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
            </Card>
          </View>

          {!disabled && (
            <Text align="center" fontStyle="italic" fontSize="0.8em">
              {"Edit after merging"}
            </Text>
          )}
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Cancel"
          icon="Close"
          onClick={handleClose}
          disabled={isSaving}
          color={colors.custom.grey}
        />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} {...{ disabled }} />
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
