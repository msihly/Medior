import { forwardRef, useContext, useEffect, useMemo, useState } from "react";
import { remote } from "electron";
import fs from "fs/promises";
import path from "path";
import dirTree from "directory-tree";
import { copyFileTo } from "database";
import { actions, useDispatch, useSelector } from "store";
import { Divider, Drawer as MuiDrawer, List, colors } from "@mui/material";
import { Archive, GetApp as ImportIcon, Unarchive } from "@mui/icons-material";
import { makeStyles } from "utils";
import { AppContext } from "app";
import { Text } from "components/text";
import { IconButton } from "components/buttons";
import { Accordion, Checkbox } from "components/toggles";
import { ListItem } from "components/list";
import { CSSObject } from "tss-react";
import { DuplicatesModal, SearchInput } from ".";
import { countItems, sortArray } from "utils";
import { OUTPUT_DIR } from "env";
import * as Media from "media";

const Drawer = forwardRef((_, drawerRef: any) => {
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
    selectedImageTypes,
    setSelectedImageTypes,
    selectedVideoTypes,
    setSelectedVideoTypes,
  }: any = useContext(AppContext);

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

  /* --------------------------- BEGIN - SEARCH | FILTERING --------------------------- */
  const [isImageTypesOpen, setIsImageTypesOpen] = useState(true);
  const [isVideoTypesOpen, setIsVideoTypesOpen] = useState(true);

  const handleImageTypeChange = (type, checked) =>
    setSelectedImageTypes({ ...selectedImageTypes, [type]: checked });

  const handleVideoTypeChange = (type, checked) =>
    setSelectedVideoTypes({ ...selectedVideoTypes, [type]: checked });
  /* --------------------------- END - SEARCH | FILTERING --------------------------- */

  const { classes: css } = useClasses({ drawerMode, isImageTypesOpen });

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
        label="Image Types"
        expanded={isImageTypesOpen}
        setExpanded={setIsImageTypesOpen}
        fullWidth
      >
        <Checkbox
          label="jpg"
          checked={selectedImageTypes.jpg}
          setChecked={(checked) => handleImageTypeChange("jpg", checked)}
        />

        <Checkbox
          label="jpeg"
          checked={selectedImageTypes.jpeg}
          setChecked={(checked) => handleImageTypeChange("jpeg", checked)}
        />

        <Checkbox
          label="png"
          checked={selectedImageTypes.png}
          setChecked={(checked) => handleImageTypeChange("png", checked)}
        />
      </Accordion>

      <Accordion
        label="Video Types"
        expanded={isVideoTypesOpen}
        setExpanded={setIsVideoTypesOpen}
        fullWidth
      >
        <Checkbox
          label="gif"
          checked={selectedVideoTypes.gif}
          setChecked={(checked) => handleVideoTypeChange("gif", checked)}
        />

        <Checkbox
          label="webm"
          checked={selectedVideoTypes.webm}
          setChecked={(checked) => handleVideoTypeChange("webm", checked)}
        />

        <Checkbox
          label="mp4"
          checked={selectedVideoTypes.mp4}
          setChecked={(checked) => handleVideoTypeChange("mp4", checked)}
        />

        <Checkbox
          label="mkv"
          checked={selectedVideoTypes.mkv}
          setChecked={(checked) => handleVideoTypeChange("mkv", checked)}
        />
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

const useClasses = makeStyles<CSSObject>()((_, { drawerMode, isImageTypesOpen }: any) => ({
  drawer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderRight: "1px solid #111",
    backgroundColor: colors.grey["900"],
    "&::-webkit-scrollbar": {
      display: "none",
    },
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
