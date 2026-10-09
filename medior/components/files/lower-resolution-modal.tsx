import {
  Button,
  Card,
  CardGrid,
  Checkbox,
  Comp,
  FileBase,
  Icon,
  LoadingOverlay,
  Modal,
  Pagination,
  ProgressBar,
  Slider,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, openCarouselWindow } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { MIN_DUPLICATE_SIMILARITY } from "medior/utils/common/duplicate-search";

export const LowerResolutionModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.lowerResolution;

  const isBusy = store.isScanning || store.isStarting || store.isArchiving;
  const remainingSeconds =
    store.rate > 0 && store.total > store.processed
      ? (store.total - store.processed) / store.rate
      : null;
  const progressLabel = [
    `${Fmt.commas(store.processed)}${store.total ? ` / ~${Fmt.commas(store.total)}` : ""} files`,
    store.isScanning ? `${Fmt.commas(Math.round(store.rate))} files/s` : null,
    remainingSeconds === null || !store.isScanning
      ? null
      : `~${Math.floor(remainingSeconds / 3600)}h ${Math.floor((remainingSeconds % 3600) / 60)}m left`,
    `${Fmt.commas(store.found)} groups`,
  ]
    .filter(Boolean)
    .join(" · ");
  const statusLabels = {
    complete: "Search complete",
    error: "Search stopped",
    idle: "Ready to search",
    paused: "Search paused",
    running: store.cancelRequested ? "Pausing…" : "Searching…",
  };
  const emptyStates = {
    complete: {
      description: `No files matched at ${store.reviewThreshold}% similarity or higher.`,
      title: "No duplicates found",
    },
    error: {
      description: "Nothing was found before the search stopped. Search again to retry.",
      title: "No duplicates to review",
    },
    idle: {
      description:
        "Images and videos are compared using their visual similarity index. Lower the minimum similarity to include looser variants. Nothing is archived until you review it.",
      title: "Find files that look the same",
    },
    paused: {
      description: "Resume the search to continue from where it stopped.",
      title: "No duplicates found yet",
    },
    running: {
      description: "You can close this window while the search runs in the background.",
      title: "Duplicate groups will appear here as they are found",
    },
  };
  const emptyState = emptyStates[store.status];
  const notices = [
    !!store.scanId && store.needsRescan && !!store.reviewOptions
      ? {
          color: colors.custom.lightBlue,
          text: `This search only recorded matches at ${store.reviewOptions.minSimilarity}% or higher. Search Again to find weaker matches; raising the threshold filters the current results instantly.`,
        }
      : null,
    !store.hasSearchIndex
      ? {
          color: colors.custom.lightBlue,
          text: "Searching the whole library uses the similarity search index. Build it once in Settings → Repair → Similarity Search Index. Find Variants on a single file works without it.",
        }
      : null,
    store.unindexedCount
      ? {
          color: colors.custom.orange,
          text: `${Fmt.commas(store.unindexedCount)} ${store.unindexedCount === 1 ? "file was" : "files were"} vectorized after the search index was last updated and won't appear as matches. Update the index in Settings → Repair to include them.`,
        }
      : null,
    store.skipped
      ? {
          color: colors.custom.orange,
          text: `${Fmt.commas(store.skipped)} ${store.skipped === 1 ? "file has" : "files have"} no similarity vector yet and ${store.skipped === 1 ? "was" : "were"} skipped. Run similarity indexing in Settings → Repair to include them.`,
        }
      : null,
  ].filter(Boolean);

  const handlePageChange = (page: number) => {
    if (!store.isArchiving) store.loadPage(page);
  };

  const handleScan = () => store.scan();

  const handleStopArchiving = () => store.setArchiveStopRequested(true);

  return (
    <Modal.Container height="100%" width="100%" onClose={store.close}>
      <LoadingOverlay
        isLoading={store.isArchiving}
        sub={
          <View column align="center" spacing="0.5rem">
            <Text preset="title" fontSize="0.9em">
              {`${store.mergeMetadata ? "Merged and archived" : "Archived"} ${Fmt.commas(store.archiveProcessed)} of ${Fmt.commas(store.archiveTotal)} files…`}
            </Text>

            <Button
              text={store.archiveStopRequested ? "Stopping…" : "Stop Archiving"}
              icon="Stop"
              onClick={handleStopArchiving}
              disabled={store.archiveStopRequested}
            />
          </View>
        }
      />

      <Modal.Header>
        <View column align="center">
          <Text preset="title">{"Find Duplicates"}</Text>

          <Text color={colors.custom.lightGrey} fontSize="0.8em">
            {store.sourceFileId ? "Variants of the selected file" : "Across your library"}
          </Text>
        </View>
      </Modal.Header>

      <Modal.Content dividers={false} overflow="hidden" spacing="0.5rem">
        <Card flex="none" width="100%" spacing="0.5rem">
          <View row wrap="wrap" align="center" spacing="1rem">
            <View column width="20rem">
              <View row align="center" justify="space-between">
                <Text bold fontSize="0.9em">
                  {"Minimum Similarity"}
                </Text>

                <Text bold color={colors.custom.lightBlue}>{`${store.minSimilarity}%`}</Text>
              </View>

              <Slider
                value={store.minSimilarity}
                setValue={store.setMinSimilarity}
                onCommit={store.applyReviewThreshold}
                min={MIN_DUPLICATE_SIMILARITY}
                max={100}
                step={0.5}
                disabled={store.isStarting || store.isArchiving}
              />
            </View>

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
                    : store.status === "paused" && !store.needsRescan
                      ? "Resume"
                      : store.status === "idle" || !store.scanId
                        ? "Find Duplicates"
                        : "Search Again"
                }
                icon="Search"
                color={colors.custom.blue}
                onClick={handleScan}
                disabled={isBusy || store.isPageLoading}
                width="10rem"
              />
            )}

            <View column flex={1} spacing="0.5rem">
              <View row wrap="wrap" align="center" justify="space-between" spacing="1rem">
                <Text bold>{statusLabels[store.status]}</Text>

                {store.status !== "idle" && (
                  <Text color={colors.custom.lightGrey} fontSize="0.85em">
                    {progressLabel}
                  </Text>
                )}
              </View>

              {store.isScanning && (
                <ProgressBar
                  denominator={store.total}
                  numerator={store.processed}
                  variant={store.total ? "determinate" : "indeterminate"}
                  viewProps={{ flex: "none" }}
                />
              )}
            </View>
          </View>

          {notices.map(({ color, text }) => (
            <View key={text} row align="center" spacing="0.5rem">
              <Icon name="Info" size="1.1em" color={color} />

              <Text fontSize="0.85em" whiteSpace="normal">
                {text}
              </Text>
            </View>
          ))}

          {store.error && (
            <View row align="center" spacing="0.5rem">
              <Icon name="Error" size="1.1em" color={colors.custom.red} />

              <Text
                color={colors.custom.red}
                fontSize="0.85em"
                whiteSpace="normal"
                overflowWrap="anywhere"
              >
                {store.error}
              </Text>
            </View>
          )}
        </Card>

        {store.groups.length ? (
          <View column flex={1} minHeight={0} spacing="0.5rem">
            <View row wrap="wrap" align="center" justify="space-between" spacing="1rem">
              <Text bold>
                {`${Fmt.commas(store.reviewCount)} groups at ${store.reviewThreshold}%+ · ${Fmt.commas(store.selectedCount)} selected`}
              </Text>

              <View row wrap="wrap" spacing="0.5rem">
                <Button
                  text={store.isSelecting ? "Selecting…" : "Select All Duplicates"}
                  icon="SelectAll"
                  onClick={store.selectAllDuplicates}
                  disabled={store.isArchiving || store.isSelecting}
                  tooltip="Select every file except the best one in each group, across all pages. Shift-click tiles to select a range."
                />

                <Button
                  text="Clear"
                  icon="Deselect"
                  onClick={store.clearSelection}
                  disabled={store.isArchiving || !store.selectedCount}
                />

                <Checkbox
                  label="Merge into kept file"
                  checked={store.mergeMetadata}
                  setChecked={store.setMergeMetadata}
                  disabled={store.isArchiving}
                />

                <Button
                  text={`Archive ${Fmt.commas(store.selectedCount)}`}
                  icon="Archive"
                  color={colors.custom.red}
                  onClick={store.archive}
                  disabled={
                    store.isArchiving ||
                    store.isStarting ||
                    store.isPageLoading ||
                    !store.selectedCount
                  }
                />
              </View>
            </View>

            <CardGrid
              maxCards={2}
              padding={{ all: 0 }}
              cards={store.groups.map((group) => (
                <View key={group.id} padding={{ all: "0.3rem" }}>
                  <Card spacing="0.5rem">
                    <View row align="center" justify="space-between">
                      <Text bold>{`Up to ${group.score.toFixed(1)}% similar`}</Text>

                      <Text color={colors.custom.lightGrey} fontSize="0.85em">
                        {`${group.files.length - 1} ${group.files.length === 2 ? "duplicate" : "duplicates"}`}
                      </Text>
                    </View>

                    <View row wrap="wrap">
                      {group.files.map((file, index) => {
                        const isSelected = !!store.selection[file.id];

                        return (
                          <View
                            key={file.id}
                            column
                            flex="none"
                            width="15rem"
                            spacing="0.3rem"
                            padding={{ all: "0.3rem" }}
                          >
                            <FileBase.Container
                              height="13rem"
                              selected={isSelected}
                              selectedColor={colors.custom.red}
                              onClick={(event) => store.toggleSelected(file.id, event.shiftKey)}
                              onDoubleClick={() =>
                                openCarouselWindow({
                                  file,
                                  selectedFileIds: group.files.map((f) => f.id),
                                })
                              }
                            >
                              <FileBase.Image
                                thumb={file.thumb}
                                fileId={file.id}
                                title={file.originalName}
                                fit="contain"
                                height="13rem"
                              >
                                <FileBase.Chip
                                  position="top-left"
                                  label={
                                    isSelected
                                      ? "Archive"
                                      : index === 0
                                        ? "Best Quality"
                                        : `${file.similarity.toFixed(1)}%`
                                  }
                                  bgColor={
                                    isSelected
                                      ? colors.custom.red
                                      : index === 0
                                        ? colors.custom.green
                                        : undefined
                                  }
                                  color={colors.custom.white}
                                  opacity={1}
                                />

                                <FileBase.Chip position="top-right" label={file.ext} />

                                {!!file.duration && (
                                  <FileBase.Chip
                                    position="bottom-right"
                                    label={Fmt.duration(file.duration)}
                                  />
                                )}
                              </FileBase.Image>
                            </FileBase.Container>

                            <Text fontSize="0.85em">
                              {`${file.width} × ${file.height} · ${Fmt.bytes(file.size)}`}
                            </Text>

                            <Text
                              color={colors.custom.lightGrey}
                              fontSize="0.8em"
                              tooltip={file.originalName}
                            >
                              {file.originalName}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </Card>
                </View>
              ))}
            />

            {store.pageCount > 1 && (
              <Pagination
                inline
                count={store.pageCount}
                page={store.page}
                onChange={handlePageChange}
              />
            )}
          </View>
        ) : store.isPageLoading ? (
          <ProgressBar variant="indeterminate" viewProps={{ flex: "none" }} />
        ) : (
          <View column flex={1} align="center" justify="center" spacing="0.5rem">
            <Icon name="ImageSearch" size="3rem" color={colors.custom.grey} />

            <Text bold whiteSpace="normal">
              {emptyState.title}
            </Text>

            <Text
              color={colors.custom.lightGrey}
              fontSize="0.85em"
              whiteSpace="normal"
              textAlign="center"
            >
              {emptyState.description}
            </Text>
          </View>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={store.isScanning ? "Run in Background" : "Close"}
          icon="Close"
          onClick={store.close}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
