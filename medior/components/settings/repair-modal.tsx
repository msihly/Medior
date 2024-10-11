import { shell } from "@electron/remote";
import { useRef, useState } from "react";
import { observer, useStores } from "medior/store";
import { CircularProgress } from "@mui/material";
import { Button, Card, Checkbox, Modal, Text, UniformList, View } from "medior/components";
import {
  colors,
  dayjs,
  getLogsPath,
  getVideoInfo,
  makeQueue,
  PromiseQueue,
  trpc,
} from "medior/utils";

export const RepairModal = observer(() => {
  const stores = useStores();

  const [isCollTagsChecked, setIsCollTagsChecked] = useState(false);
  const [isFileTagsChecked, setIsFileTagsChecked] = useState(false);
  const [isBrokenThumbsChecked, setIsBrokenThumbsChecked] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isTagCountsChecked, setIsTagCountsChecked] = useState(false);
  const [isTagRelationsChecked, setIsTagRelationsChecked] = useState(false);
  const [isVideoCodecsChecked, setIsVideoCodecsChecked] = useState(false);
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

      if (isBrokenThumbsChecked) {
        log("Repairing broken thumbnails. See details in logs...");
        const res = await trpc.repairThumbs.mutate();
        if (!res.success) throw new Error(res.error);
        log(
          `Repaired thumbnails for ${res.data.fileCount} files, ${res.data.collectionCount} collections, and ${res.data.tagCount} tags.`,
          colors.custom.green
        );
      }

      if (isVideoCodecsChecked) {
        log("Checking files with broken video codecs...");
        const codecsRes = await trpc.listFilesWithBrokenVideoCodec.mutate();
        if (!codecsRes.success) throw new Error(codecsRes.error);
        const fileIds = codecsRes.data;
        log(`Found ${fileIds.length} files with broken video codecs.`, colors.custom.lightBlue);

        await makeQueue({
          action: async (item) => {
            const info = await getVideoInfo(item.path);
            const res = await trpc.updateFile.mutate({ id: item.id, videoCodec: info.videoCodec });
            if (!res.success) throw new Error(res.error);
          },
          items: fileIds,
          logPrefix: "Updated",
          logSuffix: "files",
          queue: new PromiseQueue({ concurrency: 10 }),
        });
        log(`Updated video codecs.`, colors.custom.green);
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
            <View column>
              <Checkbox
                label="Broken Thumbnails"
                checked={isBrokenThumbsChecked}
                setChecked={setIsBrokenThumbsChecked}
                disabled={isRepairing}
              />

              <Checkbox
                label="Missing Video Codecs"
                checked={isVideoCodecsChecked}
                setChecked={setIsVideoCodecsChecked}
                disabled={isRepairing}
              />
            </View>

            <View column>
              {/* TODO: Implement */}
              <Checkbox
                label="File Tags"
                checked={isFileTagsChecked}
                setChecked={setIsFileTagsChecked}
                disabled={true || isRepairing}
              />

              {/* TODO: Implement */}
              <Checkbox
                label="Collection Tags"
                checked={isCollTagsChecked}
                setChecked={setIsCollTagsChecked}
                disabled={true || isRepairing}
              />
            </View>

            <View column>
              {/* TODO: Implement */}
              <Checkbox
                label="Tag Counts"
                checked={isTagCountsChecked}
                setChecked={setIsTagCountsChecked}
                disabled={true || isRepairing}
              />

              {/* TODO: Implement */}
              <Checkbox
                label="Tag Relations"
                checked={isTagRelationsChecked}
                setChecked={setIsTagRelationsChecked}
                disabled={true || isRepairing}
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
