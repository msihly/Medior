import {
  Button,
  Card,
  Checkbox,
  Comp,
  FileBase,
  Modal,
  NumInput,
  Pagination,
  ProgressBar,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, openCarouselWindow } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export const LowerResolutionModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.lowerResolution;

  const { css } = useClasses(null);

  const isBusy = store.isScanning || store.isStarting || store.isArchiving;
  const canReview = !isBusy && !store.hasChangedOptions;
  const hasInvalidOptions =
    !Number.isFinite(store.minSimilarity) ||
    store.minSimilarity < 1 ||
    store.minSimilarity > 100 ||
    !Number.isInteger(store.pixelTolerance) ||
    store.pixelTolerance < 0 ||
    store.pixelTolerance > 255;
  const rate = store.elapsedMs > 0 ? store.processed / (store.elapsedMs / 1000) : 0;
  const progress = store.total ? Math.min(100, (store.processed / store.total) * 100) : 0;
  const statusLabels = {
    complete: "Search complete",
    error: "Search stopped",
    idle: "Ready to find copies",
    paused: "Search paused",
    running: store.isPreparingIndex ? "Preparing visual search index" : "Finding copies",
  };

  const handleDeselectAll = () => store.setSelectedIds([]);

  const handlePageChange = (page: number) => {
    if (!store.isArchiving) store.loadPage(page);
  };

  const handleScan = () => store.scan();

  return (
    <Modal.Container
      height={store.found ? "88vh" : undefined}
      maxHeight="90vh"
      width="min(72rem, calc(100vw - 3rem))"
      onClose={store.close}
    >
      <Modal.Header>
        <Text preset="title">{"Find Image Copies"}</Text>
      </Modal.Header>

      <Modal.Content height="auto" minWidth={0} overflow="hidden auto" spacing="1rem">
        <View column flex="none" minWidth={0} spacing="0.5rem">
          <Text whiteSpace="normal">
            {store.sourceFileId
              ? "Find variants of this image."
              : "Find smaller variants across your library."}
          </Text>

          <Text color={colors.custom.lightGrey} fontSize="0.85em" whiteSpace="normal">
            {
              "Uses your existing visual similarity index. Some matches may be missed; unindexed images are skipped. Matches are checked against the originals before archiving."
            }
          </Text>
        </View>

        <Card flex="none" minWidth={0} padding={{ all: "1rem" }} spacing="0.75rem">
          <View row wrap="wrap" align="flex-end" className={css.actions}>
            <NumInput
              label="Matching Area (%)"
              value={store.minSimilarity}
              setValue={store.setMinSimilarity}
              minValue={1}
              maxValue={100}
              width="12rem"
              disabled={isBusy}
            />

            <NumInput
              label="Pixel Tolerance"
              value={store.pixelTolerance}
              setValue={store.setPixelTolerance}
              minValue={0}
              maxValue={255}
              width="12rem"
              disabled={isBusy}
            />

            <Button
              text={
                store.isStarting
                  ? "Starting…"
                  : store.status === "paused" && !store.hasChangedOptions
                    ? "Resume Search"
                    : store.status === "complete" || (store.hasChangedOptions && !!store.scanId)
                      ? "Search Again"
                      : "Find Copies"
              }
              icon="Search"
              onClick={handleScan}
              disabled={isBusy || store.isPageLoading || hasInvalidOptions}
            />
          </View>

          <Text color={colors.custom.lightGrey} fontSize="0.85em" whiteSpace="normal">
            {
              "A 95% matching area allows differences in 5% of the image. Pixel tolerance allows compression noise. Changing these settings starts a new search."
            }
          </Text>
        </Card>

        {store.status !== "idle" && (
          <Card flex="none" minWidth={0} padding={{ all: "1rem" }} spacing="0.75rem">
            <View row wrap="wrap" align="center" justify="space-between" className={css.controls}>
              <Text bold whiteSpace="normal">
                {store.cancelRequested ? "Pausing…" : statusLabels[store.status]}
              </Text>

              <Text color={colors.custom.lightBlue} whiteSpace="normal">
                {`${Fmt.commas(store.found)} verified matches`}
              </Text>
            </View>

            {store.isScanning && (
              <ProgressBar
                denominator={100}
                numerator={progress}
                variant={store.total && !store.isPreparingIndex ? "determinate" : "indeterminate"}
                viewProps={{ flex: "none" }}
              />
            )}

            {store.isScanning && store.isPreparingIndex && (
              <Text color={colors.custom.lightGrey} fontSize="0.85em" whiteSpace="normal">
                {"Preparing search from stored vectors. Files without vectors are skipped."}
              </Text>
            )}

            <View row wrap="wrap" className={css.stats}>
              <Text fontSize="0.85em" whiteSpace="normal">
                {`${Fmt.commas(store.processed)}${store.total ? ` / ~${Fmt.commas(store.total)}` : ""} records checked`}
              </Text>

              <Text
                fontSize="0.85em"
                whiteSpace="normal"
              >{`${Fmt.commas(Math.round(rate))} records/s`}</Text>

              <Text
                fontSize="0.85em"
                whiteSpace="normal"
              >{`${Fmt.commas(store.compared)} original comparisons`}</Text>

              {!!store.skipped && (
                <Text color={colors.custom.orange} fontSize="0.85em" whiteSpace="normal">
                  {`${Fmt.commas(store.skipped)} images need similarity indexing`}
                </Text>
              )}

              {!!store.errors && (
                <Text color={colors.custom.orange} fontSize="0.85em" whiteSpace="normal">
                  {`${Fmt.commas(store.errors)} read failures`}
                </Text>
              )}
            </View>

            {store.isScanning && (
              <Text color={colors.custom.lightGrey} fontSize="0.85em" whiteSpace="normal">
                {
                  "You can close this window while the search runs. Pause to archive matches; resume from the saved position."
                }
              </Text>
            )}
          </Card>
        )}

        {store.error && (
          <Text color={colors.custom.red} whiteSpace="normal" overflowWrap="anywhere">
            {store.error}
          </Text>
        )}

        {!!store.found && (
          <View
            row
            flex="none"
            wrap="wrap"
            align="center"
            justify="space-between"
            className={css.actions}
          >
            <Text
              bold
              whiteSpace="normal"
            >{`${Fmt.commas(store.selectedIds.length)} selected for archiving`}</Text>

            <View row wrap="wrap" className={css.controls}>
              <Button
                text="Select Smaller Copies on Page"
                icon="SelectAll"
                onClick={store.selectSmallerCopies}
                disabled={!canReview || store.isPageLoading}
              />

              <Button
                text="Clear Selection"
                onClick={handleDeselectAll}
                disabled={store.isArchiving || !store.selectedIds.length}
              />
            </View>
          </View>
        )}

        {store.isPageLoading && (
          <ProgressBar variant="indeterminate" viewProps={{ flex: "none" }} />
        )}

        {!store.pairs.length && !store.isPageLoading && (
          <View column flex="none" align="center" padding={{ all: "2rem 1rem" }} spacing="0.5rem">
            <Text bold whiteSpace="normal">
              {store.isScanning
                ? "Matches will appear here as they are found"
                : store.status === "idle"
                  ? "Find copies, then review them side by side"
                  : "No verified matches to show"}
            </Text>

            <Text
              color={colors.custom.lightGrey}
              fontSize="0.85em"
              whiteSpace="normal"
              textAlign="center"
            >
              {store.status === "idle"
                ? "Choose a matching threshold and start the search. Nothing is archived automatically."
                : store.skipped
                  ? "Some images are missing from the similarity index. Index them in Settings → Repair, then search again."
                  : "Only candidates that pass the original-image comparison appear here."}
            </Text>
          </View>
        )}

        {store.pairs.map((pair) => (
          <Card
            key={pair.copy.id}
            flex="none"
            minWidth={0}
            padding={{ all: "1rem" }}
            spacing="0.75rem"
          >
            <View row wrap="wrap" align="center" justify="space-between" className={css.controls}>
              <Checkbox
                label={pair.isLowerResolution ? "Archive smaller copy" : "Archive variant"}
                checked={store.selectedIds.includes(pair.copy.id)}
                disabled={!canReview || !pair.canArchive}
                setChecked={() => store.toggleSelected(pair.copy.id)}
              />

              <Text whiteSpace="normal">{`${pair.score.toFixed(2)}% matching area`}</Text>
            </View>

            <View display="grid" minWidth={0} className={css.comparison}>
              {[pair.copy, pair.retained].map((file, index) => (
                <View key={file.id} column minWidth={0} spacing="0.5rem">
                  <Text bold whiteSpace="normal">
                    {index === 0 ? "Copy" : "Keep"}
                  </Text>

                  <FileBase.Container
                    height="13rem"
                    onDoubleClick={() =>
                      openCarouselWindow({
                        file,
                        selectedFileIds: [pair.copy.id, pair.retained.id],
                      })
                    }
                  >
                    <FileBase.Image
                      thumb={file.thumb}
                      fileId={file.id}
                      title={file.originalName}
                      fit="contain"
                      height="13rem"
                    />
                  </FileBase.Container>

                  <Text
                    fontSize="0.85em"
                    whiteSpace="normal"
                  >{`${file.width} × ${file.height} · ${Fmt.bytes(file.size)}`}</Text>

                  <Text
                    color={colors.custom.lightGrey}
                    fontSize="0.85em"
                    whiteSpace="normal"
                    overflowWrap="anywhere"
                  >
                    {file.originalName}
                  </Text>
                </View>
              ))}
            </View>

            {!pair.canArchive && (
              <Text color={colors.custom.orange} fontSize="0.85em" whiteSpace="normal">
                {"This copy is also a reference for another match and must be kept."}
              </Text>
            )}
          </Card>
        ))}
      </Modal.Content>

      {!!store.pageCount && (
        <Pagination inline count={store.pageCount} page={store.page} onChange={handlePageChange} />
      )}

      <Modal.Footer uniformWidth="auto" wrap="wrap" className={css.controls}>
        {(store.isScanning || store.isArchiving) && (
          <Button
            text={
              store.cancelRequested
                ? "Stopping…"
                : store.isArchiving
                  ? "Stop Archiving"
                  : "Pause Search"
            }
            icon="Pause"
            onClick={store.pause}
            disabled={store.cancelRequested}
          />
        )}

        {!!store.found && (
          <Button
            text={
              store.isArchiving
                ? "Archiving…"
                : `Archive ${Fmt.commas(store.selectedIds.length)} Selected`
            }
            icon="Archive"
            onClick={store.archive}
            disabled={!canReview || store.isPageLoading || !store.selectedIds.length}
          />
        )}

        <Button
          text={store.isScanning ? "Run in Background" : "Close"}
          icon="Close"
          onClick={store.close}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  actions: { gap: "0.75rem" },
  comparison: {
    gap: "1rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
  },
  controls: { gap: "0.5rem" },
  stats: { gap: "0.5rem 1.5rem" },
});
