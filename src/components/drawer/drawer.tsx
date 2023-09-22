import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Divider, Drawer as MuiDrawer, List, colors } from "@mui/material";
import {
  Accordion,
  Checkbox,
  IconButton,
  ListItem,
  TagInput,
  TagManager,
  Text,
  View,
} from "components";
import { ExtCheckbox, Importer } from ".";
import { IMAGE_TYPES, makeClasses, VIDEO_TYPES } from "utils";
import * as Media from "media";
import Color from "color";

export const Drawer = observer(() => {
  const { homeStore, tagStore } = useStores();

  const { css } = useClasses({ drawerMode: homeStore.drawerMode });

  const [isImporterOpen, setIsImporterOpen] = useState(false);

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

  const handleDescendants = () => homeStore.setIncludeDescendants(!homeStore.includeDescendants);

  const handleManageTags = () => {
    tagStore.setTagManagerMode("search");
    tagStore.setIsTagManagerOpen(true);
  };

  const handleTagged = () => {
    if (!homeStore.includeTagged && !homeStore.includeUntagged) homeStore.setIncludeTagged(true);
    else if (homeStore.includeTagged) {
      homeStore.setIncludeTagged(false);
      homeStore.setIncludeUntagged(true);
    } else homeStore.setIncludeUntagged(false);
  };

  const toggleArchiveOpen = () => homeStore.setIsArchiveOpen(!homeStore.isArchiveOpen);

  const toggleImageTypes = () =>
    homeStore.setSelectedImageTypes(
      Object.fromEntries(IMAGE_TYPES.map((t) => [t, isAllImageTypesSelected ? false : true]))
    );

  const toggleVideoTypes = () =>
    homeStore.setSelectedVideoTypes(
      Object.fromEntries(VIDEO_TYPES.map((t) => [t, isAllVideoTypesSelected ? false : true]))
    );

  return (
    <MuiDrawer
      PaperProps={{ className: css.drawer }}
      ModalProps={{ keepMounted: true }}
      open={homeStore.isDrawerOpen}
      onClose={handleClose}
      variant={homeStore.drawerMode}
    >
      <View className={css.topActions}>
        <IconButton name="Menu" onClick={handleClose} size="medium" />

        <IconButton onClick={homeStore.toggleDrawerMode} size="medium">
          <Media.PinSVG className={css.pin} />
        </IconButton>
      </View>

      <List>
        <ListItem text="Manage Tags" icon="More" onClick={handleManageTags} />

        <ListItem text="Import" icon="GetApp" onClick={() => setIsImporterOpen(true)} />

        <ListItem
          text={`${homeStore.isArchiveOpen ? "Close" : "Open"} Archive`}
          icon={homeStore.isArchiveOpen ? "Unarchive" : "Archive"}
          onClick={toggleArchiveOpen}
        />
      </List>

      <Divider variant="middle" />

      <Text align="center" className={css.inputTitle}>
        {"Include - All"}
      </Text>
      <TagInput
        value={[...homeStore.includedAllTags]}
        setValue={(val) => homeStore.setIncludedAllTags(val)}
        options={[...tagStore.tagOptions]}
        limitTags={3}
        className={css.input}
      />

      <Text align="center" className={css.inputTitle}>
        {"Include - Any"}
      </Text>
      <TagInput
        value={[...homeStore.includedAnyTags]}
        setValue={(val) => homeStore.setIncludedAnyTags(val)}
        options={[...tagStore.tagOptions]}
        limitTags={3}
        className={css.input}
      />

      <Text align="center" className={css.inputTitle}>
        {"Exclude - Any"}
      </Text>
      <TagInput
        value={[...homeStore.excludedAnyTags]}
        setValue={(val) => homeStore.setExcludedAnyTags(val)}
        options={[...tagStore.tagOptions]}
        limitTags={3}
        className={css.input}
      />

      <View className={css.checkboxes} column>
        <Checkbox
          label="Descendants"
          checked={homeStore.includeDescendants}
          setChecked={handleDescendants}
        />

        <Checkbox
          label="Tagged"
          checked={homeStore.includeTagged}
          indeterminate={homeStore.includeUntagged}
          setChecked={handleTagged}
        />
      </View>

      <View row className={css.accordionContainer}>
        <Checkbox
          checked={isAllImageTypesSelected}
          indeterminate={!isAllImageTypesSelected && isAnyImageTypesSelected}
          setChecked={toggleImageTypes}
          className={css.accordionHeaderCheckbox}
        />

        <Accordion header={<Text noWrap>Image Types</Text>} fullWidth className={css.accordion}>
          {IMAGE_TYPES.map((ext) => (
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

        <Accordion header={<Text noWrap>Video Types</Text>} fullWidth className={css.accordion}>
          {VIDEO_TYPES.map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Video" />
          ))}
        </Accordion>
      </View>

      {tagStore.isTagManagerOpen && <TagManager />}

      {/* {fileCollectionStore.isCollectionManagerOpen && <FileCollectionManager />}

        {fileCollectionStore.isCollectionEditorOpen && <FileCollectionEditor />} */}

      <Importer isOpen={isImporterOpen} setIsOpen={setIsImporterOpen} />
    </MuiDrawer>
  );
});

const useClasses = makeClasses((_, { drawerMode }) => ({
  accordion: {
    " > button": { padding: "0.5rem 0.2rem" },
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
  drawer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderRight: "1px solid #111",
    width: "200px",
    background: `linear-gradient(to right, ${colors.grey["900"]}, ${Color(colors.grey["900"])
      .darken(0.1)
      .string()})`,
    zIndex: 20,
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  input: {
    padding: "0.1rem 0.4rem",
    width: "192px",
  },
  pin: {
    padding: "0.2rem",
    fill: "white",
    transform: `rotate(${drawerMode === "persistent" ? "0" : "30"}deg)`,
  },
  inputTitle: {
    marginTop: "0.3rem",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    fontSize: "0.8em",
  },
  topActions: {
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.3rem 0.5rem",
    width: "100%",
  },
}));
