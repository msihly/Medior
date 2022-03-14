import { useState } from "react";
import { remote } from "electron";
import fs from "fs/promises";
import path from "path";
import dirTree from "directory-tree";
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
import { DuplicatesModal, ExtCheckbox } from ".";
import { makeStyles } from "utils";
import { CSSObject } from "tss-react";
import * as Media from "media";

const Drawer = observer(
  (_, drawerRef: any) => {
    const { appStore, fileStore, tagStore } = useStores();

    const { classes: css } = useClasses({ drawerMode: appStore.drawerMode });

    const [isImageTypesOpen, setIsImageTypesOpen] = useState(false);
    const [isVideoTypesOpen, setIsVideoTypesOpen] = useState(false);

    /* ------------------------ BEGIN - FILE / DIR IMPORT ----------------------- */
    const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);

    const importFile = (fileObj) => fileStore.addImports({ ...fileObj, isCompleted: false });

    const importFiles = async (isDir = false) => {
      try {
        const res = await remote.dialog.showOpenDialog({
          properties: isDir ? ["openDirectory"] : ["openFile", "multiSelections"],
        });
        if (res.canceled) return;

        appStore.setIsDrawerOpen(false);

        if (isDir) {
          dirTree(res.filePaths[0], { extensions: /\.(jpe?g|png|gif|mp4|webm|mkv)$/ }, (fileObj) =>
            importFile(fileObj)
          );
        } else {
          res.filePaths.forEach(async (p) => {
            const size = (await fs.stat(p)).size;
            const fileObj = { path: p, name: path.parse(p).name, extension: path.extname(p), size };
            importFile(fileObj);
          });
        }
      } catch (err) {
        console.error(err?.message ?? err);
      }
    };
    /* ------------------------ END - FILE / DIR IMPORT ----------------------- */

    return (
      <MuiDrawer
        PaperProps={{ className: css.drawer, ref: drawerRef }}
        ModalProps={{ keepMounted: true }}
        open={appStore.isDrawerOpen}
        onClose={() => appStore.setIsDrawerOpen(false)}
        variant={appStore.drawerMode}
      >
        <div className={css.topActions}>
          <IconButton name="Menu" onClick={() => appStore.setIsDrawerOpen(false)} size="medium" />

          <IconButton onClick={appStore.toggleDrawerMode} size="medium">
            <Media.PinSVG className={css.pin} />
          </IconButton>
        </div>

        <List>
          <ListItem
            text="Manage Tags"
            icon={<MoreIcon />}
            onClick={() => tagStore.setIsTagManagerOpen(true)}
          />

          <ListItem text="Import Files" icon={<ImportIcon />} onClick={() => importFiles(false)} />

          <ListItem text="Import Folder" icon={<ImportIcon />} onClick={() => importFiles(true)} />

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
          value={fileStore.includedTags}
          onChange={(val) => fileStore.setIncludedTags(val)}
          options={tagStore.tagOptions}
          limitTags={3}
          className={css.input}
        />

        <Text align="center" className={css.sectionTitle}>
          Exclude
        </Text>
        <TagInput
          value={fileStore.excludedTags}
          onChange={(val) => fileStore.setExcludedTags(val)}
          options={tagStore.tagOptions}
          limitTags={3}
          className={css.input}
        />

        <View className={css.checkboxes} column>
          <Checkbox
            label="Tagged"
            checked={fileStore.includeTagged}
            setChecked={fileStore.setIncludeTagged}
          />

          <Checkbox
            label="Untagged"
            checked={fileStore.includeUntagged}
            setChecked={fileStore.setIncludeUntagged}
          />

          <Checkbox
            label="Include Desc"
            checked={fileStore.includeDescendants}
            setChecked={fileStore.setIncludeDescendants}
          />

          <Checkbox
            label="Exclude Desc"
            checked={fileStore.excludeDescendants}
            setChecked={fileStore.setExcludeDescendants}
          />
        </View>

        <Accordion
          label="Image Types"
          expanded={isImageTypesOpen}
          setExpanded={setIsImageTypesOpen}
          fullWidth
        >
          {["jpg", "jpeg", "png"].map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Image" />
          ))}
        </Accordion>

        <Accordion
          label="Video Types"
          expanded={isVideoTypesOpen}
          setExpanded={setIsVideoTypesOpen}
          fullWidth
        >
          {["gif", "webm", "mp4", "mkv"].map((ext) => (
            <ExtCheckbox key={ext} ext={ext} type="Video" />
          ))}
        </Accordion>

        {isDuplicatesOpen && (
          <DuplicatesModal
            handleClose={() => setIsDuplicatesOpen(false)}
            files={fileStore.duplicates}
          />
        )}

        {tagStore.isTagManagerOpen && <TagManager />}
      </MuiDrawer>
    );
  },
  { forwardRef: true }
);

export default Drawer;

const useClasses = makeStyles<CSSObject>()((_, { drawerMode }: any) => ({
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
