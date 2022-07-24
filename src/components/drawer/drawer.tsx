import { forwardRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Divider, Drawer as MuiDrawer, List, colors } from "@mui/material";
import { Archive, GetApp as ImportIcon, More as MoreIcon, Unarchive } from "@mui/icons-material";
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
import { makeClasses } from "utils";
import * as Media from "media";

const Drawer = observer(
  forwardRef((_, drawerRef: any) => {
    const { appStore, fileStore, tagStore } = useStores();

    const { classes: css } = useClasses({ drawerMode: appStore.drawerMode });

    const [isImporterOpen, setIsImporterOpen] = useState(false);
    const [isImageTypesOpen, setIsImageTypesOpen] = useState(false);
    const [isVideoTypesOpen, setIsVideoTypesOpen] = useState(false);

    const handleDescendants = () => {
      if (!fileStore.includeDescendants && !fileStore.excludeDescendants)
        fileStore.setIncludeDescendants(true);
      else if (fileStore.includeDescendants) {
        fileStore.setIncludeDescendants(false);
        fileStore.setExcludeDescendants(true);
      } else fileStore.setExcludeDescendants(false);
    };

    const handleTagged = () => {
      if (!fileStore.includeTagged && !fileStore.includeUntagged) fileStore.setIncludeTagged(true);
      else if (fileStore.includeTagged) {
        fileStore.setIncludeTagged(false);
        fileStore.setIncludeUntagged(true);
      } else fileStore.setIncludeUntagged(false);
    };

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
          <ListItem
            text="Manage Tags"
            icon={<MoreIcon />}
            onClick={() => tagStore.setIsTagManagerOpen(true)}
          />

          <ListItem text="Import" icon={<ImportIcon />} onClick={() => setIsImporterOpen(true)} />

          <ListItem
            text={`${fileStore.isArchiveOpen ? "Close" : "Open"} Archive`}
            icon={fileStore.isArchiveOpen ? <Unarchive /> : <Archive />}
            onClick={() => fileStore.toggleArchiveOpen()}
          />
        </List>

        <Divider variant="middle" />

        <Text align="center" className={css.sectionTitle}>
          Include
        </Text>
        <TagInput
          value={[...fileStore.includedTags]}
          setValue={fileStore.setIncludedTags}
          options={tagStore.tagOptions}
          limitTags={3}
          className={css.input}
        />

        <Text align="center" className={css.sectionTitle}>
          Exclude
        </Text>
        <TagInput
          value={[...fileStore.excludedTags]}
          setValue={fileStore.setExcludedTags}
          options={tagStore.tagOptions}
          limitTags={3}
          className={css.input}
        />

        <View className={css.checkboxes} column>
          <Checkbox
            label="Descendants"
            checked={fileStore.includeDescendants}
            indeterminate={fileStore.excludeDescendants}
            setChecked={handleDescendants}
          />

          <Checkbox
            label="Tagged"
            checked={fileStore.includeTagged}
            indeterminate={fileStore.includeUntagged}
            setChecked={handleTagged}
          />
        </View>

        <Accordion
          header={<Text>Image Types</Text>}
          expanded={isImageTypesOpen}
          setExpanded={setIsImageTypesOpen}
          fullWidth
        >
          {["jpg", "jpeg", "png"].map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Image" />
          ))}
        </Accordion>

        <Accordion
          header={<Text>Video Types</Text>}
          expanded={isVideoTypesOpen}
          setExpanded={setIsVideoTypesOpen}
          fullWidth
        >
          {["gif", "webm", "mp4", "mkv"].map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Video" />
          ))}
        </Accordion>

        {tagStore.isTagManagerOpen && <TagManager />}

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
  sectionTitle: {
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
