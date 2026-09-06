import { useCallback, useEffect, useRef, useState } from "react";
import { CircularProgress } from "@mui/material";
import { SocketEvents } from "medior/_generated/server";
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
import { dayjs, PromiseQueue } from "medior/utils/common";
import { socket, trpc } from "medior/utils/server";
import { getVideoInfo } from "medior/utils/server/videos";

export const RepairModal = Comp(() => {
  const stores = useStores();

  const [isCollectionsChecked, setIsCollectionsChecked] = useState(false);
  const [isExtAndCodecsChecked, setIsExtAndCodecsChecked] = useState(false);
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false);
  const [isIndexesChecked, setIsIndexesChecked] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isTagsChecked, setIsTagsChecked] = useState(false);
  const [isThumbsChecked, setIsThumbsChecked] = useState(false);
  const [outputLog, setOutputLog] = useState<{ color?: CssColor; text: string }[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);
  const isCancellationRequested = useRef(false);
  const repairIdRef = useRef<string>();

  const log = useCallback((log: string, color?: CssColor) => {
    setOutputLog((prev) => [
      ...prev,
      { color, text: `[${dayjs().format("HH:mm:ss.SSS")}] ${log}` },
    ]);
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
      log(`[${args.status.toUpperCase()}] ${args.message}`, colorsByStatus[args.status]);
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
    log("[INFO] Requesting cancellation. The current operation will stop safely.");
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

      if (isCollectionsChecked) {
        log("[INFO] Starting collection repair.");
        const res = await trpc.repairCollections.mutate({ repairId });
        if (!res.success) throw new Error(res.error);
      }

      if (isTagsChecked) {
        log("[INFO] Starting tag repair.");
        const res = await trpc.repairTags.mutate({ repairId });
        if (!res.success) throw new Error(res.error);
      }

      if (isThumbsChecked) {
        log("[INFO] Starting thumbnail repair.");
        const res = await trpc.repairThumbs.mutate({ repairId });
        if (!res.success) throw new Error(res.error);
      }

      if (isExtAndCodecsChecked) {
        log("[INFO] Starting file extension and codec repair.");
        const extRes = await trpc.repairFilesWithBrokenExt.mutate({ repairId });
        if (!extRes.success) throw new Error(extRes.error);

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

        log("[INFO] Starting missing original video information repair.");
        const missingInfoRes = await trpc.repairFilesWithMissingInfo.mutate({ repairId });
        if (!missingInfoRes.success) throw new Error(missingInfoRes.error);
      }

      if (isIndexesChecked) {
        log(
          "[INFO] Starting index rebuild. Each collection will be unavailable while its indexes are rebuilt, and cancellation takes effect between collections.",
        );
        const res = await trpc.rebuildIndexes.mutate({ repairId });
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
                label="Indexes"
                checked={isIndexesChecked}
                setChecked={setIsIndexesChecked}
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
            </View>
          </UniformList>
        </Card>

        <Card height="100%" overflow="hidden" spacing="1rem">
          <UniformList row align="center" justify="center">
            <Text preset="title">{"Output"}</Text>
          </UniformList>

          <Card ref={outputRef} height="100%" bgColor={colors.foregroundCard} overflow="auto">
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
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} />

        <Button
          text="Start"
          icon="PlayArrow"
          onClick={handleStart}
          disabled={
            isRepairing ||
            (!isCollectionsChecked &&
              !isExtAndCodecsChecked &&
              !isIndexesChecked &&
              !isTagsChecked &&
              !isThumbsChecked)
          }
          color={colors.custom.blue}
        />
      </Modal.Footer>

      {isConfirmCancelOpen && (
        <ConfirmModal
          headerText="Cancel Repair"
          subText="Are you sure you want to cancel the running repair? The current operation will stop at the next safe cancellation point."
          confirmText="Cancel Repair"
          setVisible={setIsConfirmCancelOpen}
          onConfirm={handleConfirmCancel}
        />
      )}
    </Modal.Container>
  );
});
