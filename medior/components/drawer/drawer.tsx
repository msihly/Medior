import { observer, useStores } from "medior/store";
import { Drawer as MuiDrawer } from "@mui/material";
import { IconButton, TooltipProps, View } from "medior/components";
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

  const tooltipProps: Partial<TooltipProps> = {
    placement: "right",
  };

  return (
    <MuiDrawer
      PaperProps={{ className: css.drawer }}
      ModalProps={{ keepMounted: true }}
      open
      onClose={handleClose}
      variant="persistent"
    >
      <View column spacing="0.5rem">
        {hasSettings && (
          <IconButton
            name="Settings"
            tooltip="Open Settings"
            onClick={handleSettings}
            {...{ tooltipProps }}
          />
        )}

        {hasImports && (
          <IconButton
            name="GetApp"
            tooltip="Open Import Manager"
            onClick={handleImport}
            {...{ tooltipProps }}
          />
        )}

        <IconButton
          name="More"
          tooltip="Open Tag Manager"
          onClick={handleManageTags}
          {...{ tooltipProps }}
        />

        <IconButton
          {...{ tooltipProps }}
          name="Collections"
          tooltip="Open Collection Manager"
          onClick={handleCollections}
        />

        <IconButton
          name="Search"
          tooltip="Open New Search Window"
          onClick={handleSearchWindow}
          {...{ tooltipProps }}
        />
      </View>
    </MuiDrawer>
  );
});

const useClasses = makeClasses({
  drawer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderRight: "1px solid #111",
    marginTop: CONSTANTS.TOP_BAR_HEIGHT,
    padding: "0.2rem 0.3rem",
    width: CONSTANTS.DRAWER_WIDTH,
    background: colors.background,
    zIndex: 20,
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
});
