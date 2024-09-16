import { useRef, useState } from "react";
import { RegExMapSchema } from "medior/database";
import { TagOption, observer, useStores } from "medior/store";
import { Divider } from "@mui/material";
import {
  Button,
  Card,
  Checkbox,
  ChipOption,
  ConfirmModal,
  IconButton,
  LoadingOverlay,
  Modal,
  RegExMapRow,
  Text,
  View,
} from "medior/components";
import { TagInputs } from ".";
import { colors, openSearchWindow, useDeepEffect, useDeepMemo } from "medior/utils";
import { toast } from "react-toastify";

export interface TagEditorProps {
  hasSubEditor?: boolean;
  id: string;
  isSubEditor?: boolean;
}

export const TagEditor = observer(
  ({ hasSubEditor = false, id, isSubEditor = false }: TagEditorProps) => {
    const labelRef = useRef<HTMLDivElement>(null);

    const stores = useStores();

    const isCreate = !id;
    const tag = isCreate ? null : stores.tag.getById(id);

    const [aliases, setAliases] = useState<ChipOption[]>(
      tag?.aliases ? tag.aliases.map((a) => ({ label: a, value: a })) : []
    );
    const [childTags, setChildTags] = useState<TagOption[]>(
      tag ? stores.tag.getChildTags(tag).map((t) => t.tagOption) : []
    );
    const [hasContinue, setHasContinue] = useState(false);
    const [hasKeepChildTags, setHasKeepChildTags] = useState(false);
    const [hasKeepParentTags, setHasKeepParentTags] = useState(false);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [label, setLabel] = useState<string>(tag?.label ?? "");
    const [parentTags, setParentTags] = useState<TagOption[]>(
      tag ? stores.tag.getParentTags(tag).map((t) => t.tagOption) : []
    );
    const [regExValue, setRegExValue] = useState<string>(tag?.regExMap?.regEx ?? "");
    const [regExTestString, setRegExTestString] = useState<string>(tag?.regExMap?.testString ?? "");
    const [regExTypes, setRegExTypes] = useState<RegExMapSchema["types"]>(
      tag?.regExMap?.types ?? ["diffusionParams", "fileName", "folderName"]
    );

    const isDuplicateTag =
      label.length > 0 &&
      (isCreate || label.toLowerCase() !== tag?.label?.toLowerCase()) &&
      !!stores.tag.getByLabel(label);

    const tagOptions = useDeepMemo(stores.tag.tagOptions);

    useDeepEffect(() => {
      if (id && stores.tag.getById(id)) {
        setLabel(tag.label);
        setAliases(tag.aliases.map((a) => ({ label: a, value: a })) ?? []);
        setChildTags(stores.tag.getChildTags(tag).map((t) => t.tagOption) ?? []);
        setParentTags(stores.tag.getParentTags(tag).map((t) => t.tagOption) ?? []);
        setRegExValue(tag.regExMap?.regEx ?? "");
        setRegExTestString(tag.regExMap?.testString ?? "");
        setRegExTypes(tag.regExMap?.types ?? ["diffusionParams", "fileName", "folderName"]);
      }
    }, [id, JSON.stringify(tag)]);

    const clearInputs = () => {
      setLabel("");
      setAliases([]);
      if (!hasKeepParentTags) setParentTags([]);
      if (!hasKeepChildTags) setChildTags([]);
      labelRef.current?.focus();
    };

    const handleClose = () => {
      if (isSubEditor) stores.tag.setIsTagSubEditorOpen(false);
      else {
        stores.tag.setIsTagEditorOpen(false);
        stores.file.search.reloadIfQueued();
      }
    };

    const handleConfirmDelete = async () => {
      setIsLoading(true);
      const res = await stores.tag.deleteTag({ id });

      if (!res.success) toast.error("Failed to delete tag");
      else {
        toast.success("Tag deleted");
        setIsConfirmDeleteOpen(false);
        stores.tag.setIsTagEditorOpen(false);
      }

      setIsLoading(false);
      return res.success;
    };

    const handleDelete = () => setIsConfirmDeleteOpen(true);

    const handleMerge = () => {
      stores.tag.setIsTagMergerOpen(true);
      handleClose();
    };

    const handleRefresh = async () => {
      setIsLoading(true);
      await stores.tag.refreshTag({ id });
      setIsLoading(false);
    };

    const handleSubEditorClick = (tagId: string) => {
      stores.tag.setSubEditorTagId(tagId);
      stores.tag.setIsTagSubEditorOpen(true);
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

      setIsLoading(true);
      const res = await (isCreate
        ? stores.tag.createTag({ aliases: aliasStrings, childIds, label, parentIds, regExMap })
        : stores.tag.editTag({
            aliases: aliasStrings,
            childIds,
            id: id,
            label,
            parentIds,
            regExMap,
          }));
      setIsLoading(false);

      if (res.success) {
        if (hasContinue) {
          clearInputs();
          labelRef.current?.focus();
        } else handleClose();
      } else toast.error(res.error);
    };

    const handleSearch = () => openSearchWindow({ tagIds: [id] });

    return (
      <Modal.Container onClose={handleClose} width="50rem">
        <LoadingOverlay {...{ isLoading }} />

        <Modal.Header
          leftNode={
            !isCreate && (
              <View row align="center" spacing="0.5rem">
                <IconButton
                  name="Search"
                  iconProps={{ color: colors.custom.grey }}
                  onClick={handleSearch}
                  disabled={isLoading}
                />

                <Text preset="sub-text">{`ID: ${id}`}</Text>
              </View>
            )
          }
          rightNode={
            !isCreate && (
              <View row align="center" spacing="0.5rem">
                <Text tooltip={tag?.count} tooltipProps={{ flexShrink: 1 }} preset="sub-text">
                  {`Count: ${tag?.count}`}
                </Text>

                <IconButton
                  name="Refresh"
                  iconProps={{ color: colors.custom.grey }}
                  onClick={handleRefresh}
                  disabled={isLoading}
                />

                <Divider orientation="vertical" flexItem />

                <IconButton
                  name="Delete"
                  iconProps={{ color: colors.custom.red }}
                  onClick={handleDelete}
                  disabled={isLoading}
                />
              </View>
            )
          }
        >
          <Text alignSelf="center">{isCreate ? "Create Tag" : "Edit Tag"}</Text>
        </Modal.Header>

        <Modal.Content>
          <View column spacing="0.5rem">
            <Card row flex={1} spacing="0.5rem">
              <TagInputs.Label
                ref={labelRef}
                value={label}
                setValue={setLabel}
                disabled={isLoading}
                isDuplicate={isDuplicateTag}
                width="100%"
              />

              <TagInputs.Aliases value={aliases} setValue={setAliases} disabled={isLoading} />
            </Card>

            <Card row height="12rem" spacing="0.5rem">
              <TagInputs.Relations
                header="Parent Tags"
                options={tagOptions}
                excludedIds={[id, ...childTags.map((t) => t.id)]}
                value={parentTags}
                setValue={setParentTags}
                ancestryType="ancestors"
                ancestryTagIds={tag?.ancestorIds}
                disabled={isLoading}
                hasEditor={false}
                onTagClick={hasSubEditor ? handleSubEditorClick : null}
              />

              <TagInputs.Relations
                header="Child Tags"
                options={tagOptions}
                excludedIds={[id, ...parentTags.map((t) => t.id)]}
                value={childTags}
                setValue={setChildTags}
                ancestryType="descendants"
                ancestryTagIds={tag?.descendantIds}
                disabled={isLoading}
                hasEditor={false}
                onTagClick={hasSubEditor ? handleSubEditorClick : null}
              />
            </Card>

            <RegExMapRow
              aliases={aliases.map((a) => a.value)}
              disabled={isLoading}
              label={label}
              regEx={regExValue}
              setRegEx={setRegExValue}
              setTestString={setRegExTestString}
              setTypes={setRegExTypes}
              testString={regExTestString}
              types={regExTypes}
            />

            {isCreate && (
              <Card header="Create Options" row spacing="0.5rem">
                <Checkbox
                  label="Continue"
                  checked={hasContinue}
                  setChecked={setHasContinue}
                  disabled={isLoading}
                  center
                />

                <Checkbox
                  label="Parent"
                  checked={hasKeepParentTags}
                  setChecked={setHasKeepParentTags}
                  disabled={!hasContinue || isLoading}
                  center
                />

                <Checkbox
                  label="Child"
                  checked={hasKeepChildTags}
                  setChecked={setHasKeepChildTags}
                  disabled={!hasContinue || isLoading}
                  center
                />
              </Card>
            )}
          </View>
        </Modal.Content>

        <Modal.Footer>
          <Button
            text="Cancel"
            icon="Close"
            onClick={handleClose}
            disabled={isLoading}
            colorOnHover={colors.custom.red}
          />

          {!isCreate && (
            <Button
              text="Merge Tags"
              icon="Merge"
              onClick={handleMerge}
              disabled={isLoading}
              colorOnHover={colors.custom.purple}
            />
          )}

          <Button
            text="Confirm"
            icon="Check"
            onClick={saveTag}
            disabled={isLoading}
            color={colors.custom.blue}
          />
        </Modal.Footer>

        {isConfirmDeleteOpen && (
          <ConfirmModal
            headerText="Delete Tag"
            subText={tag?.label}
            onConfirm={handleConfirmDelete}
            setVisible={setIsConfirmDeleteOpen}
          />
        )}
      </Modal.Container>
    );
  }
);
