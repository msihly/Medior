import { useEffect, useRef } from "react";
import { CircularProgress } from "@mui/material";
import { SocketEvents } from "medior/_generated/server";
import {
  SimilarityBackfillProgress,
  SimilarityDecodeDiagnostics,
} from "medior/server/vector-service";
import {
  Button,
  Card,
  Comp,
  ConfirmModal,
  Modal,
  NumInput,
  RepairCheckbox,
  Text,
  UniformList,
  View,
  ViewProps,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor, makeQueue } from "medior/utils/client";
import { PromiseQueue, sleep } from "medior/utils/common";
import { socket, trpc } from "medior/utils/server";
import { getVideoInfo } from "medior/utils/server/videos";

const SIMILARITY_PROGRESS_COUNT_INTERVAL = 250;
const SIMILARITY_PROGRESS_TIME_INTERVAL_MS = 30_000;

const checkboxColumnProps: ViewProps = {
  column: true,
  margins: { left: "1rem" },
  spacing: "0.5rem",
};

export const RepairModal = Comp(() => {
  const stores = useStores();
  const store = stores.home.settings.repair;
  const audio = store.audio;
  const collections = store.collections;
  const files = store.files;
  const indexes = store.indexes;
  const tags = store.tags;
  const thumbnails = store.thumbnails;

  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [store.outputLog]);

  useEffect(() => {
    const onRepairProgress = (args: Parameters<SocketEvents["onRepairProgress"]>[0]) => {
      if (args.repairId !== store.repairId) return;
      const colorsByStatus: Record<typeof args.status, CssColor> = {
        cancelled: colors.custom.orange,
        error: colors.custom.red,
        info: undefined,
        progress: colors.custom.lightBlue,
        success: colors.custom.green,
      };
      store.log(
        `[${args.status.toUpperCase()}] ${args.message}`,
        colorsByStatus[args.status],
        args.status === "progress" &&
          (args.message.startsWith("Downloading transcription model:") ||
            args.message.startsWith("Transcribing audio:")),
      );
    };

    socket.on("onRepairProgress", onRepairProgress);
    return () => socket.off("onRepairProgress", onRepairProgress);
  }, [store]);

  const handleCancel = async () => {
    if (store.isRunning) store.setIsConfirmCancelOpen(true);
    else store.setIsOpen(false);
  };

  const handleConfirmCancel = async () => {
    let isSuccessful = true;
    const repairId = store.repairId;
    store.setIsCancellationRequested(true);
    store.log("[INFO] Cancelling the current operation.");
    if (repairId) {
      const res = await trpc.cancelRepair.mutate({ repairId });
      if (!res.success) {
        isSuccessful = false;
        store.log(`[ERROR] Failed to request repair cancellation: ${res.error}`, colors.custom.red);
      }
    }
    if (store.similarityJobId) {
      const res = await trpc.cancelSimilarityBackfill.mutate({
        jobId: store.similarityJobId,
      });
      if (!res.success) {
        isSuccessful = false;
        store.log(
          `[ERROR] Failed to request similarity cancellation: ${res.error}`,
          colors.custom.red,
        );
      }
    }
    return isSuccessful;
  };

  const rebuildSimilarityIndex = async () => {
    const formatDecodeDiagnostics = (diagnostics: SimilarityDecodeDiagnostics) => {
      const decodedCount = diagnostics.imageCount + diagnostics.videoCount;
      const parts = (["image", "video"] as const).map((kind) => {
        const count = diagnostics[`${kind}Count`];

        return [
          `${count.toLocaleString()} ${kind}s`,
          count ? ` @ ${Math.round(diagnostics[`${kind}Ms`] / count)}ms` : "",
        ].join("");
      });

      if (decodedCount && diagnostics.estimatedPixelCount)
        parts.push(
          `~${(diagnostics.estimatedPixelCount / decodedCount / 1_000_000).toFixed(2)} MP/thumb`,
        );

      return parts.join(", ");
    };

    const formatProgress = (progress: SimilarityBackfillProgress) =>
      `${progress.index.toLocaleString()} / ${progress.total?.toLocaleString() ?? "?"}`;

    store.log("Starting similarity index job...", colors.custom.lightBlue);
    const startRes = await trpc.startSimilarityBackfill.mutate({});
    if (!startRes.success) throw new Error(startRes.error);

    store.setSimilarityJobId(startRes.data.jobId);
    let lastLoggedProgress:
      | {
          decodeDiagnostics: SimilarityDecodeDiagnostics;
          index: number;
          indexedCount: number;
          skippedFreshCount: number;
          timings: { decodeMs: number; inferenceMs: number };
        }
      | undefined;
    let lastIndex = -1;
    let lastMessage = "";
    let lastOrderingIndex = 0;
    let lastProgressLogAt = 0;
    let lastStage: SimilarityBackfillProgress["stage"] | undefined;

    while (store.similarityJobId) {
      if (store.isCancellationRequested) throw new Error("Repair cancelled by user.");
      const res = await trpc.getSimilarityBackfillProgress.mutate({
        jobId: store.similarityJobId,
      });
      if (!res.success) throw new Error(res.error);

      const progress = res.data;
      const now = Date.now();
      const isOrderingProgress =
        progress.stage === "ordering" &&
        (lastStage !== "ordering" ||
          progress.orderingIndex - lastOrderingIndex >= SIMILARITY_PROGRESS_COUNT_INTERVAL);
      const isTerminal = ["cancelled", "complete", "error"].includes(progress.status);
      const shouldLogProgress =
        lastIndex < 0 ||
        progress.index - lastIndex >= SIMILARITY_PROGRESS_COUNT_INTERVAL ||
        isOrderingProgress ||
        now - lastProgressLogAt >= SIMILARITY_PROGRESS_TIME_INTERVAL_MS ||
        isTerminal;

      if (shouldLogProgress) {
        const delta = lastLoggedProgress
          ? {
              decodeDiagnostics: {
                estimatedPixelCount:
                  progress.decodeDiagnostics.estimatedPixelCount -
                  lastLoggedProgress.decodeDiagnostics.estimatedPixelCount,
                imageCount:
                  progress.decodeDiagnostics.imageCount -
                  lastLoggedProgress.decodeDiagnostics.imageCount,
                imageMs:
                  progress.decodeDiagnostics.imageMs - lastLoggedProgress.decodeDiagnostics.imageMs,
                videoCount:
                  progress.decodeDiagnostics.videoCount -
                  lastLoggedProgress.decodeDiagnostics.videoCount,
                videoMs:
                  progress.decodeDiagnostics.videoMs - lastLoggedProgress.decodeDiagnostics.videoMs,
              },
              decodeMs: progress.timings.decodeMs - lastLoggedProgress.timings.decodeMs,
              indexedCount: progress.indexedCount - lastLoggedProgress.indexedCount,
              inferenceMs: progress.timings.inferenceMs - lastLoggedProgress.timings.inferenceMs,
              processedCount: progress.index - lastLoggedProgress.index,
              skippedFreshCount: progress.skippedFreshCount - lastLoggedProgress.skippedFreshCount,
            }
          : {
              decodeDiagnostics: progress.decodeDiagnostics,
              decodeMs: progress.timings.decodeMs,
              indexedCount: progress.indexedCount,
              inferenceMs: progress.timings.inferenceMs,
              processedCount: progress.index,
              skippedFreshCount: progress.skippedFreshCount,
            };

        store.log(
          [
            `Similarity index: ${formatProgress(progress)}`,
            ...(progress.stage === "ordering"
              ? [
                  `ordering NTFS file IDs ${progress.orderingIndex.toLocaleString()} / ${progress.orderingTotal.toLocaleString()} thumbnails`,
                ]
              : []),
            [
              `+${delta.processedCount.toLocaleString()} processed`,
              `+${delta.indexedCount.toLocaleString()} indexed`,
              `+${delta.skippedFreshCount.toLocaleString()} skipped`,
            ].join(", "),
            formatDecodeDiagnostics(delta.decodeDiagnostics),
            [
              `decode ${(delta.decodeMs / 1000).toFixed(1)}s`,
              `inference ${(delta.inferenceMs / 1000).toFixed(1)}s`,
            ].join(", "),
          ].join(" | "),
          colors.custom.lightBlue,
        );

        lastIndex = progress.index;
        lastLoggedProgress = {
          decodeDiagnostics: { ...progress.decodeDiagnostics },
          index: progress.index,
          indexedCount: progress.indexedCount,
          skippedFreshCount: progress.skippedFreshCount,
          timings: {
            decodeMs: progress.timings.decodeMs,
            inferenceMs: progress.timings.inferenceMs,
          },
        };
        lastOrderingIndex = progress.orderingIndex;
        lastProgressLogAt = now;
        lastStage = progress.stage;
      }

      if (progress.message && progress.message !== lastMessage) {
        store.log(
          progress.message,
          progress.status === "error" ? colors.custom.red : colors.custom.lightBlue,
        );
        lastMessage = progress.message;
      }

      if (progress.status === "cancelled") throw new Error("Repair cancelled");
      if (progress.status === "error")
        throw new Error(progress.message || "Similarity index failed");
      if (progress.status === "complete") {
        store.log(
          `Similarity index rebuild complete: ${formatProgress(progress)}. Indexed ${progress.indexedCount.toLocaleString()} and migrated ${progress.migratedCount.toLocaleString()} vectors.`,
          colors.custom.green,
        );
        break;
      }

      await sleep(1000);
    }

    store.setSimilarityJobId(null);
  };

  const handleStart = async () => {
    const repairId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    store.setRepairId(repairId);
    store.setIsCancellationRequested(false);
    store.setOutputLog([]);

    try {
      store.setIsRunning(true);
      const startRes = await trpc.startRepair.mutate({ repairId });
      if (!startRes.success) throw new Error(startRes.error);
      store.log("[INFO] Starting the selected database repairs.");

      if (audio.isSelected) {
        store.log("[INFO] Starting missing audio analysis repair.");
        const res = await trpc.repairMissingAudioAnalysis.mutate({
          maxTranscriptionDuration: audio.maxDuration,
          repairId,
          repairTranscriptions: audio.transcriptions,
          repairWaveforms: audio.waveforms,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (collections.isSelected) {
        store.log("[INFO] Starting collection repair.");
        const res = await trpc.repairCollections.mutate({
          deleteEmptyCollections: collections.deleteEmpty,
          deleteExactDuplicates: collections.deleteDuplicates,
          deleteSubsetCollections: collections.deleteSubsets,
          repairFileIndexes: collections.fileIndexes,
          repairId,
          syncFileMembership: collections.fileMembership,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (tags.isSelected) {
        store.log("[INFO] Starting tag repair.");
        const res = await trpc.repairTags.mutate({
          decodeLabels: tags.decodeLabels,
          mergeDuplicateLabels: tags.mergeDuplicates,
          regenerateMetadata: tags.metadata,
          repairHierarchy: tags.hierarchy,
          repairId,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (thumbnails.enabled && (thumbnails.paths || thumbnails.missing)) {
        store.log("[INFO] Starting thumbnail repair.");
        const res = await trpc.repairThumbs.mutate({
          repairId,
          repairMissingThumbnails: thumbnails.missing,
          repairPaths: thumbnails.paths,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (thumbnails.enabled && thumbnails.ntfsMetadata) {
        store.log("[INFO] Starting thumbnail NTFS metadata repair.");
        const res = await trpc.repairThumbnailNtfsMetadata.mutate({ repairId });
        if (!res.success) throw new Error(res.error);
      }

      if (files.isSelected) {
        store.log("[INFO] Starting file extension and codec repair.");
        if (files.extensions) {
          const extRes = await trpc.repairFilesWithBrokenExt.mutate({ repairId });
          if (!extRes.success) throw new Error(extRes.error);
        }

        if (files.codecs) {
          store.log("[INFO] Searching for videos with incomplete codec information.");
          const res = await trpc.listVideosWithMissingInfo.mutate();
          if (!res.success) throw new Error(res.error);
          const validVideos = res.data.filter((f) => !f.isCorrupted);
          store.log(
            `[PROGRESS] Found ${res.data.length} videos with incomplete information; ${validVideos.length} can be inspected and ${res.data.length - validVideos.length} are already marked corrupted.`,
            colors.custom.lightBlue,
          );

          if (validVideos.length) {
            store.log(`[INFO] Reading codec information from ${validVideos.length} video files.`);
            let processedCount = 0;
            let corruptedCount = 0;
            await makeQueue({
              action: async (file) => {
                if (store.isCancellationRequested) return;
                try {
                  const info = await getVideoInfo(file.path);
                  if (store.isCancellationRequested) return;
                  const updateRes = await trpc.updateFile.mutate({
                    args: { id: file.id, updates: { ...info } },
                  });
                  if (!updateRes.success) throw new Error(updateRes.error);
                } catch (error) {
                  corruptedCount++;
                  store.log(
                    `[ERROR] Failed to read codec information for ${file.path}: ${error instanceof Error ? error.message : String(error)}. Marking the file corrupted.`,
                    colors.custom.red,
                  );
                  const updateRes = await trpc.updateFile.mutate({
                    args: { id: file.id, updates: { isCorrupted: true } },
                  });
                  if (!updateRes.success) throw new Error(updateRes.error);
                } finally {
                  processedCount++;
                  if (processedCount % 25 === 0 || processedCount === validVideos.length)
                    store.log(
                      `[PROGRESS] Inspected ${processedCount} / ${validVideos.length} videos; ${corruptedCount} were marked corrupted.`,
                      colors.custom.lightBlue,
                    );
                }
              },
              items: validVideos,
              logPrefix: "Inspected",
              logSuffix: "videos",
              queue: new PromiseQueue({ concurrency: 10 }),
            });
            if (store.isCancellationRequested) throw new Error("Repair cancelled by user.");
            store.log(
              `[SUCCESS] Codec inspection completed: inspected ${processedCount} videos and marked ${corruptedCount} corrupted.`,
              colors.custom.green,
            );
          } else {
            store.log(
              "[SUCCESS] No uncorrupted videos require codec inspection.",
              colors.custom.green,
            );
          }
        }

        if (files.originalInfo) {
          store.log("[INFO] Starting missing original video information repair.");
          const missingInfoRes = await trpc.repairFilesWithMissingInfo.mutate({ repairId });
          if (!missingInfoRes.success) throw new Error(missingInfoRes.error);
        }
      }

      if (indexes.isSelected) {
        store.log("[INFO] Starting the selected index repairs.");
        const res = await trpc.rebuildIndexes.mutate({
          rebuildExisting: indexes.rebuild,
          repairId,
          syncDefinitions: indexes.sync,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (store.similarity) await rebuildSimilarityIndex();

      store.log("[SUCCESS] All selected repairs completed successfully.", colors.custom.green);
    } catch (error) {
      console.error(error);
      if (store.isCancellationRequested)
        store.log("[CANCELLED] Repair cancelled by user.", colors.custom.orange);
      else
        store.log(
          `[ERROR] Repair stopped: ${error instanceof Error ? error.message : String(error)}`,
          colors.custom.red,
        );
    } finally {
      await trpc.finishRepair.mutate({ repairId });
      store.setSimilarityJobId(null);
      store.setIsRunning(false);
    }
  };

  return (
    <Modal.Container
      isLoading={stores.home.settings.isLoading}
      onClose={handleCancel}
      height="100%"
      width="100%"
      maxWidth="60rem"
    >
      <Modal.Header>
        <Text preset="title">{"Database Repair"}</Text>
      </Modal.Header>

      <Modal.Content>
        <UniformList column height="100%" spacing="1rem">
          <Card
            header="Select Issues to Repair"
            spacing="0.5rem"
            overflow="hidden auto"
            bgColor={colors.foregroundCard}
          >
            <RepairCheckbox
              label="Audio Analysis"
              description="Missing waveform and transcription data for videos with audio."
              checked={audio.enabled}
              setChecked={audio.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <View row height="35px">
                <RepairCheckbox
                  label="Regenerate Missing Transcriptions"
                  description="Transcribes videos with audio that do not have a transcription."
                  checked={audio.transcriptions}
                  setChecked={audio.setTranscriptions}
                  disabled={store.isRunning || !audio.enabled}
                />

                <NumInput
                  header="Max Length"
                  adornment="hms"
                  value={audio.maxDuration}
                  valueDisplay={audio.maxDurationDisplay}
                  setValueDisplay={audio.setMaxDurationDisplay}
                  disabled={store.isRunning || !audio.enabled || !audio.transcriptions}
                  minValue={1}
                  width="8rem"
                  dense
                />
              </View>

              <RepairCheckbox
                label="Regenerate Missing Waveforms"
                description="Generates waveforms for videos with audio that do not have one."
                checked={audio.waveforms}
                setChecked={audio.setWaveforms}
                disabled={store.isRunning || !audio.enabled}
              />
            </View>

            <RepairCheckbox
              label="Collections"
              description="Collection cleanup, file ordering, and membership repairs."
              checked={collections.enabled}
              setChecked={collections.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Delete Empty Collections"
                description="Deletes collections with no files."
                checked={collections.deleteEmpty}
                setChecked={collections.setDeleteEmpty}
                disabled={store.isRunning || !collections.enabled}
              />

              <RepairCheckbox
                label="Delete Exact Duplicates"
                description="Keeps one collection with each identical file set; leaves files intact."
                checked={collections.deleteDuplicates}
                setChecked={collections.setDeleteDuplicates}
                disabled={store.isRunning || !collections.enabled}
              />

              <RepairCheckbox
                label="Delete Subset Collections"
                description="Deletes collections entirely contained in a larger collection; leaves files intact."
                checked={collections.deleteSubsets}
                setChecked={collections.setDeleteSubsets}
                disabled={store.isRunning || !collections.enabled}
              />

              <RepairCheckbox
                label="Repair File Indexes"
                description="Removes invalid or repeated file IDs and closes gaps in file order."
                checked={collections.fileIndexes}
                setChecked={collections.setFileIndexes}
                disabled={store.isRunning || !collections.enabled}
              />

              <RepairCheckbox
                label="Synchronize File Membership"
                description="Rebuilds each file's collection IDs and removes stale memberships."
                checked={collections.fileMembership}
                setChecked={collections.setFileMembership}
                disabled={store.isRunning || !collections.enabled}
              />
            </View>

            <RepairCheckbox
              label="Ext. / Codecs"
              description="File extension and video metadata repairs."
              checked={files.enabled}
              setChecked={files.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Repair Extensions"
                description="Corrects stored file extensions using the file paths."
                checked={files.extensions}
                setChecked={files.setExtensions}
                disabled={store.isRunning || !files.enabled}
              />

              <RepairCheckbox
                label="Inspect Video Codecs"
                description="Reads missing video metadata and marks unreadable videos as corrupted."
                checked={files.codecs}
                setChecked={files.setCodecs}
                disabled={store.isRunning || !files.enabled}
              />

              <RepairCheckbox
                label="Repair Original Video Info"
                description="Fills missing original bitrate, size, and codec fields from stored metadata."
                checked={files.originalInfo}
                setChecked={files.setOriginalInfo}
                disabled={store.isRunning || !files.enabled}
              />
            </View>

            <RepairCheckbox
              label="Indexes"
              description="Index definition synchronization and rebuilding."
              checked={indexes.enabled}
              setChecked={indexes.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Synchronize Definitions"
                description="Creates missing indexes and removes obsolete index definitions."
                checked={indexes.sync}
                setChecked={indexes.setSync}
                disabled={store.isRunning || !indexes.enabled}
              />

              <RepairCheckbox
                label="Rebuild Existing Indexes"
                description="Rebuilds indexes; affected data is unavailable during rebuilding."
                checked={indexes.rebuild}
                setChecked={indexes.setRebuild}
                disabled={store.isRunning || !indexes.enabled}
              />
            </View>

            <RepairCheckbox
              label="Similarity Index"
              description="Generates missing similarity vectors and migrates legacy vectors."
              checked={store.similarity}
              setChecked={store.setSimilarity}
              disabled={store.isRunning}
            />

            <RepairCheckbox
              label="Tags"
              description="Tag label, relationship, and cached metadata repairs."
              checked={tags.enabled}
              setChecked={tags.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Decode Labels"
                description="Replaces encoded HTML entities in tag labels with readable text."
                checked={tags.decodeLabels}
                setChecked={tags.setDecodeLabels}
                disabled={store.isRunning || !tags.enabled}
              />

              <RepairCheckbox
                label="Merge Duplicate Labels"
                description="Merges case-insensitive duplicate labels, then refreshes hierarchy and metadata for consistency."
                checked={tags.mergeDuplicates}
                setChecked={tags.setMergeDuplicates}
                disabled={store.isRunning || !tags.enabled}
              />

              <RepairCheckbox
                label="Repair Hierarchy"
                description="Repairs parent/child relationships and cached ancestors on files and collections."
                checked={tags.hierarchy}
                setChecked={tags.setHierarchy}
                disabled={store.isRunning || !tags.enabled}
              />

              <RepairCheckbox
                label="Regenerate Metadata"
                description="Recalculates tag counts, sizes, and thumbnails."
                checked={tags.metadata}
                setChecked={tags.setMetadata}
                disabled={store.isRunning || !tags.enabled}
              />
            </View>

            <RepairCheckbox
              label="Thumbnails"
              description="Thumbnail files, paths, and NTFS metadata, including affected tag thumbnails."
              checked={thumbnails.enabled}
              setChecked={thumbnails.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Repair Paths"
                description="Corrects malformed thumbnail paths and migrates legacy paths."
                checked={thumbnails.paths}
                setChecked={thumbnails.setPaths}
                disabled={store.isRunning || !thumbnails.enabled}
              />

              <RepairCheckbox
                label="Regenerate Missing Thumbnails"
                description="Generates thumbnails for files without thumbnail data."
                checked={thumbnails.missing}
                setChecked={thumbnails.setMissing}
                disabled={store.isRunning || !thumbnails.enabled}
              />

              <RepairCheckbox
                label="Store NTFS Ordering Metadata"
                description="Stores each thumbnail's NTFS volume and file IDs for filesystem-aware processing order."
                checked={thumbnails.ntfsMetadata}
                setChecked={thumbnails.setNtfsMetadata}
                disabled={store.isRunning || !thumbnails.enabled}
              />
            </View>
          </Card>

          <Card
            header="Log"
            ref={outputRef}
            height="100%"
            overflow="hidden auto"
            bgColor={colors.foregroundCard}
          >
            {store.outputLog.map((log, i) => (
              <Text
                key={i}
                color={log.color}
                component="div"
                overflow="visible"
                whiteSpace="pre-wrap"
                width="100%"
                sx={{ overflowWrap: "anywhere", textOverflow: "clip", wordBreak: "break-word" }}
              >
                {log.text}
              </Text>
            ))}

            {store.isRunning && <CircularProgress color="inherit" />}
          </Card>
        </UniformList>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} />

        <Button
          text="Start"
          icon="PlayArrow"
          onClick={handleStart}
          disabled={!store.canStart}
          color={colors.custom.blue}
        />
      </Modal.Footer>

      {store.isConfirmCancelOpen && (
        <ConfirmModal
          headerText="Cancel Repair"
          subText="Are you sure you want to cancel the running repair? The current operation will be interrupted immediately."
          confirmText="Cancel"
          setVisible={store.setIsConfirmCancelOpen}
          onConfirm={handleConfirmCancel}
        />
      )}
    </Modal.Container>
  );
});
