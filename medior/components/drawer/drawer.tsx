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
  hasDuplicates?: boolean;
  hasImports?: boolean;
  hasSettings?: boolean;
}

export const Drawer = Comp(
  ({ hasDuplicates = false, hasImports = false, hasSettings = false }: DrawerProps) => {
    const stores = useStores();
    const lowerResolution = stores.file.lowerResolution;

    const { css, cx } = useClasses(null);

    const activeOperationCount = stores.home.backgroundOperations.filter(
      ({ status }) => status === "PENDING" || status === "RUNNING",
    ).length;

    const tooltipProps: Partial<TooltipProps> = { placement: "right" };

    const handleActivity = () => stores.home.setIsActivityOpen(true);

    const handleCollections = () => {
      stores.collection.manager.setSelectedFileIds([]);
      stores.collection.manager.setIsOpen(true);
    };

    const handleFindDuplicates = () => lowerResolution.open();

    const handleImport = () => stores.import.manager.setIsOpen(true);

    const handleManageTags = () => stores.tag.manager.setIsOpen(true);

    const handleMediaPrograms = () => stores.mediaProgram.manager.setIsOpen(true);

    const handleSearchWindow = () => openSearchWindow();

    const handleSettings = () => stores.home.settings.setIsOpen(true);

    const handleVideoTransformer = () => {
      stores.file.videoTransformer.setFileIds([]);
      stores.file.videoTransformer.setFnType(null);
      stores.file.videoTransformer.setIsOpen(true);
    };

    useEffect(() => {
      stores.file.loadArchivedFileIds();
      stores.home.loadBackgroundActivity();
      stores.file.videoTransformer.getTransformerStatus();
      stores.file.videoTransformer.loadQueueCount();

      if (hasDuplicates) lowerResolution.loadStatus();
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

              <ActivityBadge
                isPaused={stores.import.manager.isPaused}
                isRunning={stores.import.manager.isImporting}
              />
            </View>
          )}

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
            name="LiveTv"
            tooltip="Open Media Programs"
            onClick={handleMediaPrograms}
            {...{ tooltipProps }}
          />

          <IconButton
            name="Search"
            tooltip="Open New Search Window"
            onClick={handleSearchWindow}
            {...{ tooltipProps }}
          />

          <View display="inline-flex" position="relative" flex="none">
            <IconButton
              name="MovieFilter"
              tooltip="Open Media Transformer"
              onClick={handleVideoTransformer}
              {...{ tooltipProps }}
            />

            <ActivityBadge
              isPaused={stores.file.videoTransformer.hasPausedQueue}
              isRunning={stores.file.videoTransformer.isTransforming}
            />
          </View>

          {hasDuplicates && (
            <View display="inline-flex" position="relative" flex="none">
              <IconButton
                name="ImageSearch"
                tooltip="Find Duplicates"
                onClick={handleFindDuplicates}
                {...{ tooltipProps }}
              />

              <ActivityBadge
                isPaused={
                  lowerResolution.displayStatus === "paused" ||
                  lowerResolution.displayStatus === "groupingPaused"
                }
                isRunning={lowerResolution.isScanning || lowerResolution.isGrouping}
              />
            </View>
          )}

          <IconButton
            name={stores.file.hasArchivedFiles ? "Delete" : "DeleteOutline"}
            tooltip="Delete Archived Files"
            onClick={stores.file.confirmDeleteArchivedFiles}
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
  },
);

export interface ActivityBadgeProps {
  isPaused: boolean;
  isRunning: boolean;
}

export const ActivityBadge = Comp(({ isPaused, isRunning }: ActivityBadgeProps) => {
  const { css } = useClasses(null);

  if (!isPaused && !isRunning) return null;

  return (
    <View className={css.badge}>
      {isPaused ? (
        <Icon name="Pause" color={colors.custom.orange} />
      ) : (
        <ProgressCircle size={20} color="inherit" variant="indeterminate" />
      )}
    </View>
  );
});

const useClasses = makeClasses((_, theme) => ({
  drawer: {
    flexShrink: 0,
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
    height: "100%",
    padding: "0.3rem",
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
