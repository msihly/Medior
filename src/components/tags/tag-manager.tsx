import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
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
import { CONSTANTS, colors, makeClasses, useDeepEffect } from "utils";

const COLUMN_MIN_WIDTH = 200;
const COLUMN_SPACING = 10;
const ROW_HEIGHT = 50;

export const TagManager = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const [width, setWidth] = useState(0);

  const resultsRef = useRef<FixedSizeGrid>(null);
  useDeepEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTo({ scrollTop: 0 });
  }, [stores.tag.tagManagerOptions]);

  const columnWidth = Math.max(COLUMN_MIN_WIDTH, Math.floor(width / COLUMN_MIN_WIDTH));
  const columnCount = Math.floor(width / columnWidth);
  const rowCount = Math.ceil(stores.tag.tagManagerOptions.length / columnCount);

  const handleClose = () => {
    stores.tag.setIsTagManagerOpen(false);
    stores.home.reloadIfQueued();
  };

  const handleCreate = () => {
    stores.tag.setActiveTagId(null);
    stores.tag.setIsTagEditorOpen(true);
  };

  const handleRefreshCounts = () => stores.tag.refreshAllTagCounts();

  const handleRefreshRelations = () => stores.tag.refreshAllTagRelations();

  const handleResize = ({ width }) => setWidth(width);

  const handleSearchChange = (val: TagOption[]) => stores.tag.setTagManagerSearchValue(val);

  const setTagManagerSort = (val: SortMenuProps["value"]) => stores.tag.setTagManagerSort(val);

  const renderTag = ({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex;
    if (index >= stores.tag.tagManagerOptions.length) return null;

    const id = stores.tag.tagManagerOptions[index].id;

    const handleClick = () => {
      stores.tag.setActiveTagId(id);
      stores.tag.setIsTagEditorOpen(true);
    };

    return (
      <View key={`${columnIndex}-${rowIndex}`} padding={{ right: COLUMN_SPACING }} {...{ style }}>
        <Tag id={id} onClick={handleClick} />
      </View>
    );
  };

  return (
    <Modal.Container onClose={handleClose} height="80%" width="80%">
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
        <View column spacing="0.5rem" className={css.searchColumn}>
          <TagInput
            label="Search Tags"
            value={stores.tag.tagManagerSearchValue}
            onChange={handleSearchChange}
            hasSearchMenu
            width="100%"
          />

          <SortMenu
            rows={CONSTANTS.SORT_MENU_OPTS.TAG_SEARCH}
            value={stores.tag.tagManagerSort}
            setValue={setTagManagerSort}
            color={colors.button.darkGrey}
            width="100%"
          />

          <Checkbox
            label="Has RegEx"
            checked={stores.tag.tagManagerRegExMode === "hasRegEx"}
            indeterminate={stores.tag.tagManagerRegExMode === "hasNoRegEx"}
            setChecked={stores.tag.toggleTagManagerRegExMode}
            flex={0}
          />
        </View>

        <View className={css.tags}>
          <AutoSizer onResize={handleResize}>
            {({ height, width }) => (
              <FixedSizeGrid
                ref={resultsRef}
                {...{ columnCount, columnWidth, height, rowCount, width }}
                rowHeight={ROW_HEIGHT}
              >
                {renderTag}
              </FixedSizeGrid>
            )}
          </AutoSizer>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.button.grey} />

        <Button text="Create" icon="Add" onClick={handleCreate} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  modalContent: {
    display: "flex",
    flexDirection: "row",
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },
  searchColumn: {
    borderRadius: 4,
    marginRight: "0.5rem",
    padding: "0.5rem",
    width: "15rem",
    backgroundColor: colors.grey["800"],
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
