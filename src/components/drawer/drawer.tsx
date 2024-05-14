import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Divider, Drawer as MuiDrawer, List } from "@mui/material";
import {
  Accordion,
  Button,
  Checkbox,
  DateRange,
  Dropdown,
  ListItem,
  NumInput,
  TagInput,
  Text,
  View,
} from "components";
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
} from "utils";

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

  const { fileCollectionStore, homeStore, importStore, tagStore } = useStores();

  const searchValue = useDeepMemo(homeStore.searchValue);

  const [isAllImageTypesSelected, isAnyImageTypesSelected] = useMemo(() => {
    const allTypes = Object.values(homeStore.selectedImageTypes);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [homeStore.selectedImageTypes]);

  const [isAllVideoTypesSelected, isAnyVideoTypesSelected] = useMemo(() => {
    const allTypes = Object.values(homeStore.selectedVideoTypes);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [homeStore.selectedVideoTypes]);

  const handleClose = () => homeStore.setIsDrawerOpen(false);

  const handleCollections = () => {
    fileCollectionStore.setManagerFileIds([]);
    fileCollectionStore.setIsManagerOpen(true);
  };

  const handleDateCreatedEndChange = (val: string) => homeStore.setDateCreatedEnd(val);

  const handleDateCreatedStartChange = (val: string) => homeStore.setDateCreatedStart(val);

  const handleDateModifiedEndChange = (val: string) => homeStore.setDateModifiedEnd(val);

  const handleDateModifiedStartChange = (val: string) => homeStore.setDateModifiedStart(val);

  const handleImport = () => importStore.setIsImportManagerOpen(true);

  const handleManageTags = () => tagStore.setIsTagManagerOpen(true);

  const handleNumOfTagsOpChange = (val: LogicalOp | "") => homeStore.setNumOfTagsOp(val);

  const handleNumOfTagsValueChange = (val: number) => homeStore.setNumOfTagsValue(val);

  const handleResetSearch = () => {
    homeStore.resetSearch();
    handleSearch();
  };

  const handleSearch = () => homeStore.loadFilteredFiles({ page: 1 });

  const handleSearchWindow = () => openSearchWindow();

  const handleSettings = () => homeStore.setIsSettingsOpen(true);

  const setSearchValue = (val: TagOption[]) => homeStore.setSearchValue(val);

  const toggleArchiveOpen = () => homeStore.setIsArchiveOpen(!homeStore.isArchiveOpen);

  const toggleHasDiffParams = () => homeStore.setHasDiffParams(!homeStore.hasDiffParams);

  const toggleImageTypes = () =>
    homeStore.setSelectedImageTypes(
      Object.fromEntries(
        config.file.imageTypes.map((t) => [t, isAllImageTypesSelected ? false : true])
      )
    );

  const toggleVideoTypes = () =>
    homeStore.setSelectedVideoTypes(
      Object.fromEntries(
        config.file.videoTypes.map((t) => [t, isAllVideoTypesSelected ? false : true])
      )
    );

  return (
    <MuiDrawer
      PaperProps={{ className: css.drawer }}
      ModalProps={{ keepMounted: true }}
      open={homeStore.isDrawerOpen}
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

      <Button
        text="Search"
        icon="Search"
        onClick={handleSearch}
        width="-webkit-fill-available"
        margins={{ top: "0.5rem", left: "0.5rem", right: "0.5rem" }}
      />

      <Button
        text="Reset"
        icon="Refresh"
        onClick={handleResetSearch}
        width="-webkit-fill-available"
        color={colors.button.grey}
        margins={{ all: "0.5rem" }}
      />

      <Text preset="label-glow" marginTop="0.3rem">
        {"Tags"}
      </Text>
      <TagInput
        value={searchValue}
        onChange={setSearchValue}
        width={CONSTANTS.DRAWER_WIDTH - 20}
        hasSearchMenu
      />

      <View className={css.checkboxes} column>
        <View column>
          <Text preset="label-glow">{"# of Tags"}</Text>

          <View
            row
            justify="space-between"
            spacing="0.3rem"
            margins={{ left: "0.5rem", right: "0.5rem" }}
          >
            <Dropdown
              value={homeStore.numOfTagsOp}
              setValue={handleNumOfTagsOpChange}
              options={NUM_OF_TAGS_OPS}
              width="5rem"
            />

            <NumInput
              value={homeStore.numOfTagsValue}
              setValue={handleNumOfTagsValueChange}
              maxValue={50}
              disabled={homeStore.numOfTagsOp === ""}
              width="5rem"
              textAlign="center"
            />
          </View>
        </View>

        <Checkbox
          label="Archived"
          checked={homeStore.isArchiveOpen}
          setChecked={toggleArchiveOpen}
        />

        <Checkbox
          label="Diffusion"
          checked={homeStore.hasDiffParams}
          setChecked={toggleHasDiffParams}
        />
      </View>

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
          startDate={homeStore.dateCreatedStart}
          setStartDate={handleDateCreatedStartChange}
          startLabel="Date Created - Start"
          endDate={homeStore.dateCreatedEnd}
          setEndDate={handleDateCreatedEndChange}
          endLabel="Date Created - End"
          column
        />

        <DateRange
          startDate={homeStore.dateModifiedStart}
          setStartDate={handleDateModifiedStartChange}
          startLabel="Date Modified - Start"
          endDate={homeStore.dateModifiedEnd}
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
  checkboxes: {
    margin: "0.3rem 0",
    width: "100%",
  },
  divider: {
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
