import { forwardRef, useContext, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { IMAGE_TYPES, VIDEO_TYPES } from "store/files";
import { Divider, Drawer as MuiDrawer, List, colors } from "@mui/material";
import {
  Accordion,
  Checkbox,
  FileCollectionEditor,
  FileCollectionManager,
  IconButton,
  ListItem,
  TagInput,
  TagManager,
  Text,
  View,
} from "components";
import { ExtCheckbox, Importer } from ".";
import { makeClasses } from "utils";
import * as Media from "media";
import { HomeContext } from "views";

const Drawer = observer(
  forwardRef((_, drawerRef: any) => {
    const context = useContext(HomeContext);
    const { appStore, fileCollectionStore, fileStore, tagStore } = useStores();

    const { classes: css } = useClasses({ drawerMode: appStore.drawerMode });

    const [isImporterOpen, setIsImporterOpen] = useState(false);
    const [isImageTypesOpen, setIsImageTypesOpen] = useState(false);
    const [isVideoTypesOpen, setIsVideoTypesOpen] = useState(false);

    const handleDescendants = () => context?.setIncludeDescendants(!context?.includeDescendants);

    const handleManageTags = () => {
      tagStore.setTagManagerMode("search");
      tagStore.setIsTagManagerOpen(true);
    };

    const handleTagged = () => {
      if (!context?.includeTagged && !context?.includeUntagged) context?.setIncludeTagged(true);
      else if (context?.includeTagged) {
        context?.setIncludeTagged(false);
        context?.setIncludeUntagged(true);
      } else context?.setIncludeUntagged(false);
    };

    const toggleArchiveOpen = () => context?.setIsArchiveOpen(!context.isArchiveOpen);

    return (
      <MuiDrawer
        PaperProps={{ className: css.drawer, ref: drawerRef }}
        ModalProps={{ keepMounted: true }}
        open={appStore.isDrawerOpen}
        onClose={() => appStore.setIsDrawerOpen(false)}
        variant={appStore.drawerMode}
      >
        <View className={css.topActions}>
          <IconButton name="Menu" onClick={() => appStore.setIsDrawerOpen(false)} size="medium" />

          <IconButton onClick={appStore.toggleDrawerMode} size="medium">
            <Media.PinSVG className={css.pin} />
          </IconButton>
        </View>

        <List>
          <ListItem text="Manage Tags" icon="More" onClick={handleManageTags} />

          <ListItem text="Import" icon="GetApp" onClick={() => setIsImporterOpen(true)} />

          <ListItem
            text={`${context?.isArchiveOpen ? "Close" : "Open"} Archive`}
            icon={context?.isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={toggleArchiveOpen}
          />
        </List>

        <Divider variant="middle" />

        <Text align="center" className={css.inputTitle}>
          Include
        </Text>
        <TagInput
          value={[...context?.includedTags]}
          setValue={context?.setIncludedTags}
          options={tagStore.tagOptions}
          limitTags={3}
          className={css.input}
        />

        <Text align="center" className={css.inputTitle}>
          Exclude
        </Text>
        <TagInput
          value={[...context?.excludedTags]}
          setValue={context?.setExcludedTags}
          options={tagStore.tagOptions}
          limitTags={3}
          className={css.input}
        />

        <View className={css.checkboxes} column>
          <Checkbox
            label="Descendants"
            checked={context?.includeDescendants}
            setChecked={handleDescendants}
          />

          <Checkbox
            label="Tagged"
            checked={context?.includeTagged}
            indeterminate={context?.includeUntagged}
            setChecked={handleTagged}
          />
        </View>

        <Accordion
          header={<Text>Image Types</Text>}
          expanded={isImageTypesOpen}
          setExpanded={setIsImageTypesOpen}
          fullWidth
        >
          {IMAGE_TYPES.map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Image" />
          ))}
        </Accordion>

        <Accordion
          header={<Text>Video Types</Text>}
          expanded={isVideoTypesOpen}
          setExpanded={setIsVideoTypesOpen}
          fullWidth
        >
          {VIDEO_TYPES.map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Video" />
          ))}
        </Accordion>

        {tagStore.isTagManagerOpen && <TagManager />}

        {fileCollectionStore.isCollectionManagerOpen && <FileCollectionManager />}

        {fileCollectionStore.isCollectionEditorOpen && <FileCollectionEditor />}

        <Importer isOpen={isImporterOpen} setIsOpen={setIsImporterOpen} />
      </MuiDrawer>
    );
  })
);

export default Drawer;

const useClasses = makeClasses((_, { drawerMode }) => ({
  checkboxes: {
    padding: "0.3rem",
    width: "100%",
  },
  drawer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderRight: "1px solid #111",
    width: "200px",
    backgroundColor: colors.grey["900"],
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
