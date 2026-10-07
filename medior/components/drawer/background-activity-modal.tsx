import { useEffect } from "react";
import { Button, Card, Comp, Icon, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { formatDate, NOTIFICATION_TYPE_META } from "./activity-meta";
import { OperationCard } from "./operation-card";

export const BackgroundActivityModal = Comp(() => {
  const stores = useStores();
  const store = stores.home;

  const handleClose = () => {
    store.setIsActivityOpen(false);
    store.readNotifications();
  };

  const handleRefresh = () => store.loadBackgroundActivity();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const refresh = async () => {
      await handleRefresh();

      if (!cancelled) timer = setTimeout(refresh, 2000);
    };

    refresh();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <Modal.Container onClose={handleClose} height="90%" width="90%">
      <Modal.Header>
        <Text preset="title">{"Activity"}</Text>
      </Modal.Header>

      <Modal.Content row flex={1} minHeight={0} minWidth={0} overflow="hidden" spacing="1rem">
        <Card
          flex={1}
          header="Operations"
          minHeight={0}
          minWidth={0}
          overflow="hidden auto"
          spacing="0.5rem"
        >
          {store.backgroundOperations.length ? (
            store.backgroundOperations.map((operation) => (
              <OperationCard key={operation.id} operation={operation} />
            ))
          ) : (
            <View flex={1} align="center" justify="center">
              <Text color={colors.custom.lightGrey}>{"No background operations."}</Text>
            </View>
          )}
        </Card>

        <Card
          flex={1}
          header="Notifications"
          minHeight={0}
          minWidth={0}
          overflow="hidden auto"
          spacing="0.5rem"
        >
          {store.notifications.length ? (
            store.notifications.map((notification) => {
              const meta = NOTIFICATION_TYPE_META[notification.type];

              return (
                <Card
                  key={notification.id}
                  row
                  align="center"
                  bgColor={colors.background}
                  flex="none"
                  justify="space-between"
                  minWidth={0}
                  padding={{ all: "0.6rem" }}
                  spacing="1rem"
                  width="100%"
                >
                  <View row flex={1} align="center" minWidth={0} spacing="0.5rem">
                    <Icon color={meta.color} name={meta.icon} />

                    <Text
                      color={meta.color}
                      minWidth={0}
                      overflowWrap="anywhere"
                      whiteSpace="normal"
                    >
                      {notification.message}
                    </Text>
                  </View>

                  <Text
                    color={colors.custom.lightGrey}
                    flex="none"
                    fontSize="0.8em"
                    whiteSpace="nowrap"
                  >
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

      <Modal.Footer>
        <Button text="Refresh" icon="Refresh" onClick={handleRefresh} />

        <Button text="Close" icon="Close" onClick={handleClose} />
      </Modal.Footer>
    </Modal.Container>
  );
});
