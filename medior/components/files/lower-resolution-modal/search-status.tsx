import {
  Button,
  Card,
  Comp,
  Detail,
  Icon,
  IconName,
  ProgressBar,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export const SearchStatus = Comp(() => {
  const stores = useStores();
  const store = stores.file.lowerResolution;

  const isGroupingShown =
    store.displayStatus === "grouping" || store.displayStatus === "groupingPaused";
  const isResumable = store.status === "paused" || store.status === "error";
  const remainingSeconds =
    store.rate > 0 && store.total > store.processed
      ? (store.total - store.processed) / store.rate
      : null;
  const progress = isGroupingShown
    ? { denominator: store.matched, numerator: store.grouped }
    : store.isScanning || (store.status !== "idle" && !!store.total)
      ? { denominator: store.total, numerator: store.processed }
      : null;
  const statuses: Record<
    typeof store.displayStatus,
    { color: CssColor; icon: IconName; label: string }
  > = {
    complete: { color: colors.custom.green, icon: "CheckCircle", label: "Search complete" },
    error: { color: colors.custom.red, icon: "Error", label: "Search stopped" },
    grouping: { color: colors.custom.blue, icon: "Autorenew", label: "Grouping…" },
    groupingPaused: { color: colors.custom.orange, icon: "Pause", label: "Grouping paused" },
    idle: { color: colors.custom.lightGrey, icon: "ImageSearch", label: "Ready to search" },
    paused: { color: colors.custom.orange, icon: "Pause", label: "Search paused" },
    running: {
      color: colors.custom.blue,
      icon: "Autorenew",
      label: store.cancelRequested ? "Pausing…" : "Searching…",
    },
  };
  const status = statuses[store.displayStatus];

  const handleGroupingToggle = async () => {
    const res = store.isGrouping ? await store.pauseGrouping() : await store.resumeGrouping();
    if (!res.success) toast.error(res.error);
  };

  return (
    <Card header="Search" flex={1} justify="center" minWidth={0} spacing="0.5rem">
      <View row align="center" justify="space-between" spacing="1rem">
        <View row align="center" minWidth={0} spacing="2rem">
          <View row align="center" spacing="0.5rem">
            <Icon name={status.icon} size="1.4em" color={status.color} />

            <Text bold>{status.label}</Text>
          </View>

          {store.status !== "idle" && (
            <>
              <Detail
                label="Files Searched"
                value={`${Fmt.commas(store.processed)}${store.total ? ` / ~${Fmt.commas(store.total)}` : ""}`}
              />

              {store.isScanning && (
                <Detail label="Speed" value={`${Fmt.commas(Math.round(store.rate))} files/s`} />
              )}

              {store.isScanning && remainingSeconds !== null && (
                <Detail
                  label="Time Left"
                  value={`~${Math.floor(remainingSeconds / 3600)}h ${Math.floor((remainingSeconds % 3600) / 60)}m`}
                />
              )}

              <Detail label="Files With Matches" value={Fmt.commas(store.matched)} />

              {isGroupingShown && (
                <Detail
                  label="Grouped"
                  value={`${Fmt.commas(store.grouped)} / ${Fmt.commas(store.matched)}`}
                />
              )}

              {!store.isScanning && <Detail label="Groups Found" value={Fmt.commas(store.found)} />}
            </>
          )}
        </View>

        <View row flex="none" spacing="0.5rem">
          {isGroupingShown && (
            <Button
              text={store.isGrouping ? "Pause Grouping" : "Resume Grouping"}
              icon={store.isGrouping ? "Pause" : "PlayArrow"}
              onClick={handleGroupingToggle}
              width="12rem"
            />
          )}

          {store.isScanning ? (
            <Button
              text={store.cancelRequested ? "Pausing…" : "Pause"}
              icon="Pause"
              onClick={store.pause}
              disabled={store.cancelRequested}
              width="10rem"
            />
          ) : (
            <Button
              text={
                store.isStarting
                  ? "Starting…"
                  : isResumable
                    ? "Resume"
                    : store.status === "complete"
                      ? "Search Again"
                      : "Find Duplicates"
              }
              icon={isResumable ? "PlayArrow" : "Search"}
              color={colors.custom.blue}
              onClick={store.scan}
              disabled={
                store.isApplyingOptions ||
                store.isArchiving ||
                store.isPageLoading ||
                store.isStarting
              }
              width="10rem"
            />
          )}
        </View>
      </View>

      {progress && (
        <ProgressBar
          {...progress}
          variant={progress.denominator ? "determinate" : "indeterminate"}
          viewProps={{ flex: "none" }}
        />
      )}
    </Card>
  );
});
