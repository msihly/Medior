import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { createTag, editTag } from "database";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Input, TagOption, Text, View } from "components";
import { Tag, TagInput } from ".";
import { makeStyles } from "utils";

const TagManager = observer(() => {
  const { tagStore } = useStores();
  const { classes: css } = useClasses();

  const [aliases, setAliases] = useState<string[]>(tagStore.activeTag?.aliases ?? []);
  const [label, setLabel] = useState<string>(tagStore.activeTag?.label ?? "");
  const [parentTags, setParentTags] = useState<TagOption[]>(tagStore.activeTag?.parentTags ?? []);
  const [searchValue, setSearchValue] = useState<string>("");

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const getTagOptions = () =>
    tagStore.tagOptions.filter((t) => t.label.toLowerCase().includes(searchValue.toLowerCase()));

  const handleCreate = () => {
    tagStore.setActiveTagId(null);

    setAliases([]);
    setLabel("");
    setParentTags([]);

    tagStore.setTagManagerMode("create");
  };

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    const tag = tagStore.getById(tagId);

    setAliases(tag.aliases);
    setLabel(tag.label);
    setParentTags(tag.parentTags);

    tagStore.setTagManagerMode("edit");
  };

  const saveTag = async () => {
    const parentIds = parentTags.map((t) => t.id);

    if (tagStore.tagManagerMode === "create")
      await createTag({ aliases, label, parentIds, tagStore });
    else await editTag({ aliases, id: tagStore.activeTagId, label, parentIds, tagStore });

    tagStore.setTagManagerMode("search");
  };

  return (
    <Dialog open onClose={closeModal} scroll="paper">
      <DialogTitle className={css.dialogTitle}>Manage Tags</DialogTitle>

      <DialogContent dividers={true} className={css.dialogContent}>
        {tagStore.tagManagerMode === "search" ? (
          <View column>
            <Text align="center" className={css.sectionTitle}>
              Search
            </Text>

            <Input value={searchValue} setValue={setSearchValue} className={css.input} />

            <View className={css.tagContainer}>
              {getTagOptions().map((t) => (
                <Tag key={t.id} id={t.id} count={t.count} onClick={() => handleTagPress(t.id)} />
              ))}
            </View>
          </View>
        ) : (
          <View column>
            <Text align="center" className={css.sectionTitle}>
              Label
            </Text>
            <Input value={label} setValue={setLabel} className={css.input} />

            <Text align="center" className={css.sectionTitle}>
              Aliases
            </Text>
            <Input value={aliases} setValue={setAliases} className={css.input} />

            <Text align="center" className={css.sectionTitle}>
              Parent Tags
            </Text>
            <TagInput
              value={parentTags}
              onChange={(val) => setParentTags(val)}
              options={tagStore.tagOptions}
              className={css.input}
            />
          </View>
        )}
      </DialogContent>

      <DialogActions className={css.dialogActions}>
        {tagStore.tagManagerMode === "search" ? (
          <>
            <Button onClick={closeModal} color="secondary">
              Close
            </Button>

            <Button onClick={handleCreate} color="primary">
              Create
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => tagStore.setTagManagerMode("search")} color="secondary">
              Cancel
            </Button>

            <Button onClick={saveTag} color="primary">
              Confirm
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
});

export default TagManager;

const useClasses = makeStyles()({
  dialogActions: {
    justifyContent: "center",
  },
  dialogContent: {
    padding: "0.5rem 1rem",
  },
  dialogTitle: {
    margin: 0,
    padding: "0.5rem 0",
    textAlign: "center",
  },
  input: {
    marginBottom: "0.5rem",
    minWidth: "15rem",
  },
  sectionTitle: {
    marginTop: "0.3rem",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    fontSize: "0.8em",
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: "0.3rem",
    padding: "0.5rem",
    minHeight: "5rem",
    width: "20rem",
    backgroundColor: colors.grey["800"],
  },
  tagCount: {
    borderRadius: "0.3rem",
    marginRight: "0.5em",
    width: "1.5rem",
    textAlign: "center",
    backgroundColor: colors.blue["800"],
  },
});
