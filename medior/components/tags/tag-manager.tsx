import { useEffect, useRef } from "react";
import { TagOption, observer, useStores } from "medior/store";
import { FixedSizeGrid } from "react-window";
import {
  Button,
  CardGrid,
  Checkbox,
  Chip,
  DateRange,
  Dropdown,
  Input,
  LoadingOverlay,
  Modal,
  MultiActionButton,
  NumInput,
  Pagination,
  SortMenu,
  SortMenuProps,
  TagCard,
  TagInput,
  Text,
  View,
} from "medior/components";
import {
  CONSTANTS,
  LOGICAL_OPS,
  LogicalOp,
  colors,
  makeClasses,
  openSearchWindow,
  useDeepEffect,
} from "medior/utils";
import { toast } from "react-toastify";

const COUNT_OPS = [
  { label: "Any", value: "" },
  ...LOGICAL_OPS.map((op) => ({ label: op, value: op })),
];

export const TagManager = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const hasNoSelection = stores.tag.manager.selectedIds.length === 0;

  const resultsRef = useRef<FixedSizeGrid>(null);
  useDeepEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTo({ scrollTop: 0 });
  }, [stores.tag.manager.tags]);

  useEffect(() => {
    stores.tag.manager.resetSearch();
    stores.tag.manager.loadFilteredTags({ page: 1 });
  }, []);

  const handleClose = () => {
    stores.tag.manager.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleCountChange = (val: LogicalOp | "") => stores.tag.manager.setCountOp(val);

  const handleCountValueChange = (val: number) => stores.tag.manager.setCountValue(val);

  const handleCreate = () => {
    stores.tag.setActiveTagId(null);
    stores.tag.setIsTagEditorOpen(true);
  };

  const handleDateCreatedEndChange = (val: string) => stores.tag.manager.setDateCreatedEnd(val);

  const handleDateCreatedStartChange = (val: string) => stores.tag.manager.setDateCreatedStart(val);

  const handleDateModifiedEndChange = (val: string) => stores.tag.manager.setDateModifiedEnd(val);

  const handleDateModifiedStartChange = (val: string) =>
    stores.tag.manager.setDateModifiedStart(val);

  const handleEditRelations = () => stores.tag.manager.setIsMultiTagEditorOpen(true);

  const handlePageChange = (page: number) => stores.tag.manager.loadFilteredTags({ page });

  const handleRefreshTags = () => stores.tag.manager.refreshSelectedTags();

  const handleResetSearch = () => {
    stores.tag.manager.resetSearch();
    handleSearch();
  };

  const handleSearch = () => stores.tag.manager.loadFilteredTags({ page: 1 });

  const handleSearchChange = (val: TagOption[]) => stores.tag.manager.setSearchValue(val);

  const handleSearchWindow = () => openSearchWindow({ tagIds: stores.tag.manager.selectedIds });

  const handleSelectAll = () => {
    stores.tag.manager.toggleTagsSelected(
      stores.tag.manager.tags.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added ${stores.tag.manager.tags.length} tags to selection`);
  };

  const handleSelectNone = () => {
    stores.tag.manager.toggleTagsSelected(
      stores.tag.manager.selectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all tags");
  };

  const setAliasesValue = (val: string) => stores.tag.manager.setAliasesValue(val);

  const setLabelValue = (val: string) => stores.tag.manager.setLabelValue(val);

  const setTagManagerSort = (val: SortMenuProps["value"]) => stores.tag.manager.setSortValue(val);

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
            disabled={stores.tag.manager.isLoading}
            width="-webkit-fill-available"
          />

          <Button
            text="Reset"
            icon="Refresh"
            onClick={handleResetSearch}
            disabled={stores.tag.manager.isLoading}
            color={colors.button.grey}
            width="-webkit-fill-available"
          />

          <SortMenu
            rows={CONSTANTS.SORT_MENU_OPTS.TAG_SEARCH}
            value={stores.tag.manager.sortValue}
            setValue={setTagManagerSort}
            color={colors.button.darkGrey}
            width="100%"
          />

          <Input
            label="Label"
            value={stores.tag.manager.labelValue}
            setValue={setLabelValue}
            detachLabel
          />

          <Input
            label="Aliases"
            value={stores.tag.manager.aliasesValue}
            setValue={setAliasesValue}
            detachLabel
          />

          <TagInput
            label="Tags"
            value={stores.tag.manager.searchValue}
            onChange={handleSearchChange}
            detachLabel
            hasSearchMenu
            width="100%"
          />

          <View column>
            <Text preset="label-glow">{"Tag File Count"}</Text>

            <View row justify="space-between" spacing="0.3rem">
              <Dropdown
                value={stores.tag.manager.countOp}
                setValue={handleCountChange}
                options={COUNT_OPS}
                width="8rem"
              />

              <NumInput
                value={stores.tag.manager.countValue}
                setValue={handleCountValueChange}
                disabled={stores.tag.manager.countOp === ""}
                textAlign="center"
                hasHelper={false}
              />
            </View>
          </View>

          <Checkbox
            label="Has RegEx"
            checked={stores.tag.manager.regExMode === "hasRegEx"}
            indeterminate={stores.tag.manager.regExMode === "hasNoRegEx"}
            setChecked={stores.tag.manager.toggleRegExMode}
            flex={0}
          />

          <View column spacing="0.4rem">
            <DateRange
              startDate={stores.tag.manager.dateCreatedStart}
              setStartDate={handleDateCreatedStartChange}
              startLabel="Date Created - Start"
              endDate={stores.tag.manager.dateCreatedEnd}
              setEndDate={handleDateCreatedEndChange}
              endLabel="Date Created - End"
              column
            />

            <DateRange
              startDate={stores.tag.manager.dateModifiedStart}
              setStartDate={handleDateModifiedStartChange}
              startLabel="Date Modified - Start"
              endDate={stores.tag.manager.dateModifiedEnd}
              setEndDate={handleDateModifiedEndChange}
              endLabel="Date Modified - End"
              column
            />
          </View>
        </View>

        <View className={css.tags}>
          <LoadingOverlay isLoading={stores.tag.manager.isLoading} />

          <View className={css.multiActionBar}>
            <View row spacing="0.5rem">
              {!hasNoSelection && (
                <Chip label={`${stores.tag.manager.selectedIds.length} Selected`} />
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

          <CardGrid
            cards={stores.tag.manager.tags.map((t) => (
              <TagCard key={t.id} tag={t} />
            ))}
          >
            <Pagination
              count={stores.tag.manager.pageCount}
              page={stores.tag.manager.page}
              onChange={handlePageChange}
            />
          </CardGrid>
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
