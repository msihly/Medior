import { observer, useStores } from "medior/store";
import { Divider, Drawer as MuiDrawer, List } from "@mui/material";
import { FileFilterMenu, ListItem, View } from "medior/components";
import { colors, CONSTANTS, makeClasses, openSearchWindow } from "medior/utils";

export interface DrawerProps {
  hasImports?: boolean;
  hasSettings?: boolean;
}

export const Drawer = observer(({ hasImports = false, hasSettings = false }: DrawerProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const handleClose = () => stores.home.setIsDrawerOpen(false);

  const handleCollections = () => {
    stores.collection.manager.setSelectedFileIds([]);
    stores.collection.manager.setIsOpen(true);
  };

  const handleImport = () => stores.import.setIsImportManagerOpen(true);

  const handleManageTags = () => stores.tag.manager.setIsOpen(true);

  const handleSearchWindow = () => openSearchWindow();

  const handleSettings = () => stores.home.settings.setIsOpen(true);

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

      <View column width="100%" padding={{ all: "0.2rem 0.4rem" }}>
        <FileFilterMenu store={stores.file.search} />
      </View>
    </MuiDrawer>
  );
});

const useClasses = makeClasses({
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
    background: colors.background,
    zIndex: 20,
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  list: {
    width: "100%",
  },
});
