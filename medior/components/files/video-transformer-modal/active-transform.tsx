import { shell } from "@electron/remote";
import {
  Button,
  CenteredText,
  Checkbox,
  Comp,
  Divider,
  FileCard,
  LoadingOverlay,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { ProgressCircle, TransformDetails } from "./transform-details";

export const ActiveTransform = Comp(({ onCompare }: { onCompare: () => void }) => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const canReplace =
    store.activeTransform?.status === "COMPLETE" || store.activeTransform?.status === "COMPRESSED";

  return (
    <View
      column
      height="100%"
      width="100%"
      overflow="hidden"
      padding={{ all: "0.8rem" }}
      bgColor={colors.background}
    >
      <LoadingOverlay isLoading={store.isLoading} />

      {store.activeTransform ? (
        <View column height="100%" spacing="0.8rem" overflow="hidden">
          <View row flex={1} spacing="2rem" justify="center" align="center" overflow="auto hidden">
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

              <TransformDetails transform={store.activeTransform} withQueueTotals />
            </View>
          </View>

          <View row spacing="0.5rem" justify="center" width="100%">
            <View column spacing="0.5rem" width="11rem">
              <Button
                text="Play: Original"
                icon="PlayArrow"
                onClick={() =>
                  store.activeTransform?.beforePath &&
                  shell.openPath(store.activeTransform.beforePath)
                }
                disabled={!store.activeTransform.beforePath}
              />

              <Button
                text="Find: Original"
                icon="Folder"
                onClick={() =>
                  store.activeTransform?.beforePath &&
                  shell.showItemInFolder(store.activeTransform.beforePath)
                }
                disabled={!store.activeTransform.beforePath}
              />
            </View>

            <View column spacing="0.5rem" width="11rem">
              <Button
                text="Play: Output"
                icon="PlayArrow"
                onClick={() =>
                  store.activeTransform?.afterPath &&
                  shell.openPath(store.activeTransform.afterPath)
                }
                disabled={!store.activeTransform.afterPath}
              />

              <Button
                text="Find: Output"
                icon="Folder"
                onClick={() =>
                  store.activeTransform?.afterPath &&
                  shell.showItemInFolder(store.activeTransform.afterPath)
                }
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
                text={store.isPaused ? "Restart" : store.isTransforming ? "Pause" : "Run"}
                icon={store.isPaused || !store.isTransforming ? "PlayArrow" : "Pause"}
                onClick={() =>
                  store.isTransforming || store.isPaused
                    ? store.togglePaused()
                    : store.runActiveTransform()
                }
                disabled={store.isLoading}
                color={
                  store.isPaused
                    ? colors.custom.orange
                    : store.isTransforming
                      ? colors.custom.blue
                      : colors.custom.grey
                }
              />
            </View>

            <View column spacing="0.5rem" width="11rem">
              <View row flex={1} align="center">
                {store.activeTransform.type !== "splice" && (
                  <Checkbox
                    label="Auto-Replace"
                    labelProps={{ fontSize: "0.9em" }}
                    checked={store.isAuto}
                    setChecked={store.setAutoReplace}
                    flex="none"
                    padding={{ all: "0.1rem 0.3rem" }}
                  />
                )}
              </View>

              <Button
                text={store.activeTransform.type === "splice" ? "Save Copy" : "Replace"}
                icon={store.activeTransform.type === "splice" ? "Save" : "Refresh"}
                onClick={
                  store.activeTransform.type === "splice" ? store.saveCopy : store.replaceOutput
                }
                disabled={
                  !store.activeTransform.afterPath ||
                  (store.activeTransform.type === "splice"
                    ? store.activeTransform.status !== "COMPLETE"
                    : !canReplace)
                }
                color={colors.custom.green}
              />
            </View>
          </View>

          {store.activeTransform.errorMsg ? (
            <Text
              color={
                ["DUPLICATE", "SKIPPED"].includes(store.activeTransform.status)
                  ? colors.custom.orange
                  : colors.custom.red
              }
            >
              {store.activeTransform.errorMsg}
            </Text>
          ) : null}
        </View>
      ) : (
        <CenteredText text="Nothing queued" color={colors.custom.lightGrey} />
      )}
    </View>
  );
});
