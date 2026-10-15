import { Button, Comp, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";

/** A minimized repair's latest log entry, with its controls. */
export const RepairProgress = Comp(() => {
  const stores = useStores();
  const store = stores.home.settings.repair;

  const lastLog = store.outputLog[store.outputLog.length - 1];

  const handleRestore = () => store.setIsMinimized(false);

  return (
    <View column align="center" spacing="0.5rem">
      <Text preset="title">{"Database Repair"}</Text>

      {lastLog && (
        <Text color={lastLog.color} textAlign="center" whiteSpace="normal" overflowWrap="anywhere">
          {lastLog.text}
        </Text>
      )}

      <View row justify="center" spacing="0.5rem">
        {store.isRunning && (
          <Button
            text={store.isCancellationRequested ? "Stopping…" : "Stop"}
            icon="Stop"
            onClick={store.cancel}
            disabled={store.isCancellationRequested}
            color={colors.custom.red}
          />
        )}

        <Button text="Restore" icon="OpenInFull" onClick={handleRestore} />
      </View>
    </View>
  );
});
