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
import { colors, getIsRemuxable, makeClasses } from "medior/utils/client";
import { duration, formatBytes, round } from "medior/utils/common";

export const InfoModal = Comp(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const file = stores.collection.editor.isOpen
    ? stores.collection.editor.getFileById(stores.file.activeFileId)
    : stores.file.getById(stores.file.activeFileId);
  const isRemuxable = getIsRemuxable(file.ext);

  const handleClose = () => stores.file.setIsInfoModalOpen(false);

  const handleCurrentPath = () => shell.showItemInFolder(file.path);

  const handleRefresh = () => stores.file.refreshFiles({ ids: [file.id] });

  const handleRemux = () => stores.file.refreshFiles({ ids: [file.id], withRemux: true });

  const handleThumbPath = () => shell.showItemInFolder(file.thumb.path);

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

            <Detail label="Video Codec" value={file?.videoCodec} />
          </View>

          <View column>
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
            <Detail label="Bitrate" value={file?.bitrate ? `${formatBytes(file.bitrate)}/s` : null} />
          </View>
        </UniformList>

        <Detail label="Original File Name" value={file?.originalName} withTooltip />

        <Detail
          label="Original Folder"
          value={file?.originalPath ? path.dirname(file.originalPath) : null}
          withTooltip
        />

        <Detail
          label="File Path"
          value={
            file?.path ? (
              <Button
                type="link"
                text={file.path}
                onClick={handleCurrentPath}
                className={css.link}
              />
            ) : null
          }
        />

        <Detail
          label="Thumb Path"
          value={
            file?.thumb?.path ? (
              <Button
                type="link"
                text={file.thumb.path}
                onClick={handleThumbPath}
                className={css.link}
              />
            ) : null
          }
        />

        <UniformList row>
          <Detail label="Hash" value={file?.hash} />
          <Detail label="Original Hash" value={file?.originalHash} />
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

        {isRemuxable && (
          <Button
            text="Remux"
            icon="SwitchVideo"
            onClick={handleRemux}
            colorOnHover={colors.custom.purple}
          />
        )}

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

const useClasses = makeClasses({
  link: {
    alignSelf: "flex-start",
    fontSize: "1em",
    lineHeight: "1.5em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
