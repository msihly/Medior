import { useRef, useState } from "react";
import { EditTagInput } from "medior/_generated/server";
import {
  Button,
  Card,
  Checkbox,
  ColorPicker,
  Comp,
  ConfirmModal,
  Divider,
  IconButton,
  IconPicker,
  IdButton,
  LoadingOverlay,
  Modal,
  NumInput,
  RatingButton,
  TagEditorAncestry,
  TagToUpsert,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, openSearchWindow, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { RegExMapCard, TagInputs } from ".";

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
  const [isSaving, setIsSaving] = useState(false);

  const clearInputs = () => {
    store.setLabel("");
    store.setAliases([]);
    store.setRegExValue("");
    store.setRegExTestString("");
    store.setCategoryColor(null);
    store.setCategoryIcon(null);
    store.setCategoryInheritable(null);
    store.setCategorySortRank(null);

    if (!hasKeepParentTags) store.setParentTags([]);

    if (!hasKeepChildTags) store.setChildTags([]);

    labelRef.current?.focus();
  };

  const handleClose = () => {
    if (isSaving) return;

    store.setIsOpen(false);

    if (!isSubEditor) stores.file.search.reloadIfQueued();
  };

  const handleConfirmDelete = async () => {
    setIsSaving(true);

    const res = await stores.tag.deleteTag({ id: store.tag.id });

    if (!res.success) toast.error("Failed to delete tag");
    else {
      toast.success("Tag deleted");
      setIsConfirmDeleteOpen(false);
      store.setIsOpen(false);
    }

    setIsSaving(false);

    return res.success;
  };

  const handleDelete = () => setIsConfirmDeleteOpen(true);

  const handleFindTagsOnSameFiles = () => {
    stores.tag.manager.findTagsOnSameFiles(store.tag.tagOption);
    handleClose();
  };

  const handleMerge = () => stores.tag.merger.setIsOpen(true);

  const handleRating = (rating: number) => stores.tag.updateTagRating({ id: store.tag.id, rating });

  const handleRefresh = async () => {
    setIsSaving(true);
    await stores.tag.refreshTag({ id: store.tag.id });
    setIsSaving(false);
    await store.loadTag({ id: store.tag.id });
  };

  const handleSearch = () => openSearchWindow({ tagIds: [store.tag.id] });

  const handleSubEditorClick = (tagOpt: TagToUpsert) => {
    if (!tagOpt.id || tagOpt.id === store.tag?.id) return;

    stores.tag.subEditor.setIsOpen(true);
    stores.tag.subEditor.loadTag({ id: tagOpt.id });
  };

  const saveTag = async () => {
    if (store.isDuplicate) return toast.error("Tag label must be unique");

    if (!store.label.trim().length) return toast.error("Tag label cannot be blank");

    const tag: EditTagInput = {
      aliases: store.aliases,
      category: {
        color: store.categoryColor,
        icon: store.categoryIcon,
        inheritable: store.categoryInheritable,
        sortRank: store.categorySortRank,
      },
      childIds: store.childTags.map((t) => t.id),
      id: store.tag?.id,
      label: store.label,
      parentIds: store.parentTags.map((t) => t.id),
      regEx: store.regExValue,
    };

    setIsSaving(true);

    const res = await (!store.tag ? stores.tag.createTag(tag) : stores.tag.editTag(tag));

    if (res.success) {
      if (hasContinue) {
        clearInputs();
        setIsSaving(false);
      } else handleClose();
    } else {
      setIsSaving(false);
      toast.error(res.error);
    }
  };

  return (
    <Modal.Container isLoading={isSaving} onClose={handleClose} width="66rem">
      <LoadingOverlay
        isLoading={store.isLoading}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header
        leftNode={
          store.tag && (
            <View row align="center" spacing="0.5rem">
              <IdButton value={store.tag?.id} />

              <IconButton
                name="Search"
                tooltip="Search Files"
                iconProps={{ color: colors.custom.grey }}
                onClick={handleSearch}
              />

              {!isSubEditor && (
                <IconButton
                  name="FindInPage"
                  tooltip="Find Tags on Same Files"
                  iconProps={{ color: colors.custom.grey }}
                  onClick={handleFindTagsOnSameFiles}
                />
              )}
            </View>
          )
        }
        rightNode={
          store.tag && (
            <View row align="center" spacing="0.5rem">
              <RatingButton rating={store.tag.rating} setRating={handleRating} />

              <Text tooltip={store.tag?.count} tooltipProps={{ flexShrink: 1 }} preset="sub-text">
                {`${Fmt.commas(store.tag?.count ?? 0)} files / ${Fmt.bytes(store.tag?.size ?? 0)}`}
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
        <View row spacing="0.5rem">
          <Card row spacing="0.5rem">
            <NumInput
              header="Sort Rank"
              value={store.categorySortRank}
              setValue={store.setCategorySortRank}
              width={90}
              textAlign="center"
            />

            <View column spacing="0.5rem">
              <View row spacing="0.5rem">
                <ColorPicker
                  swatches={colors.tagCategories}
                  value={store.categoryColor}
                  setValue={store.setCategoryColor}
                  noIcon
                />

                <IconPicker value={store.categoryIcon} setValue={store.setCategoryIcon} />
              </View>

              <Checkbox
                label="Inheritable"
                checked={store.categoryInheritable}
                setChecked={store.setCategoryInheritable}
                flex="none"
              />
            </View>
          </Card>

          <Card row flex={1}>
            <TagInputs.Label
              ref={labelRef}
              value={store.label}
              setValue={store.setLabel}
              isDuplicate={store.isDuplicate}
              onLoadTag={store.loadTag}
              width="100%"
            />
          </Card>
        </View>

        <Card row height="18rem" spacing="0.5rem" padding={{ all: "1rem 0.5rem 0.5rem" }}>
          <TagInputs.Aliases value={store.aliases} onChange={store.setAliases} />

          <TagInputs.Relations
            header="Parent Tags"
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
            excludedIds={[store.tag?.id, ...store.parentTags.map((t) => t.id)]}
            value={store.childTags}
            setValue={store.setChildTags}
            ancestryType="descendants"
            ancestryTagIds={store.tag?.descendantIds}
            hasEditor={false}
            onTagClick={!isSubEditor ? handleSubEditorClick : null}
          />

          <TagEditorAncestry
            store={store}
            onTagClick={!isSubEditor ? handleSubEditorClick : null}
          />
        </Card>

        <RegExMapCard store={store} />

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
