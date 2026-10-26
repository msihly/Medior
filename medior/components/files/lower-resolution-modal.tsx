import { useEffect, useRef } from "react";
import {
  Button,
  CardGrid,
  Checkbox,
  Chip,
  Comp,
  Divider,
  Icon,
  JobProgress,
  LoadingOverlay,
  Modal,
  Pagination,
  ProgressBar,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { DuplicateGroupCard } from "./lower-resolution-modal/duplicate-group-card";
import { SearchSettings } from "./lower-resolution-modal/search-settings";
import { SearchStatus } from "./lower-resolution-modal/search-status";

export const LowerResolutionModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.lowerResolution;

  const groupsRef = useRef<HTMLDivElement>(null);

  // Groups filling in during grouping keep the reader's position; only page changes scroll up.
  useEffect(() => {
    groupsRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [store.page]);

  const isBusy =
    store.isApplyingOptions ||
    store.isArchiving ||
    store.isDismissing ||
    store.isGrouping ||
    store.isPageLoading ||
    store.isStarting;
  const emptyStates = {
    complete: {
      description: `No files matched at ${store.minSimilarity.toFixed(1)}% similarity or higher.`,
      title: "No duplicates found",
    },
    error: {
      description: "Nothing was found before the search stopped. Resume the search to retry.",
      title: "No duplicates to review",
    },
    grouping: {
      description: "Groups appear here as they are built.",
      title: "Grouping the search's matches",
    },
    groupingPaused: {
      description: "Resume grouping to build groups from the rest of the search's matches.",
      title: "Grouping paused",
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
      description: "Groups are built when the search is paused or completes.",
      title: "Searching for matches",
    },
  };
  const emptyState = emptyStates[store.displayStatus];
  const errors = [store.optionsError, store.actionError, store.error].filter(Boolean);
  const notices = [
    !store.hasSearchIndex
      ? {
          color: colors.custom.lightBlue,
          text: "Searching the whole library uses the similarity search index. Build it once in Settings → Repair → Similarity Search Index.",
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

  /** Archiving keeps going in the background while the modal is hidden. */
  const handleClose = () => {
    if (store.isArchiving) handleMinimize();
    else store.close();
  };

  const handleMinimize = () => store.setIsMinimized(true);

  const handlePageChange = (page: number) => {
    if (!store.isArchiving) store.loadPage(page);
  };

  const handleTagSelected = () => store.editTags(Object.keys(store.selection));

  return (
    <Modal.Container visible={!store.isMinimized} height="100%" width="100%" onClose={handleClose}>
      <LoadingOverlay
        isLoading={store.isArchiving}
        sub={store.archiveJob && <JobProgress job={store.archiveJob} onMinimize={handleMinimize} />}
      />

      <Modal.Header>
        <Text preset="title">{"Find Duplicates"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} overflow="hidden">
        <View row flex="none" spacing="0.5rem">
          <SearchSettings />

          <SearchStatus />
        </View>

        {notices.map(({ color, text }) => (
          <View key={text} row align="center" spacing="0.5rem">
            <Icon name="Info" size="1.1em" color={color} />

            <Text fontSize="0.85em" whiteSpace="normal">
              {text}
            </Text>
          </View>
        ))}

        {errors.map((error) => (
          <View key={error} row align="center" spacing="0.5rem">
            <Icon name="Error" size="1.1em" color={colors.custom.red} />

            <Text
              color={colors.custom.red}
              fontSize="0.85em"
              whiteSpace="normal"
              overflowWrap="anywhere"
            >
              {error}
            </Text>
          </View>
        ))}

        {store.groups.length ? (
          <View column flex={1} minHeight={0} spacing="0.5rem">
            <View row wrap="wrap" align="center" justify="space-between" spacing="1rem">
              <View row align="center" spacing="0.5rem">
                <Text bold>
                  {`${Fmt.commas(store.reviewCount)} groups at ${store.minSimilarity.toFixed(1)}%+`}
                </Text>

                {!!store.selectedCount && (
                  <Chip label={`${Fmt.commas(store.selectedCount)} Selected`} />
                )}
              </View>

              <View row align="center" spacing="0.5rem">
                <Button
                  text={store.isSelecting ? "Selecting…" : "Select All Duplicates"}
                  icon="SelectAll"
                  onClick={store.selectAllDuplicates}
                  disabled={store.isArchiving || store.isGrouping || store.isSelecting}
                  tooltip="Select every file except the best one in each group, across all pages. Shift-click tiles to select a range."
                />

                <Button
                  text="Clear"
                  icon="Deselect"
                  onClick={store.clearSelection}
                  disabled={store.isArchiving || !store.selectedCount}
                />

                <Divider orientation="vertical" />

                <Button
                  text="Tag Selected"
                  icon="Label"
                  onClick={handleTagSelected}
                  disabled={store.isArchiving || !store.selectedCount}
                />

                <Button
                  text={store.isDismissing ? "Marking…" : "Not Duplicates"}
                  icon="DoNotDisturb"
                  onClick={store.dismissSelected}
                  disabled={isBusy || !store.selectedCount}
                  tooltip="Mark the selected files as not duplicates of their group's best-quality file, such as confirmed variations. They leave their groups and stay apart in later searches until either file changes."
                />

                <Divider orientation="vertical" />

                <Checkbox
                  label="Merge into kept file"
                  checked={store.mergeMetadata}
                  setChecked={store.setMergeMetadata}
                  disabled={store.isArchiving}
                  flex="none"
                  width="auto"
                />

                <Button
                  text={`Archive ${Fmt.commas(store.selectedCount)}`}
                  icon="Archive"
                  color={colors.custom.red}
                  onClick={store.archive}
                  disabled={isBusy || !store.selectedCount}
                />
              </View>
            </View>

            <CardGrid
              maxCards={2}
              padding={{ all: 0 }}
              ref={groupsRef}
              cards={store.groups.map((group) => (
                <DuplicateGroupCard key={group.id} group={group} />
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
          text={store.isScanning || store.isGrouping ? "Run in Background" : "Close"}
          icon="Close"
          onClick={handleClose}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
