import { useEffect } from "react";
import {
  BackgroundActivityModal,
  Comp,
  Icon,
  IconButton,
  ProgressCircle,
  Text,
  TooltipProps,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, openSearchWindow } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

export interface DrawerProps {
  hasImports?: boolean;
  hasSettings?: boolean;
}

export const Drawer = Comp(({ hasImports = false, hasSettings = false }: DrawerProps) => {
  const stores = useStores();

  const { css, cx } = useClasses(null);

  const activeOperationCount = stores.home.backgroundOperations.filter(
    ({ status }) => status === "PENDING" || status === "RUNNING",
  ).length;

  const handleActivity = () => {
    stores.home.setIsActivityOpen(true);
  };

  const handleCollections = () => {
    stores.collection.manager.setSelectedFileIds([]);
    stores.collection.manager.setIsOpen(true);
  };

  const handleDeleteArchivedFiles = () => stores.file.confirmDeleteArchivedFiles();

  const handleImport = () => stores.import.manager.setIsOpen(true);

  const handleManageTags = () => stores.tag.manager.setIsOpen(true);

  const handleSearchWindow = () => openSearchWindow();

  const handleSettings = () => stores.home.settings.setIsOpen(true);

  const tooltipProps: Partial<TooltipProps> = {
    placement: "right",
  };

  useEffect(() => {
    stores.file.loadArchivedFileIds();
    stores.home.loadBackgroundActivity();
    stores.file.videoTransformer.getTransformerStatus();
    stores.file.videoTransformer.loadQueueCount();
  }, []);

  return (
    <View className={css.drawer}>
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
          <View display="inline-flex" position="relative" flex="none">
            <IconButton
              name="GetApp"
              tooltip="Open Import Manager"
              onClick={handleImport}
              {...{ tooltipProps }}
            />

            {(stores.import.manager.isPaused || stores.import.manager.isImporting) && (
              <View className={css.badge}>
                {stores.import.manager.isPaused ? (
                  <Icon name="Pause" color={colors.custom.orange} />
                ) : (
                  <ProgressCircle size={20} color="inherit" variant="indeterminate" />
                )}
              </View>
            )}
          </View>
        )}

        <View display="inline-flex" position="relative" flex="none">
          <IconButton
            name="MovieFilter"
            tooltip="Open Media Transformer"
            onClick={() => {
              stores.file.videoTransformer.setFileIds([]);
              stores.file.videoTransformer.setFnType(null);
              stores.file.videoTransformer.setIsOpen(true);
            }}
            {...{ tooltipProps }}
          />

          {(stores.file.videoTransformer.isPaused ||
            stores.file.videoTransformer.isTransforming) && (
            <View className={css.badge}>
              {stores.file.videoTransformer.isPaused ? (
                <Icon name="Pause" color={colors.custom.orange} />
              ) : (
                <ProgressCircle size={20} color="inherit" variant="indeterminate" />
              )}
            </View>
          )}
        </View>

        <IconButton
          name="Label"
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

        <IconButton
          name={stores.file.hasArchivedFiles ? "Delete" : "DeleteOutline"}
          tooltip="Delete Archived Files"
          onClick={handleDeleteArchivedFiles}
          disabled={!stores.file.hasArchivedFiles}
          {...{ tooltipProps }}
        />
      </View>

      <View column flex={1} justify="flex-end">
        <View display="inline-flex" position="relative" flex="none">
          <IconButton
            name={
              stores.home.hasUnreadErrors
                ? "NotificationImportant"
                : stores.home.hasRunningBackgroundOperations
                  ? "NotificationsActive"
                  : stores.home.hasUnreadNotifications
                    ? "Notifications"
                    : "NotificationsNone"
            }
            tooltip="Open Activity"
            onClick={handleActivity}
            {...{ tooltipProps }}
          />

          {activeOperationCount > 0 && (
            <View className={cx(css.badge, css.count)}>
              <Text color="inherit" fontSize="0.75rem" fontWeight={500} lineHeight={1}>
                {activeOperationCount > 99 ? "99+" : activeOperationCount}
              </Text>
            </View>
          )}
        </View>
      </View>

      {stores.home.isActivityOpen && <BackgroundActivityModal />}
    </View>
  );
});

const useClasses = makeClasses((_, theme) => ({
  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    overflowY: "auto",
    color: theme.palette.text.primary,
    "&::-webkit-scrollbar": {
      display: "none",
    },
    alignItems: "center",
    background: colors.background,
    borderRight: "1px solid #111",
    display: "flex",
    flexDirection: "column",
    height: `calc(100% - ${CONSTANTS.HOME.TOP_BAR.HEIGHT + CONSTANTS.WINDOW.TITLE_BAR.HEIGHT}px)`,
    marginTop: CONSTANTS.HOME.TOP_BAR.HEIGHT + CONSTANTS.WINDOW.TITLE_BAR.HEIGHT,
    padding: "0.2rem 0.3rem",
    width: CONSTANTS.HOME.DRAWER.WIDTH,
    zIndex: 20,
  },
  badge: {
    position: "absolute",
    top: "14%",
    right: "14%",
    transform: "translate(50%, -50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 20,
    minWidth: 20,
    padding: "0 6px",
    zIndex: 1,
  },
  count: {
    borderRadius: 10,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
}));
