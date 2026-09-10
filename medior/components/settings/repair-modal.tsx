import { useCallback, useEffect, useRef, useState } from "react";
import { CircularProgress } from "@mui/material";
import { SocketEvents } from "medior/_generated/server";
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
import { dayjs, durationToSeconds, PromiseQueue } from "medior/utils/common";
import { socket, trpc } from "medior/utils/server";
import { getVideoInfo } from "medior/utils/server/videos";

const MAX_OUTPUT_LOG_LENGTH = 500;

const checkboxColumnProps: ViewProps = {
  column: true,
  spacing: "0.5rem",
  margins: { left: "1rem" },
};

interface RepairLog {
  color?: CssColor;
  isReplaceable?: boolean;
  text: string;
}

export const RepairModal = Comp(() => {
  const stores = useStores();

  const [isAudioAnalysisChecked, setIsAudioAnalysisChecked] = useState(false);
  const [isCollectionsChecked, setIsCollectionsChecked] = useState(false);
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);
  const [isDecodeTagLabelsChecked, setIsDecodeTagLabelsChecked] = useState(true);
  const [isDeleteEmptyCollectionsChecked, setIsDeleteEmptyCollectionsChecked] = useState(true);
  const [isDeleteExactDuplicatesChecked, setIsDeleteExactDuplicatesChecked] = useState(true);
  const [isDeleteSubsetsChecked, setIsDeleteSubsetsChecked] = useState(true);
  const [isExtAndCodecsChecked, setIsExtAndCodecsChecked] = useState(false);
  const [isIndexesChecked, setIsIndexesChecked] = useState(false);
  const [isInspectVideoCodecsChecked, setIsInspectVideoCodecsChecked] = useState(true);
  const [isMergeDuplicateTagLabelsChecked, setIsMergeDuplicateTagLabelsChecked] = useState(true);
  const [isRebuildExistingIndexesChecked, setIsRebuildExistingIndexesChecked] = useState(true);
  const [isRegenerateMissingTranscriptionsChecked, setIsRegenerateMissingTranscriptionsChecked] =
    useState(true);
  const [isRegenerateMissingWaveformsChecked, setIsRegenerateMissingWaveformsChecked] =
    useState(true);
  const [isRegenerateTagMetadataChecked, setIsRegenerateTagMetadataChecked] = useState(true);
  const [isRepairExtensionsChecked, setIsRepairExtensionsChecked] = useState(true);
  const [isRepairFileIndexesChecked, setIsRepairFileIndexesChecked] = useState(true);
  const [isRepairMissingThumbnailsChecked, setIsRepairMissingThumbnailsChecked] = useState(true);
  const [isRepairOriginalVideoInfoChecked, setIsRepairOriginalVideoInfoChecked] = useState(true);
  const [isRepairTagHierarchyChecked, setIsRepairTagHierarchyChecked] = useState(true);
  const [isRepairThumbnailPathsChecked, setIsRepairThumbnailPathsChecked] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isSyncFileMembershipChecked, setIsSyncFileMembershipChecked] = useState(true);
  const [isSyncIndexDefinitionsChecked, setIsSyncIndexDefinitionsChecked] = useState(true);
  const [isTagsChecked, setIsTagsChecked] = useState(false);
  const [isThumbsChecked, setIsThumbsChecked] = useState(false);
  const [maxTranscriptionDurationDisplay, setMaxTranscriptionDurationDisplay] = useState("20m");
  const [outputLog, setOutputLog] = useState<RepairLog[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);
  const isCancellationRequested = useRef(false);
  const repairIdRef = useRef<string>();
  const maxTranscriptionDuration = durationToSeconds(maxTranscriptionDurationDisplay ?? "");

  const log = useCallback((log: string, color?: CssColor, isReplaceable = false) => {
    const entry = {
      color,
      isReplaceable,
      text: `[${dayjs().format("HH:mm:ss.SSS")}] ${log}`,
    };
    setOutputLog((prev) =>
      (isReplaceable && prev[prev.length - 1]?.isReplaceable
        ? [...prev.slice(0, -1), entry]
        : [...prev, entry]
      ).slice(-MAX_OUTPUT_LOG_LENGTH),
    );
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [outputLog]);

  useEffect(() => {
    const onRepairProgress = (args: Parameters<SocketEvents["onRepairProgress"]>[0]) => {
      if (args.repairId !== repairIdRef.current) return;
      const colorsByStatus: Record<typeof args.status, CssColor> = {
        cancelled: colors.custom.orange,
        error: colors.custom.red,
        info: undefined,
        progress: colors.custom.lightBlue,
        success: colors.custom.green,
      };
      log(
        `[${args.status.toUpperCase()}] ${args.message}`,
        colorsByStatus[args.status],
        args.status === "progress" &&
          (args.message.startsWith("Downloading transcription model:") ||
            args.message.startsWith("Transcribing audio:")),
      );
    };

    socket.on("onRepairProgress", onRepairProgress);
    return () => socket.off("onRepairProgress", onRepairProgress);
  }, [log]);

  const handleCancel = async () => {
    if (isRepairing) setIsConfirmCancelOpen(true);
    else stores.home.settings.setIsRepairOpen(false);
  };

  const handleConfirmCancel = async () => {
    const repairId = repairIdRef.current;
    if (!repairId) return false;
    log("[INFO] Cancelling the current operation.");
    const res = await trpc.cancelRepair.mutate({ repairId });
    if (!res.success) {
      log(`[ERROR] Failed to request cancellation: ${res.error}`, colors.custom.red);
      return false;
    }
    isCancellationRequested.current = true;
    return true;
  };

  const handleStart = async () => {
    const repairId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    repairIdRef.current = repairId;
    isCancellationRequested.current = false;
    setOutputLog([]);

    try {
      setIsRepairing(true);
      const startRes = await trpc.startRepair.mutate({ repairId });
      if (!startRes.success) throw new Error(startRes.error);
      log("[INFO] Starting the selected database repairs.");

      if (
        isAudioAnalysisChecked &&
        (isRegenerateMissingTranscriptionsChecked || isRegenerateMissingWaveformsChecked)
      ) {
        log("[INFO] Starting missing audio analysis repair.");
        const res = await trpc.repairMissingAudioAnalysis.mutate({
          maxTranscriptionDuration,
          repairId,
          repairTranscriptions: isRegenerateMissingTranscriptionsChecked,
          repairWaveforms: isRegenerateMissingWaveformsChecked,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (
        isCollectionsChecked &&
        (isDeleteEmptyCollectionsChecked ||
          isDeleteExactDuplicatesChecked ||
          isDeleteSubsetsChecked ||
          isRepairFileIndexesChecked ||
          isSyncFileMembershipChecked)
      ) {
        log("[INFO] Starting collection repair.");
        const res = await trpc.repairCollections.mutate({
          deleteEmptyCollections: isDeleteEmptyCollectionsChecked,
          deleteExactDuplicates: isDeleteExactDuplicatesChecked,
          deleteSubsetCollections: isDeleteSubsetsChecked,
          repairFileIndexes: isRepairFileIndexesChecked,
          repairId,
          syncFileMembership: isSyncFileMembershipChecked,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (
        isTagsChecked &&
        (isDecodeTagLabelsChecked ||
          isMergeDuplicateTagLabelsChecked ||
          isRepairTagHierarchyChecked ||
          isRegenerateTagMetadataChecked)
      ) {
        log("[INFO] Starting tag repair.");
        const res = await trpc.repairTags.mutate({
          decodeLabels: isDecodeTagLabelsChecked,
          mergeDuplicateLabels: isMergeDuplicateTagLabelsChecked,
          regenerateMetadata: isRegenerateTagMetadataChecked,
          repairHierarchy: isRepairTagHierarchyChecked,
          repairId,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (isThumbsChecked && (isRepairThumbnailPathsChecked || isRepairMissingThumbnailsChecked)) {
        log("[INFO] Starting thumbnail repair.");
        const res = await trpc.repairThumbs.mutate({
          repairId,
          repairMissingThumbnails: isRepairMissingThumbnailsChecked,
          repairPaths: isRepairThumbnailPathsChecked,
        });
        if (!res.success) throw new Error(res.error);
      }

      if (
        isExtAndCodecsChecked &&
        (isRepairExtensionsChecked ||
          isInspectVideoCodecsChecked ||
          isRepairOriginalVideoInfoChecked)
      ) {
        log("[INFO] Starting file extension and codec repair.");
        if (isRepairExtensionsChecked) {
          const extRes = await trpc.repairFilesWithBrokenExt.mutate({ repairId });
          if (!extRes.success) throw new Error(extRes.error);
        }

        if (isInspectVideoCodecsChecked) {
          log("[INFO] Searching for videos with incomplete codec information.");
          const res = await trpc.listVideosWithMissingInfo.mutate();
          if (!res.success) throw new Error(res.error);
          const validVideos = res.data.filter((f) => !f.isCorrupted);
          log(
            `[PROGRESS] Found ${res.data.length} videos with incomplete information; ${validVideos.length} can be inspected and ${res.data.length - validVideos.length} are already marked corrupted.`,
            colors.custom.lightBlue,
          );

          if (validVideos.length) {
            log(`[INFO] Reading codec information from ${validVideos.length} video files.`);
            let processedCount = 0;
            let corruptedCount = 0;
            await makeQueue({
              action: async (file) => {
                if (isCancellationRequested.current) return;
                try {
                  const info = await getVideoInfo(file.path);
                  if (isCancellationRequested.current) return;
                  const updateRes = await trpc.updateFile.mutate({
                    args: { id: file.id, updates: { ...info } },
                  });
                  if (!updateRes.success) throw new Error(updateRes.error);
                } catch (error) {
                  corruptedCount++;
                  log(
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
                    log(
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
            if (isCancellationRequested.current) throw new Error("Repair cancelled by user.");
            log(
              `[SUCCESS] Codec inspection completed: inspected ${processedCount} videos and marked ${corruptedCount} corrupted.`,
              colors.custom.green,
            );
          } else {
            log("[SUCCESS] No uncorrupted videos require codec inspection.", colors.custom.green);
          }
        }

        if (isRepairOriginalVideoInfoChecked) {
          log("[INFO] Starting missing original video information repair.");
          const missingInfoRes = await trpc.repairFilesWithMissingInfo.mutate({ repairId });
          if (!missingInfoRes.success) throw new Error(missingInfoRes.error);
        }
      }

      if (isIndexesChecked && (isSyncIndexDefinitionsChecked || isRebuildExistingIndexesChecked)) {
        log("[INFO] Starting the selected index repairs.");
        const res = await trpc.rebuildIndexes.mutate({
          rebuildExisting: isRebuildExistingIndexesChecked,
          repairId,
          syncDefinitions: isSyncIndexDefinitionsChecked,
        });
        if (!res.success) throw new Error(res.error);
      }

      log("[SUCCESS] All selected repairs completed successfully.", colors.custom.green);
    } catch (error) {
      console.error(error);
      if (isCancellationRequested.current)
        log("[CANCELLED] Repair cancelled by user.", colors.custom.orange);
      else
        log(
          `[ERROR] Repair stopped: ${error instanceof Error ? error.message : String(error)}`,
          colors.custom.red,
        );
    } finally {
      await trpc.finishRepair.mutate({ repairId });
      setIsRepairing(false);
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
              checked={isAudioAnalysisChecked}
              setChecked={setIsAudioAnalysisChecked}
              disabled={isRepairing}
            />

            <View {...checkboxColumnProps}>
              <View row height="35px">
                <RepairCheckbox
                  label="Regenerate Missing Transcriptions"
                  description="Transcribes videos with audio that do not have a transcription."
                  checked={isRegenerateMissingTranscriptionsChecked}
                  setChecked={setIsRegenerateMissingTranscriptionsChecked}
                  disabled={isRepairing || !isAudioAnalysisChecked}
                />

                <NumInput
                  header="Max Length"
                  adornment="hms"
                  value={maxTranscriptionDuration}
                  valueDisplay={maxTranscriptionDurationDisplay}
                  setValueDisplay={setMaxTranscriptionDurationDisplay}
                  disabled={
                    isRepairing ||
                    !isAudioAnalysisChecked ||
                    !isRegenerateMissingTranscriptionsChecked
                  }
                  minValue={1}
                  width="8rem"
                  dense
                />
              </View>

              <RepairCheckbox
                label="Regenerate Missing Waveforms"
                description="Generates waveforms for videos with audio that do not have one."
                checked={isRegenerateMissingWaveformsChecked}
                setChecked={setIsRegenerateMissingWaveformsChecked}
                disabled={isRepairing || !isAudioAnalysisChecked}
              />
            </View>

            <RepairCheckbox
              label="Collections"
              description="Collection cleanup, file ordering, and membership repairs."
              checked={isCollectionsChecked}
              setChecked={setIsCollectionsChecked}
              disabled={isRepairing}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Delete Empty Collections"
                description="Deletes collections with no files."
                checked={isDeleteEmptyCollectionsChecked}
                setChecked={setIsDeleteEmptyCollectionsChecked}
                disabled={isRepairing || !isCollectionsChecked}
              />

              <RepairCheckbox
                label="Delete Exact Duplicates"
                description="Keeps one collection with each identical file set; leaves files intact."
                checked={isDeleteExactDuplicatesChecked}
                setChecked={setIsDeleteExactDuplicatesChecked}
                disabled={isRepairing || !isCollectionsChecked}
              />

              <RepairCheckbox
                label="Delete Subset Collections"
                description="Deletes collections entirely contained in a larger collection; leaves files intact."
                checked={isDeleteSubsetsChecked}
                setChecked={setIsDeleteSubsetsChecked}
                disabled={isRepairing || !isCollectionsChecked}
              />

              <RepairCheckbox
                label="Repair File Indexes"
                description="Removes invalid or repeated file IDs and closes gaps in file order."
                checked={isRepairFileIndexesChecked}
                setChecked={setIsRepairFileIndexesChecked}
                disabled={isRepairing || !isCollectionsChecked}
              />

              <RepairCheckbox
                label="Synchronize File Membership"
                description="Rebuilds each file's collection IDs and removes stale memberships."
                checked={isSyncFileMembershipChecked}
                setChecked={setIsSyncFileMembershipChecked}
                disabled={isRepairing || !isCollectionsChecked}
              />
            </View>

            <RepairCheckbox
              label="Ext. / Codecs"
              description="File extension and video metadata repairs."
              checked={isExtAndCodecsChecked}
              setChecked={setIsExtAndCodecsChecked}
              disabled={isRepairing}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Repair Extensions"
                description="Corrects stored file extensions using the file paths."
                checked={isRepairExtensionsChecked}
                setChecked={setIsRepairExtensionsChecked}
                disabled={isRepairing || !isExtAndCodecsChecked}
              />

              <RepairCheckbox
                label="Inspect Video Codecs"
                description="Reads missing video metadata and marks unreadable videos as corrupted."
                checked={isInspectVideoCodecsChecked}
                setChecked={setIsInspectVideoCodecsChecked}
                disabled={isRepairing || !isExtAndCodecsChecked}
              />

              <RepairCheckbox
                label="Repair Original Video Info"
                description="Fills missing original bitrate, size, and codec fields from stored metadata."
                checked={isRepairOriginalVideoInfoChecked}
                setChecked={setIsRepairOriginalVideoInfoChecked}
                disabled={isRepairing || !isExtAndCodecsChecked}
              />
            </View>

            <RepairCheckbox
              label="Indexes"
              description="Index definition synchronization and rebuilding."
              checked={isIndexesChecked}
              setChecked={setIsIndexesChecked}
              disabled={isRepairing}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Synchronize Definitions"
                description="Creates missing indexes and removes obsolete index definitions."
                checked={isSyncIndexDefinitionsChecked}
                setChecked={setIsSyncIndexDefinitionsChecked}
                disabled={isRepairing || !isIndexesChecked}
              />

              <RepairCheckbox
                label="Rebuild Existing Indexes"
                description="Rebuilds indexes; affected data is unavailable during rebuilding."
                checked={isRebuildExistingIndexesChecked}
                setChecked={setIsRebuildExistingIndexesChecked}
                disabled={isRepairing || !isIndexesChecked}
              />
            </View>

            <RepairCheckbox
              label="Tags"
              description="Tag label, relationship, and cached metadata repairs."
              checked={isTagsChecked}
              setChecked={setIsTagsChecked}
              disabled={isRepairing}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Decode Labels"
                description="Replaces encoded HTML entities in tag labels with readable text."
                checked={isDecodeTagLabelsChecked}
                setChecked={setIsDecodeTagLabelsChecked}
                disabled={isRepairing || !isTagsChecked}
              />

              <RepairCheckbox
                label="Merge Duplicate Labels"
                description="Merges case-insensitive duplicate labels, then refreshes hierarchy and metadata for consistency."
                checked={isMergeDuplicateTagLabelsChecked}
                setChecked={setIsMergeDuplicateTagLabelsChecked}
                disabled={isRepairing || !isTagsChecked}
              />

              <RepairCheckbox
                label="Repair Hierarchy"
                description="Repairs parent/child relationships and cached ancestors on files and collections."
                checked={isRepairTagHierarchyChecked}
                setChecked={setIsRepairTagHierarchyChecked}
                disabled={isRepairing || !isTagsChecked}
              />

              <RepairCheckbox
                label="Regenerate Metadata"
                description="Recalculates tag counts, sizes, and thumbnails."
                checked={isRegenerateTagMetadataChecked}
                setChecked={setIsRegenerateTagMetadataChecked}
                disabled={isRepairing || !isTagsChecked}
              />
            </View>

            <RepairCheckbox
              label="Thumbnails"
              description="Thumbnail data and path repairs, including affected tag thumbnails."
              checked={isThumbsChecked}
              setChecked={setIsThumbsChecked}
              disabled={isRepairing}
            />

            <View {...checkboxColumnProps}>
              <RepairCheckbox
                label="Repair Paths"
                description="Corrects malformed thumbnail paths and migrates legacy paths."
                checked={isRepairThumbnailPathsChecked}
                setChecked={setIsRepairThumbnailPathsChecked}
                disabled={isRepairing || !isThumbsChecked}
              />

              <RepairCheckbox
                label="Regenerate Missing Thumbnails"
                description="Generates thumbnails for files without thumbnail data."
                checked={isRepairMissingThumbnailsChecked}
                setChecked={setIsRepairMissingThumbnailsChecked}
                disabled={isRepairing || !isThumbsChecked}
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
            {outputLog.map((log, i) => (
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

            {isRepairing && <CircularProgress color="inherit" />}
          </Card>
        </UniformList>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} />

        <Button
          text="Start"
          icon="PlayArrow"
          onClick={handleStart}
          disabled={
            isRepairing ||
            (isAudioAnalysisChecked &&
              isRegenerateMissingTranscriptionsChecked &&
              !maxTranscriptionDuration) ||
            (!(
              isAudioAnalysisChecked &&
              (isRegenerateMissingTranscriptionsChecked || isRegenerateMissingWaveformsChecked)
            ) &&
              !(
                isCollectionsChecked &&
                (isDeleteEmptyCollectionsChecked ||
                  isDeleteExactDuplicatesChecked ||
                  isDeleteSubsetsChecked ||
                  isRepairFileIndexesChecked ||
                  isSyncFileMembershipChecked)
              ) &&
              !(
                isExtAndCodecsChecked &&
                (isRepairExtensionsChecked ||
                  isInspectVideoCodecsChecked ||
                  isRepairOriginalVideoInfoChecked)
              ) &&
              !(
                isIndexesChecked &&
                (isSyncIndexDefinitionsChecked || isRebuildExistingIndexesChecked)
              ) &&
              !(
                isTagsChecked &&
                (isDecodeTagLabelsChecked ||
                  isMergeDuplicateTagLabelsChecked ||
                  isRepairTagHierarchyChecked ||
                  isRegenerateTagMetadataChecked)
              ) &&
              !(
                isThumbsChecked &&
                (isRepairThumbnailPathsChecked || isRepairMissingThumbnailsChecked)
              ))
          }
          color={colors.custom.blue}
        />
      </Modal.Footer>

      {isConfirmCancelOpen && (
        <ConfirmModal
          headerText="Cancel Repair"
          subText="Are you sure you want to cancel the running repair? The current operation will be interrupted immediately."
          confirmText="Cancel Repair"
          setVisible={setIsConfirmCancelOpen}
          onConfirm={handleConfirmCancel}
        />
      )}
    </Modal.Container>
  );
});
