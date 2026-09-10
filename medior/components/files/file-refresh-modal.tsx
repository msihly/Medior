import { Button, Card, Comp, Icon, Modal, ProgressBar, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";

export const FileRefreshModal = Comp(() => {
  const stores = useStores();
  const store = stores.file;
  const currentFileNumber = Math.min(store.refreshProcessedCount + 1, store.refreshTotalCount);

  const handleClose = () =>
    store.isRefreshing ? store.cancelFileRefresh() : store.setIsRefreshOpen(false);

  return (
    <>
      <Modal.Container
        height="30rem"
        width="35rem"
        visible={!store.isRefreshMinimized}
        onClose={handleClose}
      >
        <Modal.Header>
          <Text preset="title">{"Refresh Files"}</Text>
        </Modal.Header>

        <Modal.Content align="center" justify="center" spacing="1rem">
          <Icon name="Refresh" color={colors.custom.lightBlue} size="5rem" />

          <Text preset="title">{`File ${currentFileNumber} of ${store.refreshTotalCount}`}</Text>

          <Text textAlign="center" whiteSpace="normal">
            {store.refreshCurrentFileName}
          </Text>

          <Text color={colors.custom.lightGrey}>{store.refreshMessage}</Text>

          {store.refreshStepProgress !== null && (
            <ProgressBar
              numerator={store.refreshStepProgress}
              denominator={100}
              viewProps={{ width: "100%" }}
              withText
            />
          )}
        </Modal.Content>

        <Modal.Footer>
          <Button text="Cancel" icon="Close" onClick={handleClose} />

          <Button
            text="Minimize"
            icon="IndeterminateCheckBox"
            onClick={() => store.setIsRefreshMinimized(true)}
          />
        </Modal.Footer>
      </Modal.Container>

      {store.isRefreshMinimized && (
        <View
          position="fixed"
          style={{ bottom: "1rem", right: "1rem", zIndex: 1400 }}
          width="24rem"
        >
          <Card spacing="0.75rem" padding={{ all: "0.75rem" }} width="100%">
            <Text preset="title">{`Refreshing file ${currentFileNumber} of ${store.refreshTotalCount}`}</Text>

            <Text whiteSpace="normal">{store.refreshCurrentFileName}</Text>

            <Text color={colors.custom.lightGrey}>{store.refreshMessage}</Text>

            {store.refreshStepProgress !== null && (
              <ProgressBar
                numerator={store.refreshStepProgress}
                denominator={100}
                viewProps={{ width: "100%" }}
                withText
              />
            )}

            <View row spacing="0.5rem">
              <Button text="Cancel" icon="Close" onClick={handleClose} />

              <Button
                text="Restore"
                icon="OpenInFull"
                onClick={() => store.setIsRefreshMinimized(false)}
              />
            </View>
          </Card>
        </View>
      )}
    </>
  );
});
