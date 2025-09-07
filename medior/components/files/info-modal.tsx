import { shell } from "@electron/remote";
import path from "path";
import {
  Button,
  Card,
  Comp,
  DateDetail,
  Detail,
  Icon,
  IdButton,
  Modal,
  TagRow,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { duration, formatBytes, round } from "medior/utils/common";

export const InfoModal = Comp(() => {
  const stores = useStores();

  const file = stores.collection.editor.isOpen
    ? stores.collection.editor.getFileById(stores.file.activeFileId)
    : stores.file.getById(stores.file.activeFileId);

  const handleClose = () => stores.file.setIsInfoModalOpen(false);

  const handleRefresh = () => stores.file.refreshFiles({ ids: [file.id] });

  const openFileLocation = () => shell.showItemInFolder(file.path);

  const openThumbLocation = () => shell.showItemInFolder(file.thumb.path);

  return (
    <Modal.Container width="100%" maxWidth="50rem" onClose={handleClose}>
      <Modal.Header
        leftNode={<IdButton value={stores.file.activeFileId} />}
        rightNode={
          file.isCorrupted && (
            <View row justify="center" spacing="0.5rem">
              <Icon name="WarningRounded" color={colors.custom.orange} />

              <Text preset="title" color={colors.custom.orange}>
                {"Corrupted"}
              </Text>
            </View>
          )
        }
      >
        <Text preset="title">{"File Info"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
        <UniformList row>
          <View column>
            <Detail label="Extension" value={file?.ext} />

            <Detail label="Size" value={formatBytes(file?.size)} tooltip={file?.size} />

            <Detail
              label="Dimensions"
              value={`${file?.width} x ${file?.height}`}
              valueProps={{
                tooltip: (
                  <UniformList row>
                    <Detail label="Width" value={file?.width} />
                    <Detail label="Height" value={file?.height} />
                  </UniformList>
                ),
              }}
            />
          </View>

          <View column>
            <Detail label="Duration" value={duration(file?.duration)} />

            <Detail label="FPS" value={file?.frameRate ? round(file.frameRate) : null} />
          </View>

          <View column>
            <Detail label="Video Codec" value={file?.videoCodec} />

            <Detail label="Audio Codec" value={file?.audioCodec} />
          </View>

          <View column>
            <Detail
              label="Video Bitrate"
              value={file?.bitrate ? `${formatBytes(file.bitrate)}/s` : null}
            />

            <Detail
              label="Audio Bitrate"
              value={file?.audioBitrate ? `${formatBytes(file.audioBitrate)}/s` : null}
            />
          </View>
        </UniformList>

        <View row spacing="0.5rem">
          <Detail label="Original File Name" value={file?.originalName} withTooltip />
        </View>

        <Detail
          label="Original Folder"
          value={file?.originalPath ? path.dirname(file.originalPath) : null}
          withTooltip
        />

        <Detail
          label="File Path"
          value={file?.path}
          tooltip={
            <View column spacing="0.5rem">
              {file?.path ? <Button text="Open File in Folder" onClick={openFileLocation} /> : null}
              {file?.thumb?.path ? (
                <Button text="Open Thumb in Folder" onClick={openThumbLocation} />
              ) : null}
            </View>
          }
        />

        <UniformList row>
          <Detail
            label="Hash"
            value={file?.hash}
            tooltip={<Detail label="Original Hash" value={file?.originalHash} />}
          />
        </UniformList>

        <UniformList row>
          <DateDetail label="Date Created" value={file?.dateCreated} />
          <DateDetail label="Date Modified" value={file?.dateModified} />
        </UniformList>

        {file?.tags?.length > 0 && <Detail label="Tags" value={<TagRow tags={file.tags} />} />}

        {file?.diffusionParams?.length > 0 && (
          <Detail
            label="Diffusion Params"
            value={
              <Card>
                <Text>{file.diffusionParams}</Text>
              </Card>
            }
          />
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button
          text="Refresh"
          icon="Refresh"
          onClick={handleRefresh}
          colorOnHover={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
