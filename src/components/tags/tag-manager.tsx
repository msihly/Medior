import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Checkbox, Input, Text, View } from "components";
import { Tag, TagEditor } from ".";
import { makeClasses } from "utils";

const TITLES = {
  create: "Create Tag",
  edit: "Edit Tag",
  search: "Manage Tags",
};

const TagManager = observer(() => {
  const { tagStore } = useStores();
  const { classes: css } = useClasses(null);

  const [hasDescendents, setHasDescendents] = useState(false);
  const [searchValue, setSearchValue] = useState<string>("");

  const tagOptions = useMemo(() => {
    const searchStr = searchValue.toLowerCase();

    const options =
      searchValue.length > 0
        ? tagStore.tagOptions.filter((t) => {
            return hasDescendents
              ? [...t.parentLabels, t.label].some((label) =>
                  label.toLowerCase().includes(searchStr)
                )
              : t.label.toLowerCase().includes(searchStr);
          })
        : tagStore.tagOptions;

    return options;
  }, [hasDescendents, searchValue, tagStore.tagOptions]);

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const handleCreate = () => {
    tagStore.setActiveTagId(null);
    tagStore.setTagManagerMode("create");
  };

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setTagManagerMode("edit");
  };

  const handleEditorBack = () => tagStore.setTagManagerMode("search");

  return (
    <Dialog open onClose={closeModal} scroll="paper">
      <DialogTitle className={css.dialogTitle}>{TITLES[tagStore.tagManagerMode]}</DialogTitle>

      {tagStore.tagManagerMode === "search" ? (
        <>
          <DialogContent dividers={true} className={css.dialogContent}>
            <View column>
              <Text align="center" className={css.sectionTitle}>
                Search
              </Text>

              <Input value={searchValue} setValue={setSearchValue} className={css.input} />

              <Checkbox
                label="Include Descendants"
                checked={hasDescendents}
                setChecked={setHasDescendents}
                center
              />

              <View className={css.tagContainer}>
                {tagOptions.map((t) => (
                  <Tag
                    key={t.id}
                    id={t.id}
                    onClick={() => handleTagPress(t.id)}
                    className={css.tag}
                  />
                ))}
              </View>
            </View>
          </DialogContent>

          <DialogActions className={css.dialogActions}>
            <Button text="Close" icon="Close" onClick={closeModal} color={colors.red["800"]} />

            <Button text="Create" icon="Add" onClick={handleCreate} />
          </DialogActions>
        </>
      ) : (
        <TagEditor
          isCreate={tagStore.tagManagerMode === "create"}
          onCancel={handleEditorBack}
          onSave={handleEditorBack}
        />
      )}
    </Dialog>
  );
});

export default TagManager;

const useClasses = makeClasses({
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
  tag: {
    marginBottom: "0.3em",
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
});
