import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, sortFiles, useStores } from "store";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid } from "react-window";
import { Button, Modal, SortMenu, SortMenuProps, Tag, TagInput, Text, View } from "components";
import { colors, makeClasses } from "utils";

export const TagManager = observer(() => {
  const { css } = useClasses(null);

  const { tagStore } = useStores();

  const [searchValue, setSearchValue] = useState<TagOption[]>([]);
  const [sortValue, setSortValue] = useState<SortMenuProps["value"]>({
    isDesc: true,
    key: "dateModified",
  });
  const [width, setWidth] = useState(0);

  const columnWidth = 250;
  const rowHeight = 50;

  const columnCount = Math.floor(width / columnWidth);
  const rowCount = Math.ceil(tagStore.tagOptions.length / columnCount);

  const tagOptions = useMemo(() => {
    const { excludedAnyTagIds, includedAllTagIds, includedAnyTagIds } =
      tagStore.tagSearchOptsToIds(searchValue);

    return [...tagStore.tagOptions]
      .filter((t) => {
        if (excludedAnyTagIds.includes(t.id)) return false;
        if (includedAllTagIds.length && !includedAllTagIds.includes(t.id)) return false;
        if (includedAnyTagIds.length && !includedAnyTagIds.includes(t.id)) return false;
        return true;
      })
      .sort((a, b) => sortFiles({ a, b, isDesc: sortValue.isDesc, key: sortValue.key }));
  }, [searchValue, sortValue]);

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const handleCreate = () => {
    tagStore.setActiveTagId(null);
    tagStore.setIsTagEditorOpen(true);
  };

  // const handleRefreshCounts = () => tagStore.refreshAllTagCounts();

  // const handleRefreshRelations = () => tagStore.refreshAllTagRelations();

  const handleResize = ({ width }) => setWidth(width);

  const renderTag = useCallback(
    ({ columnIndex, rowIndex, style }) => {
      const index = rowIndex * columnCount + columnIndex;
      if (index >= tagOptions.length) return null;

      const id = tagOptions[index].id;

      const handleClick = () => {
        tagStore.setActiveTagId(id);
        tagStore.setIsTagEditorOpen(true);
      };

      return (
        <View key={`${columnIndex}-${rowIndex}`} padding={{ right: "0.5rem" }} {...{ style }}>
          <Tag id={id} onClick={handleClick} />
        </View>
      );
    },
    [columnCount, columnWidth, JSON.stringify(tagOptions)]
  );

  return (
    <Modal.Container onClose={closeModal} height="80%" width="80%">
      <Modal.Header>
        <Text>{"Manage Tags"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        <View row justify="space-between" margins={{ bottom: "0.5rem" }}>
          <TagInput value={searchValue} onChange={setSearchValue} hasSearchMenu width="100%" />

          <SortMenu
            rows={[
              { label: "Count", attribute: "count", icon: "Numbers" },
              { label: "Date Modified", attribute: "dateModified", icon: "DateRange" },
              { label: "Date Created", attribute: "dateCreated", icon: "DateRange" },
              { label: "Label", attribute: "label", icon: "Label" },
            ]}
            value={sortValue}
            setValue={setSortValue}
            color={colors.button.darkGrey}
            margins={{ left: "0.5rem" }}
          />
        </View>

        <View className={css.tags}>
          <AutoSizer onResize={handleResize}>
            {({ height, width }) => (
              <FixedSizeGrid {...{ columnCount, columnWidth, height, rowCount, rowHeight, width }}>
                {renderTag}
              </FixedSizeGrid>
            )}
          </AutoSizer>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={closeModal} color={colors.button.grey} />

        {/* <Button
          text="Refresh Counts"
          icon="Refresh"
          onClick={handleRefreshCounts}
          color={colors.blueGrey["700"]}
        /> */}

        {/* <Button
          text="Refresh Relations"
          icon="Refresh"
          onClick={handleRefreshRelations}
          color={colors.blueGrey["700"]}
        /> */}

        <Button text="Create" icon="Add" onClick={handleCreate} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  modalContent: {
    overflow: "hidden",
  },
  tags: {
    display: "flex",
    borderRadius: "0.4rem",
    padding: "0.5rem",
    height: "100%",
    width: "100%",
    backgroundColor: colors.grey["800"],
  },
});
