import { shell } from "@electron/remote";
import { useEffect } from "react";
import { CircularProgress } from "@mui/material";
import {
  Button,
  CenteredText,
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
import { colors, deleteFile, toast } from "medior/utils/client";
import { dayjs, formatBytes, round } from "medior/utils/common";

export const ReencoderModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.reencoder;

  useEffect(() => {
    (async () => {
      await store.loadFile();
      await store.run();
    })();
  }, []);

  const handleClose = async () => {
    if (store.isRunning) store.aborter.abort("Cancelled");
    else if (store.newPath) {
      toast.error("Deleting re-encoded file...");
      await deleteFile(store.newPath);
    }
    store.setIsOpen(false);
  };

  const handleReplace = () => store.replaceOriginal();

  const openFile = () => shell.openPath(store.newPath);

  const openLocation = () => shell.showItemInFolder(store.newPath);

  return (
    <Modal.Container
      height="100%"
      width="100%"
      maxHeight="30rem"
      maxWidth="35rem"
      onClose={handleClose}
    >
      <Modal.Header leftNode={<IdButton value={store.fileId} />}>
        <Text preset="title">{"Re-Encoder"}</Text>
      </Modal.Header>

      <Modal.Content justify="center" align="center" spacing="0.5rem">
        {!store.progress ? (
          <CircularProgress color="inherit" size="10rem" />
        ) : (
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

            <UniformList column uniformWidth="7rem" spacing="0.5rem">
              <Detail label="FPS" value={store.progress.fps} />

              <Detail label="Kb/s" value={store.progress.kbps} />

              <Detail label="Size" value={formatBytes(store.progress.size)} />

              <Detail label="Original" value={formatBytes(store.file.size)} />

              <Detail label="Ratio" value={`${round(store.file.size / store.progress.size)}x`} />
            </UniformList>
          </View>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Cancel"
          icon="Close"
          onClick={handleClose}
          disabled={store.isLoading}
          colorOnHover={colors.custom.red}
        />

        <Button text="Play" icon="PlayArrow" onClick={openFile} disabled={!store.newPath} />

        <Button text="Folder" icon="Folder" onClick={openLocation} disabled={!store.newPath} />

        <Button
          text="Replace"
          icon="Refresh"
          onClick={handleReplace}
          disabled={store.isRunning || store.isLoading || !store.newPath}
          color={colors.custom.green}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
