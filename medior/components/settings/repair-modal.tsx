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

  const [isCollTagsChecked, setIsCollTagsChecked] = useState(false);
  const [isFileTagsChecked, setIsFileTagsChecked] = useState(false);
  const [isBrokenThumbsChecked, setIsBrokenThumbsChecked] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isTagCountsChecked, setIsTagCountsChecked] = useState(false);
  const [isTagRelationsChecked, setIsTagRelationsChecked] = useState(false);
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

      if (isBrokenThumbsChecked) {
        log("Repairing broken thumbnails. See details in logs...");
        const res = await trpc.repairThumbs.mutate();
        if (!res.success) throw new Error(res.error);
        log(
          `Repaired thumbnails for ${res.data.fileCount} files, ${res.data.collectionCount} collections, and ${res.data.tagCount} tags.`,
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

        log("Checking files with incorrect video codecs...");
        const codecsRes = await trpc.listFilesWithBrokenVideoCodec.mutate();
        if (!codecsRes.success) throw new Error(codecsRes.error);
        const codecFiles = codecsRes.data;
        const validCodecFiles = codecFiles.filter((f) => !f.isCorrupted);
        log(
          `Found ${codecFiles.length} (${codecFiles.length - validCodecFiles.length} corrupted) files with incorrect video codecs.`,
          colors.custom.lightBlue,
        );

        if (!validCodecFiles.length)
          return log(
            "No uncorrupted files with incorrect video codecs found.",
            colors.custom.green,
          );

        await makeQueue({
          action: async (file) => {
            let isCorrupted: boolean;
            let videoCodec: string;
            try {
              videoCodec = (await getVideoInfo(file.path)).videoCodec;
            } catch (err) {
              isCorrupted = true;
            }

            const res = await trpc.updateFile.mutate({ id: file.id, isCorrupted, videoCodec });
            if (!res.success) throw new Error(res.error);
          },
          items: validCodecFiles,
          logPrefix: "Updated",
          logSuffix: "files",
          queue: new PromiseQueue({ concurrency: 10 }),
        });
        log(`Repaired ${validCodecFiles.length} incorrect video codecs.`, colors.custom.green);
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
                label="Extensions / Codecs"
                checked={isExtAndCodecsChecked}
                setChecked={setIsExtAndCodecsChecked}
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
