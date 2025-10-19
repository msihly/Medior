import { shell } from "@electron/remote";
import path from "path";
import { useEffect, useState } from "react";
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
import { File, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { duration, formatBytes, round } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export const InfoModal = Comp(() => {
  const stores = useStores();

  const [file, setFile] = useState<File>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadFile();
  }, [stores.file.activeFileId]);

  const handleClose = () => stores.file.setIsInfoModalOpen(false);

  const handleRefresh = async () => {
    await stores.file.refreshFiles({ ids: [file.id] });
    await loadFile();
  };

  const loadFile = async () => {
    try {
      setIsLoading(true);

      const fileRes = await trpc.listFile.mutate({
        args: { filter: { id: stores.file.activeFileId } },
      });
      if (!fileRes.success) throw new Error(fileRes.error);
      const fileSchema = fileRes.data.items[0];

      const tagsRes = await trpc.listTag.mutate({ args: { filter: { id: fileSchema.tagIds } } });
      if (!tagsRes.success) throw new Error(tagsRes.error);

      setFile(new File({ ...fileSchema, tags: tagsRes.data.items }));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load file");
    } finally {
      setIsLoading(false);
    }
  };

  const openFileLocation = () => shell.showItemInFolder(file.path);

  const openThumbLocation = () => shell.showItemInFolder(file.thumb.path);

  return (
    <Modal.Container width="100%" maxWidth="50rem" onClose={handleClose} isLoading={isLoading}>
      <Modal.Header
        leftNode={<IdButton value={stores.file.activeFileId} />}
        rightNode={
          file?.isCorrupted && (
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
