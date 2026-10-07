import { getCurrentWindow } from "@electron/remote";
import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import {
  Comp,
  HotkeysModal,
  IconButton,
  ListItem,
  MenuButton,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

interface WindowTitleBarProps {
  isDark?: boolean;
  title: string;
}

export const WindowTitleBar = Comp(({ isDark = false, title }: WindowTitleBarProps) => {
  const stores = useStores();
  const store = stores.home;

  const [isDevToolsOpen, setIsDevToolsOpen] = useState(() =>
    getCurrentWindow().webContents.isDevToolsOpened(),
  );
  const [isHotkeysOpen, setIsHotkeysOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(() => getCurrentWindow().isMaximized());

  const { css } = useClasses({ isDark, isDragEnabled: !(isDevToolsOpen && isMaximized) });

  const handleClose = () => getCurrentWindow().close();

  const handleDeveloperTools = () => getCurrentWindow().webContents.toggleDevTools();

  const handleFileNameToggle = async () => {
    const showFileName = !store.showFileName;

    store.setShowFileName(showFileName);
    store.settings.update({ file: { showFileName } });

    try {
      const res = await store.settings.save();

      if (!res.success) throw new Error(res.error);
    } catch (error) {
      store.setShowFileName(!showFileName);
      store.settings.update({ file: { showFileName: !showFileName } });
      store.settings.setHasUnsavedChanges(false);
      toast.error(error.message || "Failed to save file name setting");
    }
  };

  const handleHotkeysClose = () => setIsHotkeysOpen(false);

  const handleHotkeysOpen = () => setIsHotkeysOpen(true);

  const handleMaximize = () => {
    const browserWindow = getCurrentWindow();

    if (browserWindow.isMaximized()) browserWindow.unmaximize();
    else browserWindow.maximize();
  };

  const handleMinimize = () => getCurrentWindow().minimize();

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const handleWindowState = (_, state: { isDevToolsOpen: boolean; isMaximized: boolean }) => {
      setIsDevToolsOpen(state.isDevToolsOpen);
      setIsMaximized(state.isMaximized);
    };

    ipcRenderer.on("window-state", handleWindowState);

    return () => {
      ipcRenderer.off("window-state", handleWindowState);
    };
  }, []);

  return (
    <View row align="center" className={css.root}>
      <View
        component="img"
        alt="Medior"
        className={css.favicon}
        draggable={false}
        src="./favicon.ico"
      />

      <MenuButton
        anchorOrigin={{ horizontal: "left", vertical: "top" }}
        aria-label="Open window menu"
        className={css.menuButton}
        icon="Menu"
        iconProps={{ size: "1.2rem" }}
        menuClassName={css.menu}
        padding={{ all: 0 }}
        tooltip="Menu"
        transformOrigin={{ horizontal: "left", vertical: "top" }}
      >
        {(onClose) => (
          <View>
            <ListItem
              icon={store.showFileName ? "CheckBox" : "CheckBoxOutlineBlank"}
              onClick={() => {
                onClose();
                handleFileNameToggle();
              }}
              text="Show File Names"
            />

            <ListItem
              icon="Keyboard"
              onClick={() => {
                onClose();
                handleHotkeysOpen();
              }}
              text="Hotkeys"
            />

            <ListItem
              icon="DeveloperMode"
              onClick={() => {
                onClose();
                handleDeveloperTools();
              }}
              text="Developer Tools"
            />
          </View>
        )}
      </MenuButton>

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

      {isHotkeysOpen && <HotkeysModal onClose={handleHotkeysClose} />}
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
    "&:hover": {
      background: colors.custom.darkGrey,
    },
    borderRadius: 0,
    height: "100%",
    padding: 0,
    width: 46,
  },
  controls: {
    "-webkit-app-region": "no-drag",
  },
  favicon: {
    height: 16,
    marginLeft: 10,
    width: 16,
  },
  menu: {
    zIndex: CONSTANTS.WINDOW.TITLE_BAR.Z_INDEX + 1,
  },
  menuButton: {
    "-webkit-app-region": "no-drag",
    "&:hover": {
      background: colors.custom.darkGrey,
    },
    borderRadius: 0,
    height: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    width: 40,
  },
  root: {
    background: props.isDark ? CONSTANTS.CAROUSEL.TOP_BAR.BACKGROUND : colors.background,
    flexShrink: 0,
    height: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    maxHeight: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    minHeight: CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    position: "relative",
    userSelect: "none",
    width: "100%",
    zIndex: CONSTANTS.WINDOW.TITLE_BAR.Z_INDEX,
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
