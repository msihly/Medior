import { LinearProgress } from "@mui/material";
import { BackgroundOperationSchema, NotificationSchema } from "medior/_generated/server";
import { Card, Comp, Icon, IconName, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor } from "medior/utils/client";
import { dayjs } from "medior/utils/common";

interface ActivityMeta {
  color: CssColor;
  icon: IconName;
}

const NOTIFICATION_TYPE_META: Record<NotificationSchema["type"], ActivityMeta> = {
  error: { color: colors.custom.red, icon: "Error" },
  info: { color: colors.custom.blue, icon: "Info" },
  success: { color: colors.custom.green, icon: "CheckCircle" },
  warning: { color: colors.custom.orange, icon: "NewReleases" },
};

const OPERATION_STATUS_META: Record<BackgroundOperationSchema["status"], ActivityMeta> = {
  CANCELLED: { color: colors.custom.grey, icon: "Cancel" },
  COMPLETE: { color: colors.custom.green, icon: "CheckCircle" },
  ERROR: { color: colors.custom.red, icon: "Error" },
  PENDING: { color: colors.custom.orange, icon: "HourglassEmpty" },
  RUNNING: { color: colors.custom.blue, icon: "Autorenew" },
};

const formatDate = (date: string) => dayjs(date).format("MMM D, YYYY h:mm A");

export const BackgroundActivityModal = Comp(() => {
  const stores = useStores();
  const store = stores.home;

  const handleClose = () => store.setIsActivityOpen(false);

  return (
    <Modal.Container onClose={handleClose} height="90%" width="55rem">
      <Modal.Header>
        <Text preset="title">{"Activity"}</Text>
      </Modal.Header>

      <Modal.Content flex={1} overflow="hidden" spacing="1rem">
        <Card flex={1} header="Operations" overflow="auto" spacing="0.5rem">
          {store.backgroundOperations.length ? (
            store.backgroundOperations.map((operation) => {
              const meta = OPERATION_STATUS_META[operation.status];

              return (
                <Card
                  key={operation.id}
                  bgColor={colors.background}
                  padding={{ all: "0.6rem" }}
                  spacing="0.4rem"
                >
                  <View row align="center" justify="space-between" spacing="1rem">
                    <View row align="center" spacing="0.5rem">
                      <Icon color={meta.color} name={meta.icon} />

                      <Text>{operation.label}</Text>
                    </View>

                    <Text color={meta.color} fontSize="0.8em">
                      {`${operation.status} · ${operation.processedCount} / ${operation.totalCount}`}
                    </Text>
                  </View>

                  {operation.status === "PENDING" || operation.status === "RUNNING" ? (
                    <LinearProgress
                      value={
                        operation.totalCount
                          ? (operation.processedCount / operation.totalCount) * 100
                          : 0
                      }
                      variant={operation.totalCount ? "determinate" : "indeterminate"}
                    />
                  ) : null}

                  <View row align="center" justify="space-between" spacing="1rem">
                    <Text
                      color={operation.error ? colors.custom.red : colors.custom.lightGrey}
                      fontSize="0.8em"
                      whiteSpace="normal"
                    >
                      {operation.error ?? operation.message}
                    </Text>

                    <Text color={colors.custom.lightGrey} fontSize="0.8em" whiteSpace="nowrap">
                      {formatDate(operation.dateCreated)}
                    </Text>
                  </View>
                </Card>
              );
            })
          ) : (
            <View flex={1} align="center" justify="center">
              <Text color={colors.custom.lightGrey}>{"No background operations."}</Text>
            </View>
          )}
        </Card>

        <Card flex={1} header="Notifications" overflow="auto" spacing="0.5rem">
          {store.notifications.length ? (
            store.notifications.map((notification) => {
              const meta = NOTIFICATION_TYPE_META[notification.type];

              return (
                <Card
                  key={notification.id}
                  row
                  align="center"
                  bgColor={colors.background}
                  justify="space-between"
                  padding={{ all: "0.6rem" }}
                  spacing="1rem"
                >
                  <View row flex={1} align="center" spacing="0.5rem" overflow="hidden">
                    <Icon color={meta.color} name={meta.icon} />

                    <Text color={meta.color} whiteSpace="normal">
                      {notification.message}
                    </Text>
                  </View>

                  <Text color={colors.custom.lightGrey} fontSize="0.8em" whiteSpace="nowrap">
                    {formatDate(notification.dateCreated)}
                  </Text>
                </Card>
              );
            })
          ) : (
            <View flex={1} align="center" justify="center">
              <Text color={colors.custom.lightGrey}>{"No notifications."}</Text>
            </View>
          )}
        </Card>
      </Modal.Content>
    </Modal.Container>
  );
});
