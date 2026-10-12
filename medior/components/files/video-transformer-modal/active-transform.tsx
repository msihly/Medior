import { shell } from "@electron/remote";
import { useState } from "react";
import {
  Button,
  CenteredText,
  Checkbox,
  Comp,
  ConfirmModal,
  Divider,
  FileCard,
  LoadingOverlay,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { SizeHistoryChart } from "./size-history-chart";
import { TransformDetails } from "./transform-details";
import { ProgressCircle } from "./transform-progress-circle";

export const ActiveTransform = Comp(({ onCompare }: { onCompare: () => void }) => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const [isConfirmRunOpen, setIsConfirmRunOpen] = useState(false);

  const canReplace =
    store.activeTransform?.status === "COMPLETE" || store.activeTransform?.status === "COMPRESSED";
  // Paused workers finish their in-flight files before the transformer stops.
  const isPausing = store.isPaused && store.isQueueTransforming;

  const confirmRun = async () => {
    const res = await store.runActiveTransform();
    if (!res.success) toast.error(res.error);

    return res.success;
  };

  const handleAutoReplace = async (isAuto: boolean) => {
    const res = await store.setAutoReplace(isAuto);

    if (!res.success) toast.error(res.error);
  };

  const handleFindOriginal = () =>
    store.activeTransform?.beforePath && shell.showItemInFolder(store.activeTransform.beforePath);

  const handleFindOutput = () =>
    store.activeTransform?.afterPath && shell.showItemInFolder(store.activeTransform.afterPath);

  const handlePlayOriginal = () =>
    store.activeTransform?.beforePath && shell.openPath(store.activeTransform.beforePath);

  const handlePlayOutput = () =>
    store.activeTransform?.afterPath && shell.openPath(store.activeTransform.afterPath);

  const handleFinalize = async () => {
    const res = await store.finalizeActiveTransform();
    if (!res.success) toast.error(res.error);
  };

  const handleTogglePaused = async () => {
    if (store.isTransforming && !store.isQueueTransforming) setIsConfirmRunOpen(true);
    else {
      const res = await (store.isQueueTransforming || store.isPaused
        ? store.togglePaused()
        : store.runActiveTransform());

      if (!res.success) toast.error(res.error);
    }
  };

  return (
    <>
      <View
        column
        height="100%"
        width="100%"
        overflow="hidden"
        padding={{ all: "0.8rem" }}
        bgColor={colors.background}
      >
        <LoadingOverlay
          isLoading={store.isLoading || store.isUpdating}
          sub={
            !store.isUpdating && <Button text="Cancel" icon="Close" onClick={store.cancelLoad} />
          }
        />

        <View column height="100%" spacing="0.8rem" overflow="hidden">
          <View row flex={1} spacing="2rem" justify="center" align="center" overflow="auto hidden">
            {store.activeTransform ? (
              <>
                <FileCard
                  file={store.activeFile}
                  store={store.search}
                  disabled
                  width="16rem"
                  height="16rem"
                />

                <View row flex="none" spacing="2rem" justify="center" align="center">
                  <ProgressCircle transform={store.activeTransform} />

                  <Divider orientation="vertical" />

                  <TransformDetails transform={store.activeTransform} />
                </View>
              </>
            ) : (
              <CenteredText
                text={store.isLoading || store.isQueueTransforming ? "Loading…" : "Nothing queued"}
                color={colors.custom.lightGrey}
                viewProps={{ flex: "none" }}
              />
            )}

            <Divider orientation="vertical" />

            <SizeHistoryChart />
          </View>

          {store.activeTransform && (
            <View row spacing="0.5rem" justify="center" width="100%">
              <View column spacing="0.5rem" width="11rem">
                <Button
                  text="Play: Original"
                  icon="PlayArrow"
                  onClick={handlePlayOriginal}
                  disabled={!store.activeTransform.beforePath}
                />

                <Button
                  text="Find: Original"
                  icon="Folder"
                  onClick={handleFindOriginal}
                  disabled={!store.activeTransform.beforePath}
                />
              </View>

              <View column spacing="0.5rem" width="11rem">
                <Button
                  text="Play: Output"
                  icon="PlayArrow"
                  onClick={handlePlayOutput}
                  disabled={!store.activeTransform.afterPath}
                />

                <Button
                  text="Find: Output"
                  icon="Folder"
                  onClick={handleFindOutput}
                  disabled={!store.activeTransform.afterPath}
                />
              </View>

              <View column spacing="0.5rem" width="11rem">
                <Button
                  text="Compare"
                  icon="Compare"
                  onClick={onCompare}
                  disabled={
                    !store.activeTransform.beforePath ||
                    !store.activeTransform.afterPath ||
                    store.activeTransform.type === "splice" ||
                    !canReplace
                  }
                />

                <Button
                  text={
                    isPausing
                      ? "Pausing…"
                      : store.isPaused
                        ? "Restart"
                        : store.isQueueTransforming
                          ? "Pause"
                          : "Run"
                  }
                  icon={store.isPaused || !store.isQueueTransforming ? "PlayArrow" : "Pause"}
                  onClick={handleTogglePaused}
                  disabled={
                    isPausing || store.isUpdating || (store.isLoading && !store.isQueueTransforming)
                  }
                  color={
                    store.isPaused
                      ? colors.custom.orange
                      : store.isQueueTransforming
                        ? colors.custom.blue
                        : colors.custom.grey
                  }
                />
              </View>

              <View column spacing="0.5rem" width="11rem">
                <View row flex={1} align="center">
                  <Checkbox
                    label="Auto-Replace"
                    labelProps={{ fontSize: "0.9em" }}
                    checked={store.isAuto}
                    disabled={store.isUpdating}
                    setChecked={handleAutoReplace}
                    flex="none"
                    padding={{ all: "0.1rem 0.3rem" }}
                  />
                </View>

                <Button
                  text={store.activeTransform.isSpliceCopy ? "Save Copy" : "Replace"}
                  icon={store.activeTransform.isSpliceCopy ? "Save" : "Refresh"}
                  onClick={handleFinalize}
                  disabled={
                    store.isLoading ||
                    store.isTransforming ||
                    store.isUpdating ||
                    !store.activeTransform.afterPath ||
                    (store.activeTransform.type === "splice"
                      ? store.activeTransform.status !== "COMPLETE"
                      : !canReplace)
                  }
                  color={colors.custom.green}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      {isConfirmRunOpen && (
        <ConfirmModal
          headerText="Pause Media Transformer"
          subText="Another queue is running. Running this one pauses it and loses the active transform's progress."
          confirmText="Run"
          confirmIcon="PlayArrow"
          confirmColor={colors.custom.blue}
          onConfirm={confirmRun}
          setVisible={setIsConfirmRunOpen}
        />
      )}
    </>
  );
});
