import path from "path";
import { shell } from "@electron/remote";
import { observer, useStores } from "medior/store";
import {
  Button,
  Card,
  DateDetail,
  Detail,
  IdButton,
  Modal,
  TagRow,
  Text,
  UniformList,
} from "medior/components";
import { colors, duration, formatBytes, makeClasses } from "medior/utils";
import { toast } from "react-toastify";

export const InfoModal = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();
  const file = stores.collection.editor.isOpen
    ? stores.collection.editor.getFileById(stores.file.activeFileId)
    : stores.file.getById(stores.file.activeFileId);

  const handleClose = () => stores.file.setIsInfoModalOpen(false);

  const handleCurrentPath = () => shell.showItemInFolder(file.path);

  const handleRefresh = async () => {
    const res = await stores.file.refreshFile({ id: stores.file.activeFileId });
    if (!res.success) toast.error("Failed to refresh info");
    else toast.success("File info refreshed");
  };

  return (
    <Modal.Container width="100%" maxWidth="50rem" onClose={handleClose}>
      <Modal.Header leftNode={<IdButton value={stores.file.activeFileId} />}>
        <Text preset="title">{"File Info"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
        <UniformList row>
          <Detail label="Extension" value={file?.ext} />

          <Detail label="Video Codec" value={file?.videoCodec} />

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

          <Detail label="Duration" value={duration(file?.duration)} />

          <Detail label="Frame Rate" value={file?.frameRate} />
        </UniformList>

        <Detail label="Original File Name" value={file?.originalName} withTooltip />

        <Detail
          label="Original Folder"
          value={file?.originalPath ? path.dirname(file.originalPath) : null}
          withTooltip
        />

        <Detail
          label="Current Path"
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

        <UniformList row>
          <Detail label="Hash" value={file?.hash} />
          <Detail label="Original Hash" value={file?.originalHash} />
        </UniformList>

        <UniformList row>
          <DateDetail label="Date Created" value={file?.dateCreated} />
          <DateDetail label="Date Modified" value={file?.dateModified} />
        </UniformList>

        {file?.tagIds?.length > 0 && (
          <Detail label="Tags" value={<TagRow tagIds={file.tagIds} />} />
        )}

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
