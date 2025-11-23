import { Badge, CircularProgress, Drawer as MuiDrawer } from "@mui/material";
import { Comp, Icon, IconButton, TooltipProps, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, openSearchWindow } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

export interface DrawerProps {
  hasImports?: boolean;
  hasSettings?: boolean;
}

export const Drawer = Comp(({ hasImports = false, hasSettings = false }: DrawerProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const handleClose = () => stores.home.setIsDrawerOpen(false);

  const handleCollections = () => {
    stores.collection.manager.setSelectedFileIds([]);
    stores.collection.manager.setIsOpen(true);
  };

  const handleImport = () => stores.import.manager.setIsOpen(true);

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
          <Badge
            badgeContent={
              stores.import.manager.isPaused ? (
                <Icon name="Pause" color={colors.custom.orange} />
              ) : stores.import.manager.isImporting ? (
                <CircularProgress size={20} color="inherit" />
              ) : null
            }
            overlap="circular"
          >
            <IconButton
              name="GetApp"
              tooltip="Open Import Manager"
              onClick={handleImport}
              {...{ tooltipProps }}
            />
          </Badge>
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
    marginTop: CONSTANTS.HOME.TOP_BAR.HEIGHT,
    padding: "0.2rem 0.3rem",
    width: CONSTANTS.HOME.DRAWER.WIDTH,
    background: colors.background,
    zIndex: 20,
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
});
