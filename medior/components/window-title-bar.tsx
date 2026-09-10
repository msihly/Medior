import { getCurrentWindow } from "@electron/remote";
import { MouseEvent, useEffect, useState } from "react";
import { Menu } from "@mui/material";
import { Comp, IconButton, ListItem, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

interface WindowTitleBarProps {
  isDark?: boolean;
  title: string;
}

export const WindowTitleBar = Comp(({ isDark = false, title }: WindowTitleBarProps) => {
  const stores = useStores();
  const [anchorEl, setAnchorEl] = useState<HTMLElement>(null);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(() =>
    getCurrentWindow().webContents.isDevToolsOpened(),
  );
  const [isMaximized, setIsMaximized] = useState(() => getCurrentWindow().isMaximized());
  const { css } = useClasses({ isDark, isDragEnabled: !(isDevToolsOpen && isMaximized) });

  const handleClose = () => getCurrentWindow().close();

  const handleDeveloperTools = () => {
    setAnchorEl(null);
    getCurrentWindow().webContents.toggleDevTools();
  };

  const handleFileNameToggle = async () => {
    setAnchorEl(null);
    const showFileName = !stores.home.showFileName;
    stores.home.setShowFileName(showFileName);
    stores.home.settings.update({ file: { showFileName } });

    try {
      await stores.home.settings.save();
    } catch (error) {
      stores.home.setShowFileName(!showFileName);
      stores.home.settings.update({ file: { showFileName: !showFileName } });
      stores.home.settings.setHasUnsavedChanges(false);
      toast.error(error instanceof Error ? error.message : "Failed to save file name setting");
    }
  };

  const handleMaximize = () => {
    const browserWindow = getCurrentWindow();
    if (browserWindow.isMaximized()) browserWindow.unmaximize();
    else browserWindow.maximize();
  };

  const handleMinimize = () => getCurrentWindow().minimize();

  const handleMenuClose = () => setAnchorEl(null);

  const handleMenuOpen = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const browserWindow = getCurrentWindow();
    const handleDevToolsClosed = () => setIsDevToolsOpen(false);
    const handleDevToolsOpened = () => setIsDevToolsOpen(true);
    const handleMaximized = () => setIsMaximized(true);
    const handleUnmaximized = () => setIsMaximized(false);

    browserWindow.webContents.on("devtools-closed", handleDevToolsClosed);
    browserWindow.webContents.on("devtools-opened", handleDevToolsOpened);
    browserWindow.on("maximize", handleMaximized);
    browserWindow.on("unmaximize", handleUnmaximized);
    return () => {
      browserWindow.webContents.off("devtools-closed", handleDevToolsClosed);
      browserWindow.webContents.off("devtools-opened", handleDevToolsOpened);
      browserWindow.off("maximize", handleMaximized);
      browserWindow.off("unmaximize", handleUnmaximized);
    };
  }, []);

  return (
    <View row align="center" className={css.root}>
      <img alt="Medior" className={css.favicon} draggable={false} src="./favicon.ico" />

      <IconButton
        aria-label="Open window menu"
        className={css.menuButton}
        iconProps={{ size: "1.2rem" }}
        name="Menu"
        onClick={handleMenuOpen}
        padding={{ all: 0 }}
        tooltip="Menu"
      />

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose} keepMounted>
        <View>
          <ListItem
            icon={stores.home.showFileName ? "CheckBox" : "CheckBoxOutlineBlank"}
            onClick={handleFileNameToggle}
            text="Show File Names"
          />

          <ListItem icon="DeveloperMode" onClick={handleDeveloperTools} text="Developer Tools" />
        </View>
      </Menu>

      <Text className={css.title}>{title}</Text>

      <View row height="100%" className={css.controls}>
        <IconButton
          aria-label="Minimize"
          className={css.control}
          disableRipple
          iconProps={{ size: "0.9rem" }}
          name="Remove"
          onClick={handleMinimize}
        />

        <IconButton
          aria-label={isMaximized ? "Restore" : "Maximize"}
          className={css.control}
          disableRipple
          iconProps={{ size: "0.8rem" }}
          name={isMaximized ? "FilterNone" : "CropSquare"}
          onClick={handleMaximize}
        />

        <IconButton
          aria-label="Close"
          className={`${css.control} ${css.close}`}
          disableRipple
          iconProps={{ size: "1rem" }}
          name="Close"
          onClick={handleClose}
        />
      </View>
    </View>
  );
});

interface ClassesProps extends Pick<WindowTitleBarProps, "isDark"> {
  isDragEnabled: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  close: {
    "&:hover": {
      background: colors.custom.red,
      color: colors.custom.white,
    },
  },
  control: {
    "-webkit-app-region": "no-drag",
    borderRadius: 0,
    height: "100%",
    padding: 0,
    width: 46,
    "&:hover": {
      background: colors.custom.darkGrey,
    },
  },
  controls: {
    "-webkit-app-region": "no-drag",
  },
  favicon: {
    height: 16,
    marginLeft: 10,
    width: 16,
  },
  menuButton: {
    "-webkit-app-region": "no-drag",
    borderRadius: 0,
    height: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    width: 40,
    "&:hover": {
      background: colors.custom.darkGrey,
    },
  },
  root: {
    background: props.isDark ? CONSTANTS.CAROUSEL.TOP_BAR.BACKGROUND : colors.background,
    flexShrink: 0,
    height: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    maxHeight: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    minHeight: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    userSelect: "none",
    width: "100%",
    zIndex: 30,
  },
  title: {
    "-webkit-app-region": props.isDragEnabled ? "drag" : "no-drag",
    alignItems: "center",
    alignSelf: "stretch",
    display: "flex",
    flex: 1,
    fontSize: "0.8rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
}));
