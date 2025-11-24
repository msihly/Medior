import { shell } from "@electron/remote";
import { useEffect } from "react";
import { CircularProgress } from "@mui/material";
import {
  Button,
  CenteredText,
  Checkbox,
  Comp,
  Detail,
  Divider,
  IdButton,
  Modal,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, getConfig, toast } from "medior/utils/client";
import { dayjs, formatBytes, round } from "medior/utils/common";

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
      maxHeight="30rem"
      maxWidth="45rem"
      onClose={handleClose}
    >
      <Modal.Header
        leftNode={<IdButton value={store.curFileId} />}
        rightNode={<Text preset="sub-text">{`${store.fileIds.length} in queue`}</Text>}
      >
        <Text preset="title">{store.fnType === "reencode" ? "Re-encoder" : "Remuxer"}</Text>
      </Modal.Header>

      <Modal.Content justify="center" align="center" spacing="0.5rem">
        {!store.progress ? (
          <CircularProgress color="inherit" size="10rem" />
        ) : (
          <View column width="100%">
            <View row width="100%" spacing="2rem">
              <View column position="relative" justify="center" align="center">
                <View column position="absolute">
                  <CenteredText
                    text={`${store.progress.percent.toFixed(2)}%`}
                    color={colors.custom.lightBlue}
                    fontSize="1.5em"
                    fontWeight={600}
                  />

                  <CenteredText text={store.progress.time} color={colors.custom.white} />

                  <CenteredText
                    text={dayjs
                      .duration(store.file.duration, "s")
                      .format("HH:mm:ss.SSS")
                      .substring(0, 11)}
                    color={colors.custom.lightGrey}
                  />
                </View>

                <CircularProgress
                  value={store.progress.percent || 0}
                  variant="determinate"
                  color="inherit"
                  size="20rem"
                />
              </View>

              <Divider orientation="vertical" />

              <View column spacing="1rem">
                <UniformList column spacing="0.5rem">
                  <UniformList row spacing="1rem">
                    <Detail label="Original Codec" value={store.file.videoCodec} />

                    <Detail label="Output Codec" value={outputCodec} />
                  </UniformList>

                  <UniformList row spacing="1rem">
                    <Detail label="Original FPS" value={round(store.file.frameRate)} />

                    <Detail label="Output FPS" value={round(outputFps)} />
                  </UniformList>

                  <UniformList row spacing="1rem">
                    <Detail label="Original Bitrate" value={formatBytes(store.file.bitrate)} />

                    <Detail label="Output Bitrate" value={formatBytes(outputBitrate)} />
                  </UniformList>

                  <UniformList row spacing="1rem">
                    <Detail label="Original Size" value={formatBytes(store.file.size)} />

                    <Detail label="Output Size" value={formatBytes(store.progress.size)} />
                  </UniformList>

                  <UniformList row spacing="1rem">
                    <Detail label="Speed" value={`${formatBytes(store.progress.kbps * 1000)}/s`} />

                    <Detail
                      label="Ratio"
                      value={`${round(store.file.size / store.progress.size)}x`}
                    />
                  </UniformList>
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
        )}
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
