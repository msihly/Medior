import { useRef, useState } from "react";
import { observer, useStores } from "medior/store";
import { CircularProgress } from "@mui/material";
import { Button, Card, Checkbox, Modal, Text, UniformList, View } from "medior/components";
import { colors, dayjs, getVideoInfo, makeQueue, PromiseQueue, trpc } from "medior/utils";

export const RepairModal = observer(() => {
  const stores = useStores();

  const [isCollTagsChecked, setIsCollTagsChecked] = useState(false);
  const [isFileTagsChecked, setIsFileTagsChecked] = useState(false);
  const [isFileThumbsChecked, setIsFileThumbsChecked] = useState(false);
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

  const handleCancel = async () => {};

  const handleStart = async () => {
    try {
      setIsRepairing(true);

      if (isFileThumbsChecked) {
        log("Checking files with broken thumbnails...");
        const thumbsRes = await trpc.listFilesWithBrokenThumbs.mutate();
        if (!thumbsRes.success) throw new Error(thumbsRes.error);
        const fileIds = thumbsRes.data;
        log(`Found ${fileIds.length} files with broken thumbnails.`);

        const refreshRes = await stores.file.refreshFiles({ ids: fileIds });
        if (!refreshRes.success) throw new Error(refreshRes.error);
        log(`Refreshed files.`);
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
                label="Broken File Thumbnails"
                checked={isFileThumbsChecked}
                setChecked={setIsFileThumbsChecked}
                disabled={true || isRepairing} // Disabled due to intensity of scanning massive storge locations
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
                disabled={isRepairing}
              />

              {/* TODO: Implement */}
              <Checkbox
                label="Collection Tags"
                checked={isCollTagsChecked}
                setChecked={setIsCollTagsChecked}
                disabled={isRepairing}
              />
            </View>

            <View column>
              {/* TODO: Implement */}
              <Checkbox
                label="Tag Counts"
                checked={isTagCountsChecked}
                setChecked={setIsTagCountsChecked}
                disabled={isRepairing}
              />

              {/* TODO: Implement */}
              <Checkbox
                label="Tag Relations"
                checked={isTagRelationsChecked}
                setChecked={setIsTagRelationsChecked}
                disabled={isRepairing}
              />
            </View>
          </UniformList>
        </Card>

        <Card height="100%" overflow="hidden" spacing="1rem">
          <Text preset="title">{"Output"}</Text>

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
