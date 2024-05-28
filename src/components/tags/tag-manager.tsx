import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { FixedSizeGrid } from "react-window";
import {
  Button,
  Checkbox,
  Chip,
  DateRange,
  DisplayedTags,
  Dropdown,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  NumInput,
  Pagination,
  SortMenu,
  SortMenuProps,
  TagInput,
  Text,
  View,
} from "components";
import {
  CONSTANTS,
  LOGICAL_OPS,
  LogicalOp,
  colors,
  makeClasses,
  openSearchWindow,
  useDeepEffect,
} from "utils";
import { toast } from "react-toastify";

const COUNT_OPS = [
  { label: "Any", value: "" },
  ...LOGICAL_OPS.map((op) => ({ label: op, value: op })),
];

export const TagManager = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const hasNoSelection = stores.tagManager.selectedIds.length === 0;

  const resultsRef = useRef<FixedSizeGrid>(null);
  useDeepEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTo({ scrollTop: 0 });
  }, [stores.tagManager.tags]);

  useEffect(() => {
    stores.tagManager.resetSearch();
    stores.tagManager.loadFilteredTags({ page: 1 });
  }, []);

  const handleClose = () => {
    stores.tagManager.setIsOpen(false);
    stores.home.reloadIfQueued();
  };

  const handleCountChange = (val: LogicalOp | "") => stores.tagManager.setCountOp(val);

  const handleCountValueChange = (val: number) => stores.tagManager.setCountValue(val);

  const handleCreate = () => {
    stores.tag.setActiveTagId(null);
    stores.tag.setIsTagEditorOpen(true);
  };

  const handleDateCreatedEndChange = (val: string) => stores.tagManager.setDateCreatedEnd(val);

  const handleDateCreatedStartChange = (val: string) => stores.tagManager.setDateCreatedStart(val);

  const handleDateModifiedEndChange = (val: string) => stores.tagManager.setDateModifiedEnd(val);

  const handleDateModifiedStartChange = (val: string) =>
    stores.tagManager.setDateModifiedStart(val);

  const handleEditRelations = () => stores.tagManager.setIsMultiTagEditorOpen(true);

  const handlePageChange = (page: number) => stores.tagManager.loadFilteredTags({ page });

  const handleRefreshTags = () => stores.tagManager.refreshSelectedTags();

  const handleResetSearch = () => {
    stores.tagManager.resetSearch();
    handleSearch();
  };

  const handleSearch = () => stores.tagManager.loadFilteredTags({ page: 1 });

  const handleSearchChange = (val: TagOption[]) => stores.tagManager.setSearchValue(val);

  const handleSearchWindow = () => openSearchWindow({ tagIds: stores.tagManager.selectedIds });

  const handleSelectAll = () => {
    stores.tagManager.toggleTagsSelected(
      stores.tagManager.tags.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added ${stores.tagManager.tags.length} tags to selection`);
  };

  const handleSelectNone = () => {
    stores.tagManager.toggleTagsSelected(
      stores.tagManager.selectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all tags");
  };

  const setTagManagerSort = (val: SortMenuProps["value"]) => stores.tagManager.setSortValue(val);

  return (
    <Modal.Container onClose={handleClose} height="100%" width="100%">
      <Modal.Header>
        <Text>{"Manage Tags"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        <View column spacing="0.5rem" className={css.searchColumn}>
          <Button
            text="Search"
            icon="Search"
            onClick={handleSearch}
            disabled={stores.tagManager.isLoading}
            width="-webkit-fill-available"
          />

          <Button
            text="Reset"
            icon="Refresh"
            onClick={handleResetSearch}
            disabled={stores.tagManager.isLoading}
            color={colors.button.grey}
            width="-webkit-fill-available"
          />

          <SortMenu
            rows={CONSTANTS.SORT_MENU_OPTS.TAG_SEARCH}
            value={stores.tagManager.sortValue}
            setValue={setTagManagerSort}
            color={colors.button.darkGrey}
            width="100%"
          />

          <TagInput
            label="Tags"
            value={stores.tagManager.searchValue}
            onChange={handleSearchChange}
            detachLabel
            hasSearchMenu
            width="100%"
          />

          <View column>
            <Text preset="label-glow">{"Tag File Count"}</Text>

            <View row justify="space-between" spacing="0.3rem">
              <Dropdown
                value={stores.tagManager.countOp}
                setValue={handleCountChange}
                options={COUNT_OPS}
                width="8rem"
              />

              <NumInput
                value={stores.tagManager.countValue}
                setValue={handleCountValueChange}
                disabled={stores.tagManager.countOp === ""}
                textAlign="center"
                hasHelper={false}
              />
            </View>
          </View>

          <Checkbox
            label="Has RegEx"
            checked={stores.tagManager.regExMode === "hasRegEx"}
            indeterminate={stores.tagManager.regExMode === "hasNoRegEx"}
            setChecked={stores.tagManager.toggleRegExMode}
            flex={0}
          />

          <View column spacing="0.4rem">
            <DateRange
              startDate={stores.tagManager.dateCreatedStart}
              setStartDate={handleDateCreatedStartChange}
              startLabel="Date Created - Start"
              endDate={stores.tagManager.dateCreatedEnd}
              setEndDate={handleDateCreatedEndChange}
              endLabel="Date Created - End"
              column
            />

            <DateRange
              startDate={stores.tagManager.dateModifiedStart}
              setStartDate={handleDateModifiedStartChange}
              startLabel="Date Modified - Start"
              endDate={stores.tagManager.dateModifiedEnd}
              setEndDate={handleDateModifiedEndChange}
              endLabel="Date Modified - End"
              column
            />
          </View>
        </View>

        <View className={css.tags}>
          <LoadingOverlay isLoading={stores.tagManager.isLoading} />

          <View className={css.multiActionBar}>
            <View row spacing="0.5rem">
              {!hasNoSelection && (
                <Chip label={`${stores.tagManager.selectedIds.length} Selected`} />
              )}
            </View>

            <View row spacing="0.5rem">
              <MultiActionButton
                name="Deselect"
                tooltip="Deselect All Tags"
                onClick={handleSelectNone}
                disabled={hasNoSelection}
              />

              <MultiActionButton
                name="SelectAll"
                tooltip="Select All Tags in View"
                onClick={handleSelectAll}
              />

              <MultiActionButton
                name="Refresh"
                tooltip="Refresh Selected Tags"
                onClick={handleRefreshTags}
                disabled={hasNoSelection}
              />

              <MultiActionButton
                name="Label"
                tooltip="Edit Tag Relations"
                onClick={handleEditRelations}
                disabled={hasNoSelection}
              />

              <MultiActionButton
                name="Search"
                tooltip="Open Search Window with Selected Tags"
                onClick={handleSearchWindow}
                disabled={hasNoSelection}
              />
            </View>
          </View>

          <DisplayedTags />

          <Pagination
            count={stores.tagManager.pageCount}
            page={stores.tagManager.page}
            onChange={handlePageChange}
          />
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
  multiActionBar: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopRightRadius: "inherit",
    borderTopLeftRadius: "inherit",
    padding: "0.2rem 0.5rem",
    backgroundColor: colors.grey["900"],
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
    position: "relative",
    display: "flex",
    flexDirection: "column",
    borderRadius: "0.4rem",
    height: "100%",
    width: "100%",
    backgroundColor: colors.grey["800"],
  },
});
