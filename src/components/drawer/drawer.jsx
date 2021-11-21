import React, { forwardRef, useContext, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { remote } from "electron";
import fs from "fs/promises";
import path from "path";
import dirTree from "directory-tree";
import { copyFileTo } from "database";
import { actions } from "store";
import {
  Divider,
  Drawer as MuiDrawer,
  List,
  colors,
  Accordion,
  AccordionSummary,
  Typography,
  AccordionDetails,
} from "@mui/material";
import { Archive, ExpandMore, GetApp as ImportIcon, Unarchive } from "@mui/icons-material";
import { makeStyles } from "utils";
import { AppContext } from "app";
import { Text } from "components/text";
import { IconButton } from "components/buttons";
import { ListItem } from "components/list";
import { DuplicatesModal, SearchInput } from ".";
import { countItems, sortArray } from "utils";
import * as Media from "media";

const OUTPUT_DIR = path.join(path.resolve(), "output_dir");

const Drawer = forwardRef((_, drawerRef) => {
  const {
    drawerMode,
    setDrawerMode,
    isDrawerOpen,
    setIsDrawerOpen,
    isArchiveOpen,
    setIsArchiveOpen,
    includeValue,
    setIncludeValue,
    excludeValue,
    setExcludeValue,
  } = useContext(AppContext);

  const { classes: css } = useClasses({ drawerMode });

  const dispatch = useDispatch();
  const images = useSelector((state) => state.images);

  const tagOptions = useMemo(() => {
    const tagCounts = countItems(images.flatMap((img) => img.tags).filter((t) => t !== undefined));

    return sortArray(
      tagCounts.map(({ value, count }) => ({
        label: value,
        count: count,
      })),
      "count",
      true,
      true
    );
  }, [images]);

  const switchDrawerMode = () =>
    setDrawerMode(drawerMode === "persistent" ? "temporary" : "persistent");

  /* ------------------------ BEGIN - FILE / DIR IMPORT ----------------------- */
  const copyFile = async (fileObj, targetDir) => {
    const image = await copyFileTo(fileObj, targetDir);
    if (image.isDuplicate) return setDuplicates([...duplicates, image]);
    dispatch(actions.imagesAdded([image]));
  };

  const importFiles = async (isDir = false) => {
    try {
      const res = await remote.dialog.showOpenDialog({
        properties: isDir ? ["openDirectory"] : ["openFile", "multiSelections"],
      });
      if (res.canceled) return;

      setDuplicates([]);
      setIsDrawerOpen(false);

      if (isDir) {
        dirTree(res.filePaths[0], { extensions: /\.(jpe?g|png)$/ }, (f) => copyFile(f, OUTPUT_DIR));
      } else {
        res.filePaths.forEach(async (p) => {
          const size = (await fs.stat(p)).size;
          const fileObj = { path: p, name: path.parse(p).name, extension: path.extname(p), size };
          copyFile(fileObj, OUTPUT_DIR);
        });
      }
    } catch (e) {
      console.error(e);
    }
  };
  /* ------------------------ END - FILE / DIR IMPORT ----------------------- */

  /* --------------------------- BEGIN - DUPLICATES --------------------------- */
  const [duplicates, setDuplicates] = useState([]);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);

  const closeDuplicates = () => {
    setDuplicates([]);
    setIsDuplicatesOpen(false);
  };

  useEffect(() => {
    if (duplicates.length > 0) setIsDuplicatesOpen(true);
  }, [duplicates]);
  /* --------------------------- END - DUPLICATES --------------------------- */

  const [isImageTypesOpen, setIsImageTypesOpen] = useState(true);
  const [isVideoTypesOpen, setIsVideoTypesOpen] = useState(true);

  return (
    <MuiDrawer
      PaperProps={{ className: css.drawer, ref: drawerRef }}
      ModalProps={{ keepMounted: true }}
      open={isDrawerOpen}
      onClose={() => setIsDrawerOpen(false)}
      variant={drawerMode}
    >
      <div className={css.topActions}>
        <IconButton name="Menu" onClick={() => setIsDrawerOpen(false)} size="medium" />

        <IconButton onClick={switchDrawerMode} size="medium">
          <Media.PinSVG className={css.pin} />
        </IconButton>
      </div>

      <List>
        <ListItem text="Import Folder" icon={<ImportIcon />} onClick={() => importFiles(true)} />
        <ListItem text="Import Files" icon={<ImportIcon />} onClick={() => importFiles(false)} />
        <ListItem
          text={`${isArchiveOpen ? "Close" : "Open"} Archive`}
          icon={isArchiveOpen ? <Unarchive /> : <Archive />}
          onClick={() => setIsArchiveOpen(!isArchiveOpen)}
        />
      </List>

      <Divider variant="middle" />

      <Text align="center" className={css.sectionTitle}>
        Include
      </Text>
      <SearchInput options={tagOptions} value={includeValue} setValue={setIncludeValue} />

      <Text align="center" className={css.sectionTitle}>
        Exclude
      </Text>
      <SearchInput options={tagOptions} value={excludeValue} setValue={setExcludeValue} />

      <Accordion
        expanded={isImageTypesOpen}
        onChange={() => setIsImageTypesOpen(!isImageTypesOpen)}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography>Image Types</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <FormControlLabel label="" />
        </AccordionDetails>
      </Accordion>

      <DuplicatesModal
        isOpen={isDuplicatesOpen}
        handleClose={closeDuplicates}
        images={duplicates}
      />
    </MuiDrawer>
  );
});

export default Drawer;

const useClasses = makeStyles()((_, { drawerMode }) => ({
  drawer: {
    borderRight: "1px solid #111",
    backgroundColor: colors.grey["900"],
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
  },
}));
