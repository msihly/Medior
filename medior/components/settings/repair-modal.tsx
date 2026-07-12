import { shell } from "@electron/remote";
import { useRef, useState } from "react";
import { CircularProgress } from "@mui/material";
import {
  Button,
  Card,
  Checkbox,
  Comp,
  ConfirmModal,
  Modal,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor, makeQueue } from "medior/utils/client";
import { dayjs, PromiseQueue, sleep } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { getVideoInfo } from "medior/utils/server/videos";

export const RepairModal = Comp(() => {
  const stores = useStores();

  const [isCollectionsChecked, setIsCollectionsChecked] = useState(false);
  const [isExtAndCodecsChecked, setIsExtAndCodecsChecked] = useState(false);
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isSimilarityChecked, setIsSimilarityChecked] = useState(false);
  const [isTagsChecked, setIsTagsChecked] = useState(false);
  const [isThumbsChecked, setIsThumbsChecked] = useState(false);
  const [outputLog, setOutputLog] = useState<{ color?: CssColor; text: string }[]>([]);

  const isCancelRequestedRef = useRef(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const shouldCloseAfterCancelRef = useRef(false);
  const similarityJobIdRef = useRef<string | null>(null);

  const log = (log: string, color?: CssColor) => {
    setOutputLog((prev) => [
      ...prev,
      { color, text: `[${dayjs().format("HH:mm:ss.SSS")}] ${log}` },
    ]);
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  };

  const assertNotCancelled = () => {
    if (isCancelRequestedRef.current) throw new Error("Repair cancelled");
  };

  const handleCancel = async () => {
    if (isRepairing) setIsConfirmCancelOpen(true);
    else stores.home.settings.setIsRepairOpen(false);
  };

  const handleConfirmCancel = async () => {
    isCancelRequestedRef.current = true;
    shouldCloseAfterCancelRef.current = true;

    if (similarityJobIdRef.current) {
      log("Cancelling similarity index job...", colors.custom.lightBlue);
      const res = await trpc.cancelSimilarityBackfill.mutate({
        jobId: similarityJobIdRef.current,
      });
      if (!res.success) log(`[ERROR] ${res.error}`, colors.custom.red);
      return true;
    }

    log("Cancelling repair after the current operation finishes...", colors.custom.lightBlue);
    return true;
  };

  const handleLogs = () => shell.openPath(process.env["LOGS_PATH"]);

  const rebuildSimilarityIndex = async () => {
    const formatProgress = (progress: any) =>
      `${progress.index.toLocaleString()} / ${progress.total?.toLocaleString() ?? "?"}`;

    log("Starting similarity index job...", colors.custom.lightBlue);
    const startRes = await trpc.startSimilarityBackfill.mutate({});
    if (!startRes.success) throw new Error(startRes.error);

    similarityJobIdRef.current = startRes.data.jobId;
    let lastLoggedProgress:
      | {
          index: number;
          indexedCount: number;
          skippedFreshCount: number;
          timings: { decodeMs: number; inferenceMs: number; writeMs: number };
        }
      | undefined;
    let lastIndex = -1;
    let lastMessage = "";
    let lastProgressLogAt = 0;

    while (similarityJobIdRef.current) {
      assertNotCancelled();
      const res = await trpc.getSimilarityBackfillProgress.mutate({
        jobId: similarityJobIdRef.current,
      });
      if (!res.success) throw new Error(res.error);

      const progress = res.data;
      const now = Date.now();
      const isTerminal = ["cancelled", "complete", "error"].includes(progress.status);
      const shouldLogProgress =
        lastIndex < 0 ||
        progress.index - lastIndex >= 250 ||
        now - lastProgressLogAt >= 30_000 ||
        isTerminal;
      if (shouldLogProgress) {
        const delta = lastLoggedProgress
          ? {
              decodeMs: progress.timings.decodeMs - lastLoggedProgress.timings.decodeMs,
              indexedCount: progress.indexedCount - lastLoggedProgress.indexedCount,
              inferenceMs: progress.timings.inferenceMs - lastLoggedProgress.timings.inferenceMs,
              processedCount: progress.index - lastLoggedProgress.index,
              skippedFreshCount: progress.skippedFreshCount - lastLoggedProgress.skippedFreshCount,
              writeMs: progress.timings.writeMs - lastLoggedProgress.timings.writeMs,
            }
          : {
              decodeMs: progress.timings.decodeMs,
              indexedCount: progress.indexedCount,
              inferenceMs: progress.timings.inferenceMs,
              processedCount: progress.index,
              skippedFreshCount: progress.skippedFreshCount,
              writeMs: progress.timings.writeMs,
            };

        log(
          `Similarity index: ${formatProgress(progress)} | ${progress.stage} | +${delta.processedCount.toLocaleString()} processed, +${delta.indexedCount.toLocaleString()} indexed, +${delta.skippedFreshCount.toLocaleString()} skipped | decode ${(delta.decodeMs / 1000).toFixed(1)}s, inference ${(delta.inferenceMs / 1000).toFixed(1)}s, write ${(delta.writeMs / 1000).toFixed(1)}s`,
          colors.custom.lightBlue,
        );
        lastIndex = progress.index;
        lastLoggedProgress = {
          index: progress.index,
          indexedCount: progress.indexedCount,
          skippedFreshCount: progress.skippedFreshCount,
          timings: {
            decodeMs: progress.timings.decodeMs,
            inferenceMs: progress.timings.inferenceMs,
            writeMs: progress.timings.writeMs,
          },
        };
        lastProgressLogAt = now;
      }

      if (progress.message && progress.message !== lastMessage) {
        log(
          progress.message,
          progress.status === "error" ? colors.custom.red : colors.custom.lightBlue,
        );
        lastMessage = progress.message;
      }

      if (progress.status === "cancelled") throw new Error("Repair cancelled");
      if (progress.status === "error")
        throw new Error(progress.message || "Similarity index failed");
      if (progress.status === "complete") {
        log(
          `Similarity index rebuild complete: ${formatProgress(progress)}. Indexed ${progress.indexedCount.toLocaleString()} and migrated ${progress.migratedCount.toLocaleString()} vectors.`,
          colors.custom.green,
        );
        break;
      }

      await sleep(1000);
    }

    similarityJobIdRef.current = null;
  };

  const handleStart = async () => {
    try {
      isCancelRequestedRef.current = false;
      shouldCloseAfterCancelRef.current = false;
      setIsRepairing(true);

      if (isCollectionsChecked) {
        log("Repairing collections...");
        const res = await trpc.repairCollections.mutate();
        if (!res.success) throw new Error(res.error);
      }

      if (isTagsChecked) {
        log("Repairing tags...");
        const res = await trpc.repairTags.mutate();
        if (!res.success) throw new Error(res.error);
      }

      if (isThumbsChecked) {
        log("Repairing broken thumbnails. See details in logs...");
        const res = await trpc.repairThumbs.mutate();
        if (!res.success) throw new Error(res.error);
        log(
          `Repaired thumbnails for ${res.data.fileCount} files and ${res.data.tagCount} tags.`,
          colors.custom.green,
        );
      }

      if (isExtAndCodecsChecked) {
        log("Repairing incorrect file extensions...");
        const extRes = await trpc.repairFilesWithBrokenExt.mutate();
        if (!extRes.success) throw new Error(extRes.error);
        log(
          `Found and repaired ${extRes.data.filesWithDotPrefixCount} files with legacy extension formats and ${extRes.data.filesWithIncorrectExtCount} files with incorrect extensions.`,
          colors.custom.lightBlue,
        );

        log("Checking files for incomplete video info...");
        const res = await trpc.listVideosWithMissingInfo.mutate();
        if (!res.success) throw new Error(res.error);
        const validVideos = res.data.filter((f) => !f.isCorrupted);
        log(
          `Found ${res.data.length} (${res.data.length - validVideos.length} corrupted) files with incomplete video info.`,
          colors.custom.lightBlue,
        );

        if (!validVideos.length)
          return log("No uncorrupted files with invalid video info.", colors.custom.green);

        await makeQueue({
          action: async (file) => {
            try {
              const info = await getVideoInfo(file.path);
              const res = await trpc.updateFile.mutate({
                args: { id: file.id, updates: { ...info } },
              });
              if (!res.success) throw new Error(res.error);
            } catch (err) {
              const res = await trpc.updateFile.mutate({
                args: { id: file.id, updates: { isCorrupted: true } },
              });
              if (!res.success) throw new Error(res.error);
            }
          },
          items: validVideos,
          logPrefix: "Updated",
          logSuffix: "files",
          queue: new PromiseQueue({ concurrency: 10 }),
        });
        log(`Repaired ${validVideos.length} files with invalid video info.`, colors.custom.green);

        log("Checking and repairing files with missing info...");
        await trpc.repairFilesWithMissingInfo.mutate();
      }

      if (isSimilarityChecked) {
        await rebuildSimilarityIndex();
      }

      log("Done.", colors.custom.green);
    } catch (error) {
      console.error(error);
      if (error.message === "Repair cancelled") log("Repair cancelled.", colors.custom.lightBlue);
      else log(`[ERROR] ${error.message}`, colors.custom.red);
    } finally {
      similarityJobIdRef.current = null;
      setIsRepairing(false);
      if (shouldCloseAfterCancelRef.current) stores.home.settings.setIsRepairOpen(false);
    }
  };

  return (
    <Modal.Container
      isLoading={stores.home.settings.isLoading}
      onClose={handleCancel}
      height="100%"
      width="100%"
      maxWidth="55rem"
    >
      <Modal.Header>
        <Text preset="title">{"Database Repair"}</Text>
      </Modal.Header>

      <Modal.Content overflow="hidden auto" spacing="1rem">
        <Card>
          <Text preset="title">{"Select Issues to Repair"}</Text>

          <UniformList row>
            <View row>
              <Checkbox
                label="Collections"
                checked={isCollectionsChecked}
                setChecked={setIsCollectionsChecked}
                disabled={isRepairing}
              />

              <Checkbox
                label="Ext. / Codecs"
                checked={isExtAndCodecsChecked}
                setChecked={setIsExtAndCodecsChecked}
                disabled={isRepairing}
              />

              <Checkbox
                label="Tags"
                checked={isTagsChecked}
                setChecked={setIsTagsChecked}
                disabled={isRepairing}
              />

              <Checkbox
                label="Thumbnails"
                checked={isThumbsChecked}
                setChecked={setIsThumbsChecked}
                disabled={isRepairing}
              />

              <Checkbox
                label="Similarity Index"
                checked={isSimilarityChecked}
                setChecked={setIsSimilarityChecked}
                disabled={isRepairing}
              />
            </View>
          </UniformList>
        </Card>

        <Card height="100%" overflow="hidden" spacing="1rem">
          <UniformList row align="center" justify="space-between">
            <View />

            <Text preset="title">{"Output"}</Text>

            <View row justify="flex-end">
              <Button text="Logs" icon="List" onClick={handleLogs} color={colors.custom.black} />
            </View>
          </UniformList>

          <Card ref={outputRef} height="100%" bgColor={colors.foregroundCard} overflow="auto">
            {outputLog.map((log, i) => (
              <Text key={i} color={log.color} overflow="unset">
                {log.text}
              </Text>
            ))}

            {isRepairing && <CircularProgress color="inherit" />}
          </Card>
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} />

        <Button
          text="Start"
          icon="PlayArrow"
          onClick={handleStart}
          disabled={isRepairing}
          color={colors.custom.blue}
        />
      </Modal.Footer>

      {isConfirmCancelOpen && (
        <ConfirmModal
          headerText="Cancel Repair"
          subText="Are you sure you want to cancel the active repair? Similarity indexing will stop its worker job."
          confirmText="Cancel Repair"
          setVisible={setIsConfirmCancelOpen}
          onConfirm={handleConfirmCancel}
        />
      )}
    </Modal.Container>
  );
});
