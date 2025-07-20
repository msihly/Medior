import { useRef, useState } from "react";
import { Divider } from "@mui/material";
import {
  Button,
  Card,
  Checkbox,
  Comp,
  ConfirmModal,
  IconButton,
  IdButton,
  Modal,
  RegExMapRow,
  Text,
  View,
} from "medior/components";
import { TagOption, useStores } from "medior/store";
import { colors, openSearchWindow, toast } from "medior/utils/client";
import { TagInputs } from ".";

export interface TagEditorProps {
  isSubEditor?: boolean;
}

export const TagEditor = Comp(({ isSubEditor = false }: TagEditorProps) => {
  const labelRef = useRef<HTMLDivElement>(null);

  const stores = useStores();
  const store = isSubEditor ? stores.tag.subEditor : stores.tag.editor;

  const [hasContinue, setHasContinue] = useState(false);
  const [hasKeepChildTags, setHasKeepChildTags] = useState(false);
  const [hasKeepParentTags, setHasKeepParentTags] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const isDuplicateTag =
    store.label?.length > 0 &&
    (!store.tag || store.label.toLowerCase() !== store.tag?.label?.toLowerCase()) &&
    !!stores.tag.getByLabel(store.label);

  const clearInputs = () => {
    store.setLabel("");
    store.setAliases([]);
    if (!hasKeepParentTags) store.setParentTags([]);
    if (!hasKeepChildTags) store.setChildTags([]);
    labelRef.current?.focus();
  };

  const handleClose = () => {
    if (isSubEditor) stores.tag.subEditor.setIsOpen(false);
    else {
      stores.tag.editor.setIsOpen(false);
      stores.file.search.reloadIfQueued();
    }
  };

  const handleConfirmDelete = async () => {
    store.setIsLoading(true);
    const res = await stores.tag.deleteTag({ id: store.tag.id });

    if (!res.success) toast.error("Failed to delete tag");
    else {
      toast.success("Tag deleted");
      setIsConfirmDeleteOpen(false);
      stores.tag.editor.setIsOpen(false);
    }

    store.setIsLoading(false);
    return res.success;
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleMerge = () => {
    stores.tag.merger.setIsOpen(true);
    handleClose();
  };

  const handleRefresh = async () => {
    store.setIsLoading(true);
    await stores.tag.refreshTag({ id: store.tag.id });
    store.setIsLoading(false);
  };

  const handleSearch = () => openSearchWindow({ tagIds: [store.tag.id] });

  const handleSubEditorClick = (tagOpt: TagOption) => {
    stores.tag.subEditor.setIsOpen(true);
    stores.tag.subEditor.loadTag(tagOpt.id);
  };

  const saveTag = async () => {
    if (isDuplicateTag) return toast.error("Tag label must be unique");
    if (!store.label.trim().length) return toast.error("Tag label cannot be blank");

    const aliases = store.aliases;
    const label = store.label;
    const childIds = store.childTags.map((t) => t.id);
    const parentIds = store.parentTags.map((t) => t.id);
    const regEx = store.regExValue;

    store.setIsLoading(true);
    const res = await (!store.tag
      ? stores.tag.createTag({ aliases, childIds, label, parentIds, regEx })
      : stores.tag.editTag({ aliases, childIds, id: store.tag.id, label, parentIds, regEx }));
    store.setIsLoading(false);

    if (res.success) hasContinue ? clearInputs() : handleClose();
    else toast.error(res.error);
  };

  return (
    <Modal.Container isLoading={stores.tag.editor.isLoading} onClose={handleClose} width="45rem">
      <Modal.Header
        leftNode={
          store.tag && (
            <View row align="center" spacing="0.5rem">
              <IdButton value={store.tag?.id} />

              <IconButton
                name="Search"
                iconProps={{ color: colors.custom.grey }}
                onClick={handleSearch}
              />
            </View>
          )
        }
        rightNode={
          store.tag && (
            <View row align="center" spacing="0.5rem">
              <Text tooltip={store.tag?.count} tooltipProps={{ flexShrink: 1 }} preset="sub-text">
                {`Count: ${store.tag?.count}`}
              </Text>

              <IconButton
                name="Refresh"
                iconProps={{ color: colors.custom.grey }}
                onClick={handleRefresh}
              />

              <Divider orientation="vertical" flexItem />

              <IconButton
                name="Delete"
                iconProps={{ color: colors.custom.red }}
                onClick={handleDelete}
              />
            </View>
          )
        }
      >
        <Text preset="title">{!store.tag ? "Create Tag" : "Edit Tag"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
        <Card height="100%" padding={{ top: "1rem" }}>
          <TagInputs.Label
            ref={labelRef}
            value={store.label}
            setValue={store.setLabel}
            isDuplicate={isDuplicateTag}
            width="100%"
          />
        </Card>

        <Card row height="13rem" spacing="0.5rem" padding={{ all: "1rem 0.5rem" }}>
          <TagInputs.Aliases value={store.aliases} onChange={store.setAliases} />

          <TagInputs.Relations
            header="Parent Tags"
            options={stores.tag.tagOptions}
            excludedIds={[store.tag?.id, ...store.childTags.map((t) => t.id)]}
            value={store.parentTags}
            setValue={store.setParentTags}
            ancestryType="ancestors"
            ancestryTagIds={store.tag?.ancestorIds}
            hasEditor={false}
            onTagClick={!isSubEditor ? handleSubEditorClick : null}
          />

          <TagInputs.Relations
            header="Child Tags"
            options={stores.tag.tagOptions}
            excludedIds={[store.tag?.id, ...store.parentTags.map((t) => t.id)]}
            value={store.childTags}
            setValue={store.setChildTags}
            ancestryType="descendants"
            ancestryTagIds={store.tag?.descendantIds}
            hasEditor={false}
            onTagClick={!isSubEditor ? handleSubEditorClick : null}
          />
        </Card>

        <Card padding={{ top: "1rem" }}>
          <RegExMapRow store={store} />
        </Card>

        {!store.tag && (
          <Card header="Create Options" row spacing="0.5rem">
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
          </Card>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        {store.tag && (
          <Button
            text="Merge"
            icon="Merge"
            onClick={handleMerge}
            colorOnHover={colors.custom.purple}
          />
        )}

        <Button text="Confirm" icon="Check" onClick={saveTag} color={colors.custom.blue} />
      </Modal.Footer>

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Tag"
          subText={store.tag?.label}
          onConfirm={handleConfirmDelete}
          setVisible={setIsConfirmDeleteOpen}
        />
      )}
    </Modal.Container>
  );
});
