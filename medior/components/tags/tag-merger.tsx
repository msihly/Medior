import { useEffect, useRef, useState } from "react";
import Color from "color";
import {
  Button,
  Card,
  Checkbox,
  Comp,
  HeaderWrapper,
  LoadingOverlay,
  Modal,
  TagInput,
  TagInputs,
  TagList,
  Text,
  UniformList,
  View,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { colors, makeClasses, toast, useCancellableLoad } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export const TagMerger = Comp(() => {
  const stores = useStores();
  const store = stores.tag;

  const { css } = useClasses(null);

  const load = useCancellableLoad();

  const [aliases, setAliases] = useState<string[]>([]);
  const [childTags, setChildTags] = useState<TagOption[]>([]);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState<string>("");
  const [parentTags, setParentTags] = useState<TagOption[]>([]);
  const [regEx, setRegEx] = useState<string>("");
  const [selectedTagValue, setSelectedTagValue] = useState<TagOption[]>([]);
  const [tagIdToKeep, setTagIdToKeep] = useState<string>("");
  const [tagIdToMerge, setTagIdToMerge] = useState<string>("");
  const [tagLabelToKeep, setTagLabelToKeep] = useState<null | "base" | "merge">(null);

  const mergeTag = useRef<TagOption>(null);

  const hasSelectedTag = selectedTagValue.length > 0;
  const disabled = isSaving || load.isLoading || !hasSelectedTag || !isPreviewReady;
  const baseTag = store.subEditor.isOpen ? store.subEditor.tag : store.editor.tag;

  const updateInputs = () => {
    setIsPreviewReady(false);

    if (!selectedTagValue.length) {
      load.cancel();
      setAliases([]);
      setChildTags([]);
      setLabel("");
      setParentTags([]);
      setRegEx("");
      setTagLabelToKeep(null);
      mergeTag.current = null;
    } else {
      load.run(async (signal) => {
        const res = await trpc.listTag.mutate(
          { filter: { id: selectedTagValue[0].id } },
          { signal },
        );

        signal.throwIfAborted();

        if (!res.success) throw new Error(res.error);

        const tag = res.data[0];

        if (!tag) throw new Error("Tag no longer exists");

        const tagToKeep = tag.count > baseTag.count ? tag : baseTag;
        const tagToMerge = tag.count > baseTag.count ? baseTag : tag;
        const labelToKeep = tagLabelToKeep ?? (tagToKeep.id === baseTag.id ? "base" : "merge");
        const tagIdsToExclude = [tagToKeep.id, tagToMerge.id];
        const [childTags, parentTags] = await Promise.all([
          mergeRelatedTags(
            [...tagToKeep.childIds, ...tagToMerge.childIds],
            tagIdsToExclude,
            signal,
          ),
          mergeRelatedTags(
            [...tagToKeep.parentIds, ...tagToMerge.parentIds],
            tagIdsToExclude,
            signal,
          ),
        ]);

        signal.throwIfAborted();
        mergeTag.current = tag;
        setTagIdToKeep(tagToKeep.id);
        setTagIdToMerge(tagToMerge.id);
        handleLabelChange(labelToKeep);
        setRegEx(tagToKeep.regEx);
        setChildTags(childTags);
        setParentTags(parentTags);
        setIsPreviewReady(true);
      });
    }
  };

  useEffect(() => {
    updateInputs();
  }, [baseTag?.id, selectedTagValue[0]?.id]);

  const handleLabelChange = (labelToKeep: "base" | "merge") => {
    const tag = mergeTag.current;
    const tagToKeep = tag.count > baseTag.count ? tag : baseTag;
    const tagToMerge = tag.count > baseTag.count ? baseTag : tag;
    const aliasToSet = labelToKeep === "merge" ? baseTag.label : tag.label;

    setTagLabelToKeep(labelToKeep);
    setAliases([...new Set([aliasToSet, ...tagToKeep.aliases, ...tagToMerge.aliases])]);
    setLabel(labelToKeep === "base" ? baseTag.label : tag.label);
  };

  const handleClose = async () => {
    if (isSaving) return false;

    load.cancel();
    store.merger.setIsOpen(false);
    store.subEditor.setIsOpen(false);
    store.editor.setIsOpen(false);
    stores.file.search.reloadIfQueued();

    return true;
  };

  const handleConfirm = async () => {
    if (disabled) return;

    try {
      setIsSaving(true);

      const res = await store.mergeTags({
        aliases,
        childIds: childTags.map((t) => t.id),
        label,
        parentIds: parentTags.map((t) => t.id),
        regEx,
        tagIdToKeep,
        tagIdToMerge,
        withRegen: true,
        withSub: true,
      });

      if (!res.success) throw new Error(res.error);

      setIsSaving(false);

      store.merger.setIsOpen(false);
      store.merger.setTagId(tagIdToKeep);
      store.editor.setIsOpen(true);

      toast.success("Tags merged successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err.message);
      setIsSaving(false);
    }
  };

  const mergeRelatedTags = async (
    tagIds: string[],
    tagIdsToExclude: string[],
    signal: AbortSignal,
  ) => {
    const result: TagOption[] = [];
    const tagIdsToExcludeSet = new Set(tagIdsToExclude);
    const tagIdsSet = new Set(tagIds.filter((id) => !tagIdsToExcludeSet.has(id)));
    const res = await trpc.listTag.mutate({ filter: { id: [...tagIdsSet] } }, { signal });

    signal.throwIfAborted();

    if (!res.success) throw new Error(res.error);

    const tagMap = new Map(res.data.map((tag) => [tag.id, tag]));

    for (const tagId of tagIdsSet) {
      const tag = tagMap.get(tagId);

      if (tag) result.push(tagToOption(tag));
    }

    return result;
  };

  return (
    <Modal.Container isLoading={isSaving} onClose={handleClose} width="50rem" draggable>
      <LoadingOverlay
        isLoading={load.isLoading}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header>
        <Text preset="title">{"Merge Tags"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
        <Card column>
          <UniformList row spacing="0.5rem">
            <View column flex={1}>
              <HeaderWrapper header="Base Tag">
                <TagList
                  search={{ onChange: null, value: baseTag ? [baseTag] : [] }}
                  hasDelete={false}
                  hasInput
                />
              </HeaderWrapper>

              <Checkbox
                label="Keep This Label"
                checked={tagLabelToKeep === "base"}
                setChecked={() => handleLabelChange("base")}
                disabled={disabled}
                center
              />
            </View>

            <View column flex={1}>
              <TagInput
                header="Tag to Merge"
                excludedIds={[baseTag.id]}
                value={selectedTagValue}
                onChange={setSelectedTagValue}
                single
              />

              <Checkbox
                label="Keep This Label"
                checked={tagLabelToKeep === "merge"}
                setChecked={() => handleLabelChange("merge")}
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
              excludedIds={[tagIdToKeep, tagIdToMerge, ...childTags.map((t) => t.id)].filter(
                Boolean,
              )}
              value={parentTags}
              setValue={setParentTags}
              disabled
              hasDelete={false}
            />

            <TagInputs.Relations
              header="Child Tags"
              excludedIds={[tagIdToKeep, tagIdToMerge, ...parentTags.map((t) => t.id)].filter(
                Boolean,
              )}
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
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  disabledOverlay: {
    background: Color(colors.background).fade(0.3).string(),
    borderRadius: "inherit",
    bottom: 0,
    height: "100%",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
    zIndex: 20,
  },
});
