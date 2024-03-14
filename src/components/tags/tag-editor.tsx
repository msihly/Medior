import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { RegExMap, TagOption, useStores } from "store";
import { Divider } from "@mui/material";
import {
  Button,
  Checkbox,
  ChipOption,
  ConfirmModal,
  IconButton,
  Modal,
  RegExMapRow,
  Text,
  View,
} from "components";
import { TagInputs } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export interface TagEditorProps {
  hasSubEditor?: boolean;
  id: string;
  isSubEditor?: boolean;
}

export const TagEditor = observer(
  ({ hasSubEditor = false, id, isSubEditor = false }: TagEditorProps) => {
    const { css } = useClasses(null);

    const labelRef = useRef<HTMLDivElement>(null);

    const { tagStore } = useStores();

    const isCreate = !id;
    const tag = isCreate ? null : tagStore.getById(id);

    const [aliases, setAliases] = useState<ChipOption[]>(
      tag?.aliases ? tag.aliases.map((a) => ({ label: a, value: a })) : []
    );
    const [childTags, setChildTags] = useState<TagOption[]>(
      tag ? tagStore.getChildTags(tag).map((t) => t.tagOption) : []
    );
    const [hasContinue, setHasContinue] = useState(false);
    const [hasKeepChildTags, setHasKeepChildTags] = useState(false);
    const [hasKeepParentTags, setHasKeepParentTags] = useState(false);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [label, setLabel] = useState<string>(tag?.label ?? "");
    const [parentTags, setParentTags] = useState<TagOption[]>(
      tag ? tagStore.getParentTags(tag).map((t) => t.tagOption) : []
    );
    const [regExValue, setRegExValue] = useState<string>(tag?.regExMap?.regEx ?? "");
    const [regExTestString, setRegExTestString] = useState<string>(tag?.regExMap?.testString ?? "");
    const [regExTypes, setRegExTypes] = useState<RegExMap["types"]>(
      tag?.regExMap?.types ?? ["diffusionParams", "fileName", "folderName"]
    );

    const isDuplicateTag =
      label.length > 0 &&
      (isCreate || label.toLowerCase() !== tag?.label?.toLowerCase()) &&
      !!tagStore.getByLabel(label);

    useEffect(() => {
      if (id) {
        const tag = tagStore.getById(id);
        if (!tag) return;
        setLabel(tag.label);
        setAliases(tag.aliases.map((a) => ({ label: a, value: a })) ?? []);
        setChildTags(tagStore.getChildTags(tag).map((t) => t.tagOption) ?? []);
        setParentTags(tagStore.getParentTags(tag).map((t) => t.tagOption) ?? []);
      }
    }, [id, JSON.stringify(tag)]);

    const clearInputs = () => {
      setLabel("");
      setAliases([]);
      if (!hasKeepParentTags) setParentTags([]);
      if (!hasKeepChildTags) setChildTags([]);
      labelRef.current?.focus();
    };

    const handleClose = () =>
      isSubEditor ? tagStore.setIsTagSubEditorOpen(false) : tagStore.setIsTagEditorOpen(false);

    const handleConfirmDelete = async () => {
      const res = await tagStore.deleteTag({ id: tag.id });

      if (!res.success) toast.error("Failed to delete tag");
      else {
        toast.success("Tag deleted");
        setIsConfirmDeleteOpen(false);
        tagStore.setIsTagEditorOpen(false);
      }

      return res.success;
    };

    const handleDelete = () => setIsConfirmDeleteOpen(true);

    const handleMerge = () => {
      tagStore.setIsTagMergerOpen(true);
      handleClose();
    };

    const handleRefreshCount = async () => {
      const relationRes = await tagStore.refreshTagRelations({ id: id });
      if (!relationRes.success) return toast.error("Failed to refresh tag relations");

      const countRes = await tagStore.refreshTagCounts([id]);
      if (!countRes.success) return toast.error("Failed to refresh tag count");

      toast.success("Tag refreshed");
    };

    const handleSubEditorClick = (tagId: string) => {
      tagStore.setSubEditorTagId(tagId);
      tagStore.setIsTagSubEditorOpen(true);
    };

    const saveTag = async () => {
      if (isDuplicateTag) return toast.error("Tag label must be unique");
      if (!label.trim().length) return toast.error("Tag label cannot be blank");

      const childIds = childTags.map((t) => t.id);
      const parentIds = parentTags.map((t) => t.id);
      const aliasStrings = aliases.map((a) => a.value);
      const regExMap =
        regExValue.length > 0 && regExTypes.length
          ? { regEx: regExValue, testString: regExTestString, types: regExTypes }
          : null;

      setIsSaving(true);
      const res = await (isCreate
        ? tagStore.createTag({ aliases: aliasStrings, childIds, label, parentIds, regExMap })
        : tagStore.editTag({
            aliases: aliasStrings,
            childIds,
            id: id,
            label,
            parentIds,
            regExMap,
          }));
      setIsSaving(false);

      if (res.success) {
        if (hasContinue) {
          clearInputs();
          labelRef.current?.focus();
        } else handleClose();
      } else toast.error(res.error);
    };

    return (
      <Modal.Container onClose={handleClose} width="50rem">
        <Modal.Header
          leftNode={!isCreate && <Text className={css.headerText}>{`ID: ${id}`}</Text>}
          rightNode={
            !isCreate && (
              <View align="center" className={css.spacedRow}>
                <Text
                  tooltip={tag?.count}
                  tooltipProps={{ flexShrink: 1 }}
                  className={css.headerText}
                >
                  {`Count: ${tag?.count}`}
                </Text>

                <IconButton
                  name="Refresh"
                  iconProps={{ color: colors.button.grey }}
                  onClick={handleRefreshCount}
                  disabled={isSaving}
                />

                <Divider orientation="vertical" flexItem />

                <IconButton
                  name="Delete"
                  iconProps={{ color: colors.button.red }}
                  onClick={handleDelete}
                  disabled={isSaving}
                />
              </View>
            )
          }
        >
          <Text alignSelf="center">{isCreate ? "Create Tag" : "Edit Tag"}</Text>
        </Modal.Header>

        <Modal.Content>
          <View align="flex-start" className={css.spacedRow}>
            <TagInputs.Label
              ref={labelRef}
              value={label}
              setValue={setLabel}
              disabled={isSaving}
              isDuplicate={isDuplicateTag}
            />

            <TagInputs.Aliases value={aliases} setValue={setAliases} disabled={isSaving} />
          </View>

          <TagInputs.Relations
            label="Parent Tags"
            options={[...tagStore.tagOptions]}
            excludedIds={[id, ...childTags.map((t) => t.id)]}
            value={parentTags}
            setValue={setParentTags}
            disabled={isSaving}
            hasEditor={false}
            onTagClick={hasSubEditor ? handleSubEditorClick : null}
          />

          <TagInputs.Relations
            label="Child Tags"
            options={[...tagStore.tagOptions]}
            excludedIds={[id, ...parentTags.map((t) => t.id)]}
            value={childTags}
            setValue={setChildTags}
            disabled={isSaving}
            hasEditor={false}
            onTagClick={hasSubEditor ? handleSubEditorClick : null}
          />

          <View column justify="center">
            <Text className={css.sectionTitle}>{"RegEx Mapping"}</Text>

            <RegExMapRow
              aliases={aliases.map((a) => a.value)}
              disabled={isSaving}
              label={label}
              regEx={regExValue}
              setRegEx={setRegExValue}
              setTestString={setRegExTestString}
              setTypes={setRegExTypes}
              testString={regExTestString}
              types={regExTypes}
            />
          </View>

          {isCreate && (
            <View column justify="center">
              <Text className={css.sectionTitle}>{"Create Options"}</Text>

              <View row>
                <Checkbox
                  label="Continue"
                  checked={hasContinue}
                  setChecked={setHasContinue}
                  disabled={isSaving}
                  center
                />

                <Checkbox
                  label="Parent"
                  checked={hasKeepParentTags}
                  setChecked={setHasKeepParentTags}
                  disabled={!hasContinue || isSaving}
                  center
                />

                <Checkbox
                  label="Child"
                  checked={hasKeepChildTags}
                  setChecked={setHasKeepChildTags}
                  disabled={!hasContinue || isSaving}
                  center
                />
              </View>
            </View>
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

          {!isCreate && (
            <Button
              text="Merge Tags"
              icon="Merge"
              onClick={handleMerge}
              disabled={isSaving}
              color={colors.blueGrey["700"]}
            />
          )}

          <Button text="Confirm" icon="Check" onClick={saveTag} disabled={isSaving} />
        </Modal.Footer>

        {isConfirmDeleteOpen && (
          <ConfirmModal
            headerText="Delete Tag"
            subText={tag.label}
            onConfirm={handleConfirmDelete}
            setVisible={setIsConfirmDeleteOpen}
          />
        )}
      </Modal.Container>
    );
  }
);

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
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
});
