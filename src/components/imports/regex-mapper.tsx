import { useRef } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { FixedSizeList } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Button, Input, Modal, TagInput, Text, View } from "components";
import { REGEX_ROW_HEIGHT, RegExMapRow } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const ImportRegExMapper = observer(() => {
  const { css } = useClasses(null);

  const listRef = useRef<HTMLElement>(null);

  const { importStore } = useStores();

  const hasUnsavedChanges = importStore.regExMaps.some((map) => map.hasUnsavedChanges);

  const handleAdd = () => {
    importStore.addRegExMap();
    setTimeout(scrollToBottom, 100);
  };

  const handleClose = () => {
    importStore.setIsImportRegExMapperOpen(false);
    importStore.loadRegExMaps();
  };

  const handleSave = async () => {
    await importStore.saveRegExMaps();
    await importStore.loadRegExMaps();
    toast.success("RegEx mappings saved!");
  };

  const handleRegExSearchChange = (value: string) => importStore.setRegExSearchValue(value);

  const handleTagSearchChange = (value: TagOption[]) => importStore.setTagSearchValue(value);

  const scrollToBottom = () =>
    listRef.current.scrollTo({ behavior: "smooth", top: listRef.current.scrollHeight });

  return (
    <Modal.Container onClose={handleClose} width="100%" height="100%">
      <Modal.Header>
        <Text>{"Import RegEx Mapper"}</Text>
      </Modal.Header>

      <Modal.Content className={css.content}>
        <View className={css.searchContainer}>
          <Input
            label="Search RegExps"
            value={importStore.regExSearchValue}
            setValue={handleRegExSearchChange}
            className={css.searchInput}
          />

          <TagInput
            label="Search Tags"
            value={[...importStore.tagSearchValue]}
            onChange={handleTagSearchChange}
            fullWidth
            hasSearchMenu
            className={css.searchInput}
          />
        </View>

        <View flex={1}>
          <AutoSizer disableWidth>
            {({ height }) => (
              <FixedSizeList
                outerRef={listRef}
                layout="vertical"
                width="100%"
                height={height}
                itemSize={REGEX_ROW_HEIGHT}
                itemCount={importStore.filteredRegExMaps.length}
              >
                {({ index, style }) => (
                  <RegExMapRow key={index} index={index} style={style} />
                )}
              </FixedSizeList>
            )}
          </AutoSizer>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Close"
          icon="Close"
          onClick={handleClose}
          color={hasUnsavedChanges ? colors.button.red : colors.button.grey}
        />

        <Button text="New Mapping" icon="Add" onClick={handleAdd} />

        <Button text="Save" icon="Save" onClick={handleSave} disabled={!hasUnsavedChanges} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  content: {
    padding: "1rem 0.5rem 0 1rem",
    overflow: "hidden",
  },
  searchInput: {
    minWidth: "20rem",
    "& .MuiOutlinedInput-root": {
      backgroundColor: colors.grey["800"],
    },
  },
  searchContainer: {
    display: "flex",
    flexDirection: "row",
    borderRadius: "0.5rem",
    marginBottom: "0.5rem",
    padding: "0.5rem",
    backgroundColor: colors.grey["900"],
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
});
