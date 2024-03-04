import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, sortFiles, useStores } from "store";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid } from "react-window";
import {
  Button,
  Checkbox,
  ListItem,
  MenuButton,
  Modal,
  SortMenu,
  SortMenuProps,
  Tag,
  TagInput,
  Text,
  View,
} from "components";
import { CONSTANTS, colors, makeClasses } from "utils";

export const TagManager = observer(() => {
  const { css } = useClasses(null);

  const { tagStore } = useStores();

  const [searchValue, setSearchValue] = useState<TagOption[]>([]);
  const [width, setWidth] = useState(0);

  const tagOptions = useMemo(() => {
    const {
      excludedDescTagIdArrays,
      excludedTagIds,
      optionalTagIds,
      requiredTagIds,
      requiredDescTagIdArrays,
    } = tagStore.tagSearchOptsToIds(searchValue, true);

    return [...tagStore.tags]
      .reduce((acc, cur) => {
        if (optionalTagIds.length && !optionalTagIds.includes(cur.id)) return acc;

        if (excludedTagIds.length || excludedDescTagIdArrays.length) {
          if (
            excludedTagIds.includes(cur.id) ||
            excludedDescTagIdArrays.some((ids) => ids.some((id) => id === cur.id))
          )
            return acc;
        }

        if (requiredTagIds.length || requiredDescTagIdArrays.length) {
          if (
            !requiredTagIds.includes(cur.id) &&
            !requiredDescTagIdArrays.every((ids) => ids.some((id) => id === cur.id))
          )
            return acc;
        }

        if (tagStore.tagManagerRegExMode !== "any") {
          const hasRegEx = cur.regExMap?.regEx?.length > 0;
          if (tagStore.tagManagerRegExMode === "hasRegEx" && !hasRegEx) return acc;
          if (tagStore.tagManagerRegExMode === "hasNoRegEx" && hasRegEx) return acc;
        }

        acc.push(cur.tagOption);
        return acc;
      }, [] as TagOption[])
      .sort((a, b) => sortFiles({ a, b, ...tagStore.tagManagerSort }));
  }, [
    tagStore.tagManagerRegExMode,
    JSON.stringify(searchValue),
    JSON.stringify(tagStore.tags),
    JSON.stringify(tagStore.tagManagerSort),
  ]);

  const resultsRef = useRef<FixedSizeGrid>(null);
  useEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTo({ scrollTop: 0 });
  }, [JSON.stringify(tagOptions)]);

  const columnWidth = 250;
  const rowHeight = 50;

  const columnCount = Math.floor(width / columnWidth);
  const rowCount = Math.ceil(tagOptions.length / columnCount);

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const handleCreate = () => {
    tagStore.setActiveTagId(null);
    tagStore.setIsTagEditorOpen(true);
  };

  const handleRefreshCounts = () => tagStore.refreshAllTagCounts();

  const handleRefreshRelations = () => tagStore.refreshAllTagRelations();

  const handleResize = ({ width }) => setWidth(width);

  const setTagManagerSort = (val: SortMenuProps["value"]) => tagStore.setTagManagerSort(val);

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
      <Modal.Header
        rightNode={
          <MenuButton color={colors.button.grey}>
            <ListItem text="Refresh Counts" icon="Refresh" onClick={handleRefreshCounts} />
            <ListItem text="Refresh Relations" icon="Refresh" onClick={handleRefreshRelations} />
          </MenuButton>
        }
      >
        <Text>{"Manage Tags"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        <View className={css.searchRow}>
          <TagInput
            label="Search Tags"
            value={searchValue}
            onChange={setSearchValue}
            hasSearchMenu
            width="100%"
          />

          <Checkbox
            label="Has RegEx"
            checked={tagStore.tagManagerRegExMode === "hasRegEx"}
            indeterminate={tagStore.tagManagerRegExMode === "hasNoRegEx"}
            setChecked={tagStore.toggleTagManagerRegExMode}
          />

          <SortMenu
            rows={CONSTANTS.SORT_MENU_OPTS.TAG_SEARCH}
            value={tagStore.tagManagerSort}
            setValue={setTagManagerSort}
            color={colors.button.darkGrey}
          />
        </View>

        <View className={css.tags}>
          <AutoSizer onResize={handleResize}>
            {({ height, width }) => (
              <FixedSizeGrid
                ref={resultsRef}
                {...{ columnCount, columnWidth, height, rowCount, rowHeight, width }}
              >
                {renderTag}
              </FixedSizeGrid>
            )}
          </AutoSizer>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={closeModal} color={colors.button.grey} />

        <Button text="Create" icon="Add" onClick={handleCreate} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  modalContent: {
    overflow: "hidden",
  },
  searchRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: "0.5rem",
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
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
