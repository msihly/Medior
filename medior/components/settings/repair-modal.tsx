import { shell } from "@electron/remote";
import { useRef, useState } from "react";
import { CircularProgress } from "@mui/material";
import { Button, Card, Checkbox, Comp, Modal, Text, UniformList, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeQueue } from "medior/utils/client";
import { dayjs, PromiseQueue } from "medior/utils/common";
import { getLogsPath, getVideoInfo, trpc } from "medior/utils/server";

export const RepairModal = Comp(() => {
  const stores = useStores();

  const [isThumbsChecked, setIsThumbsChecked] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isTagsChecked, setIsTagsChecked] = useState(false);
  const [isExtAndCodecsChecked, setIsExtAndCodecsChecked] = useState(false);
  const [outputLog, setOutputLog] = useState<{ color?: string; text: string }[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);

  const log = (log: string, color?: string) => {
    setOutputLog((prev) => [
      ...prev,
      { color, text: `[${dayjs().format("HH:mm:ss.SSS")}] ${log}` },
    ]);
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  };

  const handleCancel = async () => stores.home.settings.setIsRepairOpen(false);

  const handleLogs = () => shell.openPath(getLogsPath());

  const handleStart = async () => {
    try {
      setIsRepairing(true);

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

      log("Done.", colors.custom.green);
    } catch (error) {
      console.error(error);
      log(`[ERROR] ${error.message}`, colors.custom.red);
    } finally {
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
                label="Thumbnails"
                checked={isThumbsChecked}
                setChecked={setIsThumbsChecked}
                disabled={isRepairing}
              />

              <Checkbox
                label="Extensions / Codecs"
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
              <Text key={i} color={log.color}>
                {log.text}
              </Text>
            ))}

            {isRepairing && <CircularProgress color="inherit" />}
          </Card>
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} disabled={isRepairing} />

        <Button
          text="Start"
          icon="PlayArrow"
          onClick={handleStart}
          disabled={isRepairing}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
