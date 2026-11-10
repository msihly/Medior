import { ReactNode, useEffect } from "react";
import {
  Comp,
  Icon,
  IconButton,
  IconButtonProps,
  ProgressCircle,
  Text,
  TooltipProps,
  View,
} from "medior/components";
import { HomeView, useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

const TOOLTIP_PROPS: Partial<TooltipProps> = { placement: "right" };

/** Switches between the views beside it, marking the one shown. */
export const Drawer = Comp(() => {
  const stores = useStores();
  const lowerResolution = stores.file.lowerResolution;

  const { css, cx } = useClasses(null);

  const activeOperationCount = stores.home.backgroundOperations.filter(
    ({ status }) => status === "PENDING" || status === "RUNNING",
  ).length;

  /** The drawer shows the manager on its own, without files or seasons to pick collections for. */
  const handleCollections = () => stores.collection.manager.open();

  useEffect(() => {
    stores.file.loadArchivedFileIds();
    stores.home.loadBackgroundActivity();
    stores.file.videoTransformer.getTransformerStatus();
    stores.file.videoTransformer.loadQueueCount();
    lowerResolution.loadStatus();
  }, []);

  return (
    <View className={css.drawer}>
      <View column spacing="0.5rem">
        <DrawerButton view="settings" name="Settings" tooltip="Settings" />

        <DrawerButton
          view="imports"
          name="GetApp"
          tooltip="Import Manager"
          badge={
            <ActivityBadge
              isPaused={stores.import.manager.isPaused}
              isRunning={stores.import.manager.isImporting}
            />
          }
        />

        <DrawerButton view="files" name="InsertDriveFile" tooltip="Files" />

        <DrawerButton view="tags" name="Label" tooltip="Tag Manager" />

        <DrawerButton
          view="collections"
          name="Collections"
          tooltip="Collection Manager"
          onClick={handleCollections}
        />

        <DrawerButton view="mediaPrograms" name="LiveTv" tooltip="Media Programs" />

        <DrawerButton view="music" name="LibraryMusic" tooltip="Music" />

        <DrawerButton
          view="transformer"
          name="MovieFilter"
          tooltip="Media Transformer"
          badge={
            <ActivityBadge
              isPaused={stores.file.videoTransformer.hasPausedQueue}
              isRunning={stores.file.videoTransformer.isTransforming}
            />
          }
        />

        <DrawerButton
          view="duplicates"
          name="ImageSearch"
          tooltip="Find Duplicates"
          badge={
            <ActivityBadge
              isPaused={
                lowerResolution.displayStatus === "paused" ||
                lowerResolution.displayStatus === "groupingPaused"
              }
              isRunning={lowerResolution.isScanning || lowerResolution.isGrouping}
            />
          }
        />

        <IconButton
          name={stores.file.hasArchivedFiles ? "Delete" : "DeleteOutline"}
          tooltip="Delete Archived Files"
          onClick={stores.file.confirmDeleteArchivedFiles}
          disabled={!stores.file.hasArchivedFiles}
          tooltipProps={TOOLTIP_PROPS}
        />
      </View>

      <View column flex={1} justify="flex-end">
        <DrawerButton
          view="activity"
          name={
            stores.home.hasUnreadErrors
              ? "NotificationImportant"
              : stores.home.hasRunningBackgroundOperations
                ? "NotificationsActive"
                : stores.home.hasUnreadNotifications
                  ? "Notifications"
                  : "NotificationsNone"
          }
          tooltip="Activity Manager"
          badge={
            activeOperationCount > 0 && (
              <View className={cx(css.badge, css.count)}>
                <Text color="inherit" fontSize="0.75rem" fontWeight={500} lineHeight={1}>
                  {activeOperationCount > 99 ? "99+" : activeOperationCount}
                </Text>
              </View>
            )
          }
        />
      </View>
    </View>
  );
});

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

interface DrawerButtonProps extends Omit<IconButtonProps, "tooltipProps"> {
  badge?: ReactNode;
  /** The view the button shows, which it's marked as while shown. */
  view: HomeView;
}

const DrawerButton = Comp(({ badge, onClick, view, ...props }: DrawerButtonProps) => {
  const stores = useStores();

  const { css, cx } = useClasses(null);

  const handleClick = () => stores.home.openView(view);

  return (
    <View display="inline-flex" position="relative" flex="none">
      <IconButton
        {...props}
        onClick={onClick ?? handleClick}
        tooltipProps={TOOLTIP_PROPS}
        className={cx(stores.home.view === view && css.active)}
      />

      {badge}
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
    backgroundColor: colors.custom.blue,
    color: colors.custom.white,
  },
  active: {
    backgroundColor: colors.control,
    "&:hover": {
      backgroundColor: colors.control,
    },
  },
}));
