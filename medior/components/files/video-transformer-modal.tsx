import { shell } from "@electron/remote";
import { ReactNode, useEffect } from "react";
import {
  Button,
  CenteredText,
  Checkbox,
  Comp,
  Detail,
  Divider,
  Icon,
  IdButton,
  LoadingOverlay,
  Modal,
  ProgressCircle,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, getConfig, toast } from "medior/utils/client";
import { dayjs, Fmt, round } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export const VideoTransformerModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const config = getConfig();
  const maxBitrate = config.file.reencode.maxBitrate * 1000;
  const maxFps = config.file.reencode.maxFps;
  const outputFps = store.file?.frameRate > maxFps ? maxFps : store.file?.frameRate;
  const outputBitrate = store.file?.bitrate > maxBitrate ? maxBitrate : store.file?.bitrate;
  const outputCodec = config.file.reencode.codec.replace("_nvenc", "");

  useEffect(() => {
    (async () => {
      const res = await trpc.listFile.mutate({ args: { filter: { id: store.fileIds } } });
      if (!res.success) throw new Error(res.error);
      const files = res.data.items;
      const totalSize = files.reduce((acc, f) => acc + f.size, 0);
      store.setInitialTotalSize(totalSize);
      store.setCurTotalSize(totalSize);

      store.setCurFileId(store.fileIds[0]);
      store.setFileIds(store.fileIds.slice(1));
      await store.loadFile();
      await store.run();
    })();
  }, []);

  const handleClose = async () => {
    if (store.isRunning) store.aborter.abort("Cancelled");
    else if (store.newPath) {
      toast.error("Trashing transformed video...");
      await shell.trashItem(store.newPath);
    }
    store.setIsOpen(false);
  };

  const handleReplace = () => store.replaceOriginal();

  const openFileOriginal = () => shell.openPath(store.file.path);

  const openFileOutput = () => shell.openPath(store.newPath);

  const openLocationOriginal = () => shell.showItemInFolder(store.file.path);

  const openLocationOutput = () => shell.showItemInFolder(store.newPath);

  return (
    <Modal.Container
      height="100%"
      width="100%"
      maxHeight="25rem"
      maxWidth="40rem"
      onClose={handleClose}
    >
      <Modal.Header
        leftNode={<IdButton value={store.curFileId} />}
        rightNode={<Text preset="sub-text">{`${store.fileIds.length} in queue`}</Text>}
      >
        <Text preset="title">{store.fnType === "reencode" ? "Re-encoder" : "Remuxer"}</Text>
      </Modal.Header>

      <Modal.Content justify="center" align="center" spacing="0.5rem">
        <LoadingOverlay isLoading={store.isLoading || !store.progress} />

        <View column width="100%">
          <View row width="100%" spacing="2rem">
            <ProgressCircle
              percent={store.progress?.percent || 0}
              color={colors.custom.lightBlue}
              bgColor={colors.custom.darkGrey}
              size="15rem"
            >
              <CenteredText
                text={store.progress ? `${store.progress.percent?.toFixed(2)}%` : "--"}
                color={colors.custom.lightBlue}
                fontSize="1.5em"
                fontWeight={600}
              />

              <CenteredText text={store.progress?.time || "--"} color={colors.custom.white} />

              <CenteredText
                text={
                  store.file
                    ? dayjs
                        .duration(store.file.duration, "s")
                        .format("HH:mm:ss.SSS")
                        .substring(0, 11)
                    : "--"
                }
                color={colors.custom.lightGrey}
              />
            </ProgressCircle>

            <Divider orientation="vertical" />

            <View column spacing="1rem">
              <UniformList column spacing="0.5rem">
                <InputOutputRow
                  label="Total"
                  input={store.initialTotalSize ? Fmt.bytes(store.initialTotalSize) : "--"}
                  output={store.curTotalSize ? Fmt.bytes(store.curTotalSize) : "--"}
                />

                <Divider sx={{ flex: 0 }} />

                <InputOutputRow
                  label="Codec"
                  input={store.file?.videoCodec || "--"}
                  output={outputCodec || "--"}
                />

                <InputOutputRow
                  label="FPS"
                  input={store.file ? round(store.file.frameRate) : "--"}
                  output={outputFps ? round(outputFps) : "--"}
                />

                <InputOutputRow
                  label="Bitrate"
                  input={store.file ? Fmt.bytes(store.file.bitrate) : "--"}
                  output={outputBitrate ? Fmt.bytes(outputBitrate) : "--"}
                />

                <InputOutputRow
                  label="Size"
                  input={store.file ? Fmt.bytes(store.file.size) : "--"}
                  output={store.progress ? Fmt.bytes(store.progress?.size) : "--"}
                />

                <Detail
                  row
                  label="Ratio"
                  labelProps={{ width: "4rem" }}
                  value={
                    store.file && store.progress
                      ? `${round(store.file.size / store.progress?.size)}x`
                      : "--"
                  }
                />
              </UniformList>

              <Checkbox
                label="Auto-Replace"
                checked={store.isAuto}
                setChecked={store.setIsAuto}
                flex="none"
                margins={{ left: "-0.5rem" }}
              />
            </View>
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <View column spacing="0.5rem">
          <Button text="Play: Original" icon="PlayArrow" onClick={openFileOriginal} />

          <Button text="Find: Original" icon="Folder" onClick={openLocationOriginal} />
        </View>

        <View column spacing="0.5rem">
          <Button
            text="Play: Output"
            icon="PlayArrow"
            onClick={openFileOutput}
            disabled={!store.newPath}
          />

          <Button
            text="Find: Output"
            icon="Folder"
            onClick={openLocationOutput}
            disabled={!store.newPath}
          />
        </View>

        <View column spacing="0.5rem">
          <Button
            text="Replace"
            icon="Refresh"
            onClick={handleReplace}
            disabled={store.isRunning || store.isLoading || !store.newPath}
            color={colors.custom.green}
          />

          <Button
            text="Cancel"
            icon="Close"
            onClick={handleClose}
            disabled={store.isLoading}
            colorOnHover={colors.custom.red}
          />
        </View>
      </Modal.Footer>
    </Modal.Container>
  );
});

interface InputOutputRowProps {
  input: ReactNode;
  label: string;
  output: ReactNode;
}

const InputOutputRow = Comp(({ input, label, output }: InputOutputRowProps) => {
  return (
    <Detail
      row
      label={label}
      labelProps={{ width: "4rem" }}
      value={
        <View row spacing="0.5rem">
          <Text>{input}</Text>
          <Icon name="ArrowRightAlt" />
          <Text>{output}</Text>
        </View>
      }
    />
  );
});
