import { useMemo } from "react";
import { TagOption, observer, useStores } from "medior/store";
import { Divider, Drawer as MuiDrawer, List } from "@mui/material";
import {
  Accordion,
  Button,
  Checkbox,
  DateRange,
  Dropdown,
  ListItem,
  NumInput,
  SortMenu,
  SortMenuProps,
  TagInput,
  Text,
  View,
} from "medior/components";
import { ExtCheckbox } from ".";
import {
  colors,
  CONSTANTS,
  getConfig,
  LOGICAL_OPS,
  LogicalOp,
  makeClasses,
  openSearchWindow,
  useDeepMemo,
} from "medior/utils";

const NUM_OF_TAGS_OPS = [
  { label: "Any", value: "" },
  ...LOGICAL_OPS.map((op) => ({ label: op, value: op })),
];

export interface DrawerProps {
  hasImports?: boolean;
  hasSettings?: boolean;
}

export const Drawer = observer(({ hasImports = false, hasSettings = false }: DrawerProps) => {
  const config = getConfig();

  const { css } = useClasses(null);

  const stores = useStores();

  const searchValue = useDeepMemo(stores.file.search.searchValue);

  const [isAllImageTypesSelected, isAnyImageTypesSelected] = useMemo(() => {
    const allTypes = Object.values(stores.file.search.selectedImageTypes);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [stores.file.search.selectedImageTypes]);

  const [isAllVideoTypesSelected, isAnyVideoTypesSelected] = useMemo(() => {
    const allTypes = Object.values(stores.file.search.selectedVideoTypes);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [stores.file.search.selectedVideoTypes]);

  const handleClose = () => stores.home.setIsDrawerOpen(false);

  const handleCollections = () => {
    stores.collection.manager.setFileIds([]);
    stores.collection.setIsManagerOpen(true);
  };

  const handleDateCreatedEndChange = (val: string) => stores.file.search.setDateCreatedEnd(val);

  const handleDateCreatedStartChange = (val: string) => stores.file.search.setDateCreatedStart(val);

  const handleDateModifiedEndChange = (val: string) => stores.file.search.setDateModifiedEnd(val);

  const handleDateModifiedStartChange = (val: string) =>
    stores.file.search.setDateModifiedStart(val);

  const handleImport = () => stores.import.setIsImportManagerOpen(true);

  const handleManageTags = () => stores.tag.manager.setIsOpen(true);

  const handleNumOfTagsOpChange = (val: LogicalOp | "") => stores.file.search.setNumOfTagsOp(val);

  const handleNumOfTagsValueChange = (val: number) => stores.file.search.setNumOfTagsValue(val);

  const handleResetSearch = () => {
    stores.file.search.reset();
    handleSearch();
  };

  const handleSearch = () => stores.file.search.loadFilteredFiles({ page: 1 });

  const handleSearchWindow = () => openSearchWindow();

  const handleSettings = () => stores.home.settings.setIsOpen(true);

  const handleSortChange = (val: SortMenuProps["value"]) => stores.file.search.setSortValue(val);

  const setSearchValue = (val: TagOption[]) => stores.file.search.setSearchValue(val);

  const toggleArchiveOpen = () =>
    stores.file.search.setIsArchiveOpen(!stores.file.search.isArchiveOpen);

  const toggleHasDiffParams = () =>
    stores.file.search.setHasDiffParams(!stores.file.search.hasDiffParams);

  const toggleImageTypes = () =>
    stores.file.search.setSelectedImageTypes(
      Object.fromEntries(
        config.file.imageTypes.map((t) => [t, isAllImageTypesSelected ? false : true])
      )
    );

  const toggleVideoTypes = () =>
    stores.file.search.setSelectedVideoTypes(
      Object.fromEntries(
        config.file.videoTypes.map((t) => [t, isAllVideoTypesSelected ? false : true])
      )
    );

  return (
    <MuiDrawer
      PaperProps={{ className: css.drawer }}
      ModalProps={{ keepMounted: true }}
      open={stores.home.isDrawerOpen}
      onClose={handleClose}
      variant="persistent"
    >
      <List disablePadding className={css.list}>
        {hasSettings && <ListItem text="Settings" icon="Settings" onClick={handleSettings} />}

        {hasImports && <ListItem text="Imports" icon="GetApp" onClick={handleImport} />}

        <ListItem text="Tags" icon="More" onClick={handleManageTags} />

        <ListItem text="Collections" icon="Collections" onClick={handleCollections} />

        <ListItem text="Search Window" icon="Search" onClick={handleSearchWindow} />
      </List>

      <Divider className={css.divider} />

      <View column spacing="0.5rem" margins={{ left: "0.5rem", right: "0.5rem" }}>
        <Button text="Search" icon="Search" onClick={handleSearch} width="-webkit-fill-available" />

        <Button
          text="Reset"
          icon="Refresh"
          onClick={handleResetSearch}
          width="-webkit-fill-available"
          color={colors.button.grey}
        />

        <SortMenu
          rows={CONSTANTS.SORT_MENU_OPTS.FILE_SEARCH}
          value={stores.file.search.sortValue}
          setValue={handleSortChange}
          width="100%"
        />

        <TagInput
          label="Tags"
          value={searchValue}
          onChange={setSearchValue}
          width={CONSTANTS.DRAWER_WIDTH - 20}
          detachLabel
          hasSearchMenu
        />

        <View column>
          <Text preset="label-glow">{"# of Tags"}</Text>
          <View row justify="space-between" spacing="0.3rem">
            <Dropdown
              value={stores.file.search.numOfTagsOp}
              setValue={handleNumOfTagsOpChange}
              options={NUM_OF_TAGS_OPS}
              width="5rem"
            />

            <NumInput
              value={stores.file.search.numOfTagsValue}
              setValue={handleNumOfTagsValueChange}
              maxValue={50}
              disabled={stores.file.search.numOfTagsOp === ""}
              width="5rem"
              textAlign="center"
              hasHelper={false}
            />
          </View>
        </View>
      </View>

      <Checkbox
        label="Archived"
        checked={stores.file.search.isArchiveOpen}
        setChecked={toggleArchiveOpen}
        flex="none"
      />

      <Checkbox
        label="Diffusion"
        checked={stores.file.search.hasDiffParams}
        setChecked={toggleHasDiffParams}
        flex="none"
      />

      <View row className={css.accordionContainer}>
        <Checkbox
          checked={isAllImageTypesSelected}
          indeterminate={!isAllImageTypesSelected && isAnyImageTypesSelected}
          setChecked={toggleImageTypes}
          className={css.accordionHeaderCheckbox}
        />

        <Accordion header={<Text noWrap>{"Images"}</Text>} fullWidth className={css.accordion}>
          {config.file.imageTypes.map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Image" />
          ))}
        </Accordion>
      </View>

      <View row className={css.accordionContainer}>
        <Checkbox
          checked={isAllVideoTypesSelected}
          indeterminate={!isAllVideoTypesSelected && isAnyVideoTypesSelected}
          setChecked={toggleVideoTypes}
          className={css.accordionHeaderCheckbox}
        />

        <Accordion header={<Text noWrap>{"Videos"}</Text>} fullWidth className={css.accordion}>
          {config.file.videoTypes.map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Video" />
          ))}
        </Accordion>
      </View>

      <View column spacing="0.4rem" margins={{ left: "0.5rem", right: "0.5rem" }}>
        <DateRange
          startDate={stores.file.search.dateCreatedStart}
          setStartDate={handleDateCreatedStartChange}
          startLabel="Date Created - Start"
          endDate={stores.file.search.dateCreatedEnd}
          setEndDate={handleDateCreatedEndChange}
          endLabel="Date Created - End"
          column
        />

        <DateRange
          startDate={stores.file.search.dateModifiedStart}
          setStartDate={handleDateModifiedStartChange}
          startLabel="Date Modified - Start"
          endDate={stores.file.search.dateModifiedEnd}
          setEndDate={handleDateModifiedEndChange}
          endLabel="Date Modified - End"
          column
        />
      </View>
    </MuiDrawer>
  );
});

const useClasses = makeClasses({
  accordion: {
    "& > button": { padding: "0.5rem 0.2rem" },
  },
  accordionContainer: {
    width: "100%",
  },
  accordionHeaderCheckbox: {
    height: "fit-content",
  },
  divider: {
    margin: "0.5rem 0",
    width: "100%",
  },
  drawer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderRight: "1px solid #111",
    marginTop: CONSTANTS.TOP_BAR_HEIGHT,
    paddingBottom: "5rem",
    width: CONSTANTS.DRAWER_WIDTH,
    background: colors.grey["900"],
    zIndex: 20,
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  list: {
    width: "100%",
  },
});
