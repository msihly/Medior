import { useEffect, useRef, useState } from "react";
import { ScanFileStorageOutput, SocketEvents } from "medior/_generated/server";
import type {
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
  ProgressCircle,
  RepairCheckbox,
  Text,
  UniformList,
  View,
  ViewProps,
} from "medior/components";
import { filePathsToImports, useStores } from "medior/store";
import { colors, CssColor } from "medior/utils/client";
import { chunkArray, Fmt, sleep } from "medior/utils/common";
import { socket, trpc } from "medior/utils/server";

const SIMILARITY_PROGRESS_TIME_INTERVAL_MS = 30_000;
const checkboxColumnProps: ViewProps = {
  column: true,
  margins: { left: "1rem" },
  spacing: "0.5rem",
};

export const RepairModal = Comp(() => {
  const stores = useStores();
  const store = stores.home.settings.repair;

  const outputRef = useRef<HTMLDivElement>(null);

  const [storageResult, setStorageResult] = useState<Awaited<ScanFileStorageOutput>["data"]>(null);

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
          (args.message.startsWith("Tag repair:") ||
            args.message.startsWith("Storage scan:") ||
            args.message.startsWith("Downloading transcription model:") ||
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

    const startRes = await trpc.startSimilarityBackfill.mutate({ repairId: store.repairId });

    if (!startRes.success) throw new Error(startRes.error);

    store.similarity.setJobId(startRes.data.jobId);

    let lastLoggedProgress:
      | {
          decodeDiagnostics: SimilarityDecodeDiagnostics;
          errorCount: number;
          index: number;
          indexedCount: number;
          missingFileCount: number;
          missingThumbCount: number;
          skippedFreshCount: number;
          timings: {
            decodeMs: number;
            existingRowsMs: number;
            inferenceMs: number;
            writeMs: number;
          };
          unsupportedFileTypeCount: number;
        }
      | undefined;

    let lastMessage = "";
    let lastProgressLogAt = 0;

    while (store.similarity.jobId) {
      if (store.isCancellationRequested) throw new Error("Repair cancelled by user.");

      const res = await trpc.getSimilarityBackfillProgress.mutate({
        jobId: store.similarity.jobId,
      });

      if (!res.success) throw new Error(res.error);

      const progress = res.data;
      const now = Date.now();
      const isTerminal = ["cancelled", "complete", "error"].includes(progress.status);
      const shouldLogProgress =
        !lastLoggedProgress ||
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
              errorCount: progress.errorCount - lastLoggedProgress.errorCount,
              existingRowsMs:
                progress.timings.existingRowsMs - lastLoggedProgress.timings.existingRowsMs,
              indexedCount: progress.indexedCount - lastLoggedProgress.indexedCount,
              inferenceMs: progress.timings.inferenceMs - lastLoggedProgress.timings.inferenceMs,
              missingFileCount: progress.missingFileCount - lastLoggedProgress.missingFileCount,
              missingThumbCount: progress.missingThumbCount - lastLoggedProgress.missingThumbCount,
              processedCount: progress.index - lastLoggedProgress.index,
              skippedFreshCount: progress.skippedFreshCount - lastLoggedProgress.skippedFreshCount,
              unsupportedFileTypeCount:
                progress.unsupportedFileTypeCount - lastLoggedProgress.unsupportedFileTypeCount,
              writeMs: progress.timings.writeMs - lastLoggedProgress.timings.writeMs,
            }
          : {
              decodeDiagnostics: progress.decodeDiagnostics,
              decodeMs: progress.timings.decodeMs,
              errorCount: progress.errorCount,
              existingRowsMs: progress.timings.existingRowsMs,
              indexedCount: progress.indexedCount,
              inferenceMs: progress.timings.inferenceMs,
              missingFileCount: progress.missingFileCount,
              missingThumbCount: progress.missingThumbCount,
              processedCount: progress.index,
              skippedFreshCount: progress.skippedFreshCount,
              unsupportedFileTypeCount: progress.unsupportedFileTypeCount,
              writeMs: progress.timings.writeMs,
            };

        store.log(
          [
            `Similarity index: ${formatProgress(progress)}`,
            `stage: ${progress.stage}`,
            ...(progress.stage === "ordering"
              ? [
                  `ordering NTFS file IDs ${progress.orderingIndex.toLocaleString()} / ${progress.orderingTotal.toLocaleString()} thumbnails`,
                ]
              : []),
            [
              `+${delta.processedCount.toLocaleString()} processed`,
              `+${delta.indexedCount.toLocaleString()} vectors generated`,
              `+${delta.skippedFreshCount.toLocaleString()} already current`,
              `+${delta.errorCount.toLocaleString()} failed`,
              `+${delta.missingFileCount.toLocaleString()} missing files`,
              `+${delta.missingThumbCount.toLocaleString()} missing thumbnail paths`,
              `+${delta.unsupportedFileTypeCount.toLocaleString()} unsupported`,
            ].join(", "),
            formatDecodeDiagnostics(delta.decodeDiagnostics),
            [
              `decode ${(delta.decodeMs / 1000).toFixed(1)}s`,
              `inference ${(delta.inferenceMs / 1000).toFixed(1)}s`,
              `lookup ${(delta.existingRowsMs / 1000).toFixed(1)}s`,
              `write ${(delta.writeMs / 1000).toFixed(1)}s`,
            ].join(", "),
          ].join(" | "),
          colors.custom.lightBlue,
        );

        lastLoggedProgress = {
          decodeDiagnostics: { ...progress.decodeDiagnostics },
          errorCount: progress.errorCount,
          index: progress.index,
          indexedCount: progress.indexedCount,
          missingFileCount: progress.missingFileCount,
          missingThumbCount: progress.missingThumbCount,
          skippedFreshCount: progress.skippedFreshCount,
          timings: {
            decodeMs: progress.timings.decodeMs,
            existingRowsMs: progress.timings.existingRowsMs,
            inferenceMs: progress.timings.inferenceMs,
            writeMs: progress.timings.writeMs,
          },
          unsupportedFileTypeCount: progress.unsupportedFileTypeCount,
        };
        lastProgressLogAt = now;
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
          `Similarity repair complete: ${formatProgress(progress)}. Generated ${progress.indexedCount.toLocaleString()} vectors; ${progress.skippedFreshCount.toLocaleString()} already current; ${progress.errorCount.toLocaleString()} failed.`,
          progress.errorCount ? colors.custom.orange : colors.custom.green,
        );
        break;
      }

      await sleep(1000);
    }

    store.similarity.setJobId(null);
  };

  const buildSimilaritySearchIndex = async () => {
    const startRes = await trpc.startSimilaritySearchIndexBuild.mutate({
      repairId: store.repairId,
    });

    if (!startRes.success) throw new Error(startRes.error);

    store.log(
      startRes.data.isUpdate
        ? "Compacting stored vectors and adding newly vectorized files to the similarity search index..."
        : "Compacting stored vectors, then building the similarity search index over them...",
      colors.custom.lightBlue,
    );

    while (true) {
      if (store.isCancellationRequested) throw new Error("Repair cancelled by user.");

      const res = await trpc.getSimilaritySearchIndexStatus.mutate();

      if (!res.success) throw new Error(res.error);

      if (res.data.status === "error") throw new Error(res.data.error);

      if (res.data.status === "cancelled") throw new Error("Repair cancelled");

      if (res.data.status === "idle")
        throw new Error("The similarity search index build was interrupted. Start it again.");

      if (res.data.status === "complete") {
        store.log(
          `Similarity search index ready: ${Fmt.commas(res.data.indexedRowCount)} vectors indexed.`,
          colors.custom.green,
        );
        break;
      }

      store.log(
        [
          `Similarity search index: ${res.data.message || (res.data.isUpdate ? "updating" : "preparing")}`,
          res.data.percent === null ? null : `${res.data.percent.toFixed(1)}% of this step`,
          `${Math.round((Date.now() - res.data.startedAt) / 1000)}s elapsed`,
        ]
          .filter(Boolean)
          .join(" · "),
        colors.custom.lightBlue,
        true,
      );

      await sleep(2000);
    }
  };

  const runRepair = async (action: (repairId: string) => Promise<void>, clearLog = false) => {
    if (store.isRunning) return;

    const repairId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let failure: string;

    store.setRepairId(repairId);
    store.setIsCancellationRequested(false);

    if (clearLog) store.setOutputLog([]);

    try {
      store.setIsRunning(true);

      const startRes = await trpc.startRepair.mutate({ repairId });

      if (!startRes.success) throw new Error(startRes.error);

      await action(repairId);
    } catch (error) {
      failure = error.message;
      console.error(error);

      if (store.isCancellationRequested)
        store.log("[CANCELLED] Repair cancelled by user.", colors.custom.orange);
      else store.log(`[ERROR] Repair stopped: ${error.message}`, colors.custom.red);
    } finally {
      try {
        const result = await trpc.finishRepair.mutate({ error: failure, repairId });

        if (!result.success) throw new Error(result.error);
      } catch (error) {
        store.log(`[ERROR] Could not save repair status: ${error.message}`, colors.custom.red);
      } finally {
        store.similarity.setJobId(null);
        store.setIsRunning(false);
      }
    }
  };

  const handleDeleteUntrackedFiles = () =>
    runRepair(async (repairId) => {
      for (const paths of chunkArray(storageResult.filesLeftInStorageOnly, 200)) {
        if (store.isCancellationRequested) throw new Error("Repair cancelled.");

        const result = await trpc.deleteUntrackedStorageFiles.mutate({ paths, repairId });

        if (!result.success) throw new Error(result.error);

        const removed = new Set(result.data.removedPaths);

        setStorageResult((previous) => ({
          ...previous,
          filesLeftInStorageOnly: previous.filesLeftInStorageOnly.filter(
            (file) => !removed.has(file),
          ),
        }));
        store.log(
          `[INFO] Removed ${Fmt.commas(removed.size)} untracked files; retained ${Fmt.commas(result.data.retainedCount)} files.`,
        );
      }
    });

  const handleReimportUntrackedFiles = () =>
    runRepair(async () => {
      const paths = storageResult.filesLeftInStorageOnly;
      const queuedPaths = new Set<string>();

      async function* readImports() {
        for (let offset = 0; offset < paths.length; offset += 200) {
          if (store.isCancellationRequested) throw new Error("Repair cancelled.");

          const imports = await filePathsToImports(paths.slice(offset, offset + 200), {
            isCancelled: () => store.isCancellationRequested,
          });

          for (const entry of imports) {
            queuedPaths.add(entry.path);

            yield entry;
          }
        }
      }

      const result = await stores.import.manager.uploadImportBatch({
        imports: readImports(),
        isCancelled: () => store.isCancellationRequested,
        onProgress: (count) =>
          store.log(
            `[INFO] Preparing ${Fmt.commas(count)} files for re-import.`,
            colors.custom.lightBlue,
            true,
          ),
        options: {
          deleteOnImport: false,
          ignorePrevDeleted: false,
          rootFolderPath: stores.import.ingester.rootFolder,
        },
      });

      if (!result.success) throw new Error(result.error);

      if (result.data.count) {
        setStorageResult((previous) => ({
          ...previous,
          filesLeftInStorageOnly: previous.filesLeftInStorageOnly.filter(
            (file) => !queuedPaths.has(file),
          ),
        }));
        stores.import.manager.runImporter();
        store.log(
          `[INFO] ${Fmt.commas(result.data.count)} files queued in one batch. Follow their progress in Import Manager.`,
        );
      }
    });

  const handleRemoveMissingRecords = () =>
    runRepair(async (repairId) => {
      for (const fileIds of chunkArray(storageResult.fileIdsLeftInDbOnly, 200)) {
        if (store.isCancellationRequested) throw new Error("Repair cancelled.");

        const result = await trpc.removeMissingStorageRecords.mutate({ fileIds, repairId });

        if (!result.success) throw new Error(result.error);

        const checkedIds = new Set(fileIds);

        setStorageResult((previous) => ({
          ...previous,
          fileIdsLeftInDbOnly: previous.fileIdsLeftInDbOnly.filter((id) => !checkedIds.has(id)),
        }));
        store.log(
          `[INFO] Removed ${Fmt.commas(result.data.removedCount)} missing records; retained ${Fmt.commas(result.data.retainedCount)} records whose files are now present.`,
        );
      }
    });

  const handleStart = () =>
    runRepair(async (repairId) => {
      store.log("[INFO] Starting the selected database repairs.");

      if (store.storage) {
        setStorageResult(null);
        store.log("[INFO] Reconciling storage before the selected repairs.");

        const res = await trpc.scanFileStorage.mutate({ repairId });

        if (!res.success) throw new Error(res.error);

        setStorageResult(res.data);
      }

      if (store.audio.isSelected) {
        store.log("[INFO] Starting missing audio analysis repair.");

        const res = await trpc.repairMissingAudioAnalysis.mutate({
          maxTranscriptionDuration: store.audio.maxDuration,
          repairId,
          repairTranscriptions: store.audio.transcriptions,
          repairWaveforms: store.audio.waveforms,
        });

        if (!res.success) throw new Error(res.error);
      }

      if (store.collections.isSelected) {
        store.log("[INFO] Starting collection repair.");

        const res = await trpc.repairCollections.mutate({
          deleteEmptyCollections: store.collections.deleteEmpty,
          deleteExactDuplicates: store.collections.deleteDuplicates,
          deleteSubsetCollections: store.collections.deleteSubsets,
          repairFileIndexes: store.collections.fileIndexes,
          repairId,
          syncFileMembership: store.collections.fileMembership,
        });

        if (!res.success) throw new Error(res.error);
      }

      if (store.tags.isSelected) {
        store.log("[INFO] Starting tag repair.");

        const res = await trpc.repairTags.mutate({
          cleanNames: store.tags.cleanNames,
          decodeLabels: store.tags.decodeLabels,
          mergeDuplicateLabels: store.tags.mergeDuplicates,
          regenerateMetadata: store.tags.metadata,
          repairHierarchy: store.tags.hierarchy,
          repairId,
        });

        if (!res.success) throw new Error(res.error);
      }

      if (store.thumbnails.enabled && (store.thumbnails.paths || store.thumbnails.missing)) {
        store.log("[INFO] Starting thumbnail repair.");

        const res = await trpc.repairThumbs.mutate({
          repairId,
          repairMissingThumbnails: store.thumbnails.missing,
          repairPaths: store.thumbnails.paths,
        });

        if (!res.success) throw new Error(res.error);
      }

      if (store.thumbnails.enabled && store.thumbnails.ntfsMetadata) {
        store.log("[INFO] Starting thumbnail NTFS metadata repair.");

        const res = await trpc.repairThumbnailNtfsMetadata.mutate({ repairId });

        if (!res.success) throw new Error(res.error);
      }

      if (store.files.isSelected) {
        store.log("[INFO] Starting file extension and codec repair.");

        if (store.files.extensions) {
          const extRes = await trpc.repairFilesWithBrokenExt.mutate({ repairId });

          if (!extRes.success) throw new Error(extRes.error);
        }

        if (store.files.codecs) {
          store.log("[INFO] Starting video codec inspection.");

          const res = await trpc.repairVideoCodecs.mutate({ repairId });

          if (!res.success) throw new Error(res.error);
        }

        if (store.files.originalInfo) {
          store.log("[INFO] Starting missing original video information repair.");

          const missingInfoRes = await trpc.repairFilesWithMissingInfo.mutate({ repairId });

          if (!missingInfoRes.success) throw new Error(missingInfoRes.error);
        }
      }

      if (store.indexes.isSelected) {
        store.log("[INFO] Starting the selected index repairs.");

        const res = await trpc.rebuildIndexes.mutate({
          rebuildExisting: store.indexes.rebuild,
          repairId,
          syncDefinitions: store.indexes.sync,
        });

        if (!res.success) throw new Error(res.error);
      }

      if (store.similarity.enabled) {
        if (store.similarity.vectors) await rebuildSimilarityIndex();

        await buildSimilaritySearchIndex();
      }

      store.log("[SUCCESS] All selected repairs completed successfully.", colors.custom.green);
    }, true);

  return (
    <Modal.Container
      isLoading={stores.home.settings.isLoading}
      onClose={handleCancel}
      height="100%"
      width="100%"
    >
      <Modal.Header>
        <Text preset="title">{"Database Repair"}</Text>
      </Modal.Header>

      <Modal.Content>
        <UniformList row height="100%" spacing="1rem">
          <Card
            header="Select Issues to Repair"
            spacing="0.5rem"
            overflow="hidden auto"
            bgColor={colors.foregroundCard}
          >
            <RepairCheckbox
              label="Storage Reconciliation"
              description="Runs first. Restores verified paths and lists missing records and untracked files for removal or re-import below."
              checked={store.storage}
              setChecked={store.setStorage}
              disabled={store.isRunning}
            />

            <RepairCheckbox
              label="Audio Analysis"
              description="Missing waveform and transcription data for videos with audio."
              checked={store.audio.enabled}
              setChecked={store.audio.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <View row height="35px">
                <RepairCheckbox
                  label="Regenerate Missing Transcriptions"
                  description="Transcribes videos with audio that do not have a transcription."
                  checked={store.audio.transcriptions}
                  setChecked={store.audio.setTranscriptions}
                  disabled={store.isRunning || !store.audio.enabled}
                />

                <NumInput
                  header="Max Length"
                  adornment="hms"
                  value={store.audio.maxDuration}
                  valueDisplay={store.audio.maxDurationDisplay}
                  setValueDisplay={store.audio.setMaxDurationDisplay}
                  disabled={store.isRunning || !store.audio.enabled || !store.audio.transcriptions}
                  minValue={1}
                  width="8rem"
                  dense
                />
              </View>

              <RepairCheckbox
                label="Regenerate Missing Waveforms"
                description="Generates waveforms for videos with audio that do not have one."
                checked={store.audio.waveforms}
                setChecked={store.audio.setWaveforms}
                disabled={store.isRunning || !store.audio.enabled}
              />
            </View>

            <RepairCheckbox
              label="Collections"
              description="Collection cleanup, file ordering, and membership repairs."
              checked={store.collections.enabled}
              setChecked={store.collections.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Delete Empty Collections"
                description="Deletes collections with no files."
                checked={store.collections.deleteEmpty}
                setChecked={store.collections.setDeleteEmpty}
                disabled={store.isRunning || !store.collections.enabled}
              />

              <RepairCheckbox
                label="Delete Exact Duplicates"
                description="Keeps one collection with each identical file set; leaves files intact."
                checked={store.collections.deleteDuplicates}
                setChecked={store.collections.setDeleteDuplicates}
                disabled={store.isRunning || !store.collections.enabled}
              />

              <RepairCheckbox
                label="Delete Subset Collections"
                description="Deletes collections entirely contained in a larger collection; leaves files intact."
                checked={store.collections.deleteSubsets}
                setChecked={store.collections.setDeleteSubsets}
                disabled={store.isRunning || !store.collections.enabled}
              />

              <RepairCheckbox
                label="Repair File Indexes"
                description="Removes invalid or repeated file IDs and closes gaps in file order."
                checked={store.collections.fileIndexes}
                setChecked={store.collections.setFileIndexes}
                disabled={store.isRunning || !store.collections.enabled}
              />

              <RepairCheckbox
                label="Synchronize File Membership"
                description="Rebuilds each file's collection IDs and removes stale memberships."
                checked={store.collections.fileMembership}
                setChecked={store.collections.setFileMembership}
                disabled={store.isRunning || !store.collections.enabled}
              />
            </View>

            <RepairCheckbox
              label="Ext. / Codecs"
              description="File extension and video metadata repairs."
              checked={store.files.enabled}
              setChecked={store.files.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Repair Extensions"
                description="Corrects stored file extensions using the file paths."
                checked={store.files.extensions}
                setChecked={store.files.setExtensions}
                disabled={store.isRunning || !store.files.enabled}
              />

              <RepairCheckbox
                label="Inspect Video Codecs"
                description="Reads missing video metadata and marks unreadable videos as corrupted."
                checked={store.files.codecs}
                setChecked={store.files.setCodecs}
                disabled={store.isRunning || !store.files.enabled}
              />

              <RepairCheckbox
                label="Repair Original Video Info"
                description="Fills missing original bitrate, size, and codec fields from stored metadata."
                checked={store.files.originalInfo}
                setChecked={store.files.setOriginalInfo}
                disabled={store.isRunning || !store.files.enabled}
              />
            </View>

            <RepairCheckbox
              label="Indexes"
              description="Index definition synchronization and rebuilding."
              checked={store.indexes.enabled}
              setChecked={store.indexes.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Synchronize Definitions"
                description="Creates missing indexes and removes obsolete index definitions."
                checked={store.indexes.sync}
                setChecked={store.indexes.setSync}
                disabled={store.isRunning || !store.indexes.enabled}
              />

              <RepairCheckbox
                label="Rebuild Existing Indexes"
                description="Rebuilds indexes; affected data is unavailable during rebuilding."
                checked={store.indexes.rebuild}
                setChecked={store.indexes.setRebuild}
                disabled={store.isRunning || !store.indexes.enabled}
              />
            </View>

            <RepairCheckbox
              label="Similarity Search Index"
              description="Builds the index used to find duplicates across the whole library, or compacts stored vectors and adds newly vectorized files to it."
              checked={store.similarity.enabled}
              setChecked={store.similarity.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Generate Missing Vectors"
                description="Generates similarity vectors for files without one and migrates legacy vectors before indexing."
                checked={store.similarity.vectors}
                setChecked={store.similarity.setVectors}
                disabled={store.isRunning || !store.similarity.enabled}
              />
            </View>

            <RepairCheckbox
              label="Tags"
              description="Tag label, relationship, and cached metadata repairs."
              checked={store.tags.enabled}
              setChecked={store.tags.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Decode Labels"
                description="Replaces encoded HTML entities in tag labels with readable text."
                checked={store.tags.decodeLabels}
                setChecked={store.tags.setDecodeLabels}
                disabled={store.isRunning || !store.tags.enabled}
              />

              <RepairCheckbox
                label="Merge Duplicate Labels and Aliases"
                description="Merges tags with overlapping labels or aliases, ignoring case, then refreshes hierarchy and metadata."
                checked={store.tags.mergeDuplicates}
                setChecked={store.tags.setMergeDuplicates}
                disabled={store.isRunning || !store.tags.enabled}
              />

              <RepairCheckbox
                label="Clean Labels and Aliases"
                description="Replaces underscores with spaces, applies title casing to labels and aliases, then merges overlapping tags."
                checked={store.tags.cleanNames}
                setChecked={store.tags.setCleanNames}
                disabled={store.isRunning || !store.tags.enabled}
              />

              <RepairCheckbox
                label="Repair Hierarchy"
                description="Repairs parent/child relationships and cached ancestors on files and collections."
                checked={store.tags.hierarchy}
                setChecked={store.tags.setHierarchy}
                disabled={store.isRunning || !store.tags.enabled}
              />

              <RepairCheckbox
                label="Regenerate Metadata"
                description="Recalculates tag counts, sizes, and thumbnails."
                checked={store.tags.metadata}
                setChecked={store.tags.setMetadata}
                disabled={store.isRunning || !store.tags.enabled}
              />
            </View>

            <RepairCheckbox
              label="Thumbnails"
              description="Thumbnail files, paths, and NTFS metadata, including affected tag thumbnails."
              checked={store.thumbnails.enabled}
              setChecked={store.thumbnails.setEnabled}
              disabled={store.isRunning}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Repair Paths"
                description="Corrects malformed thumbnail paths and migrates legacy paths."
                checked={store.thumbnails.paths}
                setChecked={store.thumbnails.setPaths}
                disabled={store.isRunning || !store.thumbnails.enabled}
              />

              <RepairCheckbox
                label="Regenerate Missing Thumbnails"
                description="Generates thumbnails for files without thumbnail data."
                checked={store.thumbnails.missing}
                setChecked={store.thumbnails.setMissing}
                disabled={store.isRunning || !store.thumbnails.enabled}
              />

              <RepairCheckbox
                label="Store NTFS Ordering Metadata"
                description="Repairs missing thumbnails and stores their NTFS volume and file IDs for filesystem-aware processing order."
                checked={store.thumbnails.ntfsMetadata}
                setChecked={store.thumbnails.setNtfsMetadata}
                disabled={store.isRunning || !store.thumbnails.enabled}
              />
            </View>
          </Card>

          <View column spacing="1rem">
            {storageResult && (
              <Card
                header="Storage Reconciliation Results"
                flex="none"
                spacing="0.5rem"
                bgColor={colors.foregroundCard}
              >
                <Text whiteSpace="normal">
                  {`Recovered ${Fmt.commas(storageResult.recoveredFiles)} media paths and ${Fmt.commas(storageResult.recoveredThumbs)} thumbnail paths.`}
                </Text>

                <Text whiteSpace="normal">
                  {`${Fmt.commas(storageResult.fileIdsLeftInDbOnly.length)} records with missing originals · ${Fmt.commas(storageResult.filesLeftInStorageOnly.length)} untracked storage files · ${Fmt.commas(storageResult.unresolvedThumbs)} unresolved thumbnails at scan completion`}
                </Text>

                <View column align="flex-start" spacing="0.5rem">
                  <Button
                    text="Remove Missing File Records"
                    icon="Delete"
                    color={colors.custom.red}
                    onClick={handleRemoveMissingRecords}
                    disabled={store.isRunning || !storageResult.fileIdsLeftInDbOnly.length}
                  />

                  <Button
                    text="Delete Untracked Files"
                    icon="Delete"
                    color={colors.custom.red}
                    onClick={handleDeleteUntrackedFiles}
                    disabled={store.isRunning || !storageResult.filesLeftInStorageOnly.length}
                  />

                  <Button
                    text="Re-import Untracked Files"
                    icon="Refresh"
                    onClick={handleReimportUntrackedFiles}
                    disabled={store.isRunning || !storageResult.filesLeftInStorageOnly.length}
                  />
                </View>
              </Card>
            )}

            <Card
              header="Log"
              ref={outputRef}
              flex={1}
              minHeight={0}
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
                  overflowWrap="anywhere"
                  textOverflow="clip"
                  wordBreak="break-word"
                >
                  {log.text}
                </Text>
              ))}

              {store.isRunning && <ProgressCircle color="inherit" variant="indeterminate" />}
            </Card>
          </View>
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
