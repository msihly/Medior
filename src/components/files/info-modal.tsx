import { shell } from "@electron/remote";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, Detail, DetailRow, Modal, SideScroller, Tag, Text, View } from "components";
import { colors, dayjs, formatBytes, makeClasses } from "utils";
import { toast } from "react-toastify";

export const InfoModal = observer(() => {
  const { css } = useClasses(null);

  const { fileStore } = useStores();
  const file = fileStore.getById(fileStore.activeFileId);

  const handleClose = () => fileStore.setIsInfoModalOpen(false);

  const handleCurrentPath = () => shell.showItemInFolder(file.path);

  const handleRefresh = async () => {
    const res = await fileStore.refreshFile({ id: fileStore.activeFileId });
    if (!res.success) toast.error("Failed to refresh info");
    else toast.success("File info refreshed");
  };

  return (
    <Modal.Container width="100%" maxWidth="50rem" onClose={handleClose}>
      <Modal.Header
        leftNode={
          <Text fontSize="0.7em" color={colors.grey["600"]}>
            {`ID: ${fileStore.activeFileId}`}
          </Text>
        }
      >
        <Text>{"File Info"}</Text>
      </Modal.Header>

      <Modal.Content dividers className={css.content}>
        <DetailRow>
          <Detail label="Original File Name" value={file?.originalName || "N/A"} withTooltip />

          <Detail label="Extension" value={file?.ext || "N/A"} />
        </DetailRow>

        <DetailRow>
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
              ) : (
                "N/A"
              )
            }
          />

          <Detail label="Original Path" value={file?.originalPath || "N/A"} withTooltip />
        </DetailRow>

        <DetailRow>
          <Detail label="Hash" value={file?.hash || "N/A"} />

          <Detail label="Original Hash" value={file?.originalHash || "N/A"} />
        </DetailRow>

        <DetailRow>
          <Detail label="Size" value={formatBytes(file?.size)} />

          <Detail
            label="Dimensions"
            value={`${file.width} x ${file.height}`}
            valueProps={{
              tooltip: (
                <DetailRow>
                  <Detail label="Width" value={file.width} />
                  <Detail label="Height" value={file.height} />
                </DetailRow>
              ),
            }}
          />

          <Detail
            label="Duration"
            value={file?.duration ? dayjs.duration(file.duration, "s").format("HH:mm:ss") : "N/A"}
          />

          <Detail label="Frame Rate" value={file?.frameRate || "N/A"} />
        </DetailRow>

        <DetailRow>
          <Detail
            label="Date Created"
            value={dayjs(file?.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") || "N/A"}
          />

          <Detail
            label="Date Modified"
            value={dayjs(file?.dateModified).format("MMMM D, YYYY - hh:mm:ss a") || "N/A"}
          />
        </DetailRow>

        {file?.tagIds?.length > 0 && (
          <Detail
            label="Tags"
            value={
              <SideScroller innerClassName={css.tags}>
                {file.tagIds.map((tagId) => (
                  <Tag key={tagId} id={tagId} size="small" />
                ))}
              </SideScroller>
            }
          />
        )}

        {file?.diffusionParams?.length > 0 && (
          <Detail
            label="Diffusion Params"
            value={
              <View className={css.diffContainer}>
                <Text>{file.diffusionParams}</Text>
              </View>
            }
          />
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.red["800"]} />

        <Button text="Refresh" icon="Refresh" onClick={handleRefresh} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  content: {
    "& > *:not(:last-child)": {
      marginBottom: "0.4rem",
    },
  },
  diffContainer: {
    borderRadius: "0.25rem",
    padding: "0.4rem 0.6rem",
    backgroundColor: colors.grey["800"],
  },
  link: {
    alignSelf: "flex-start",
    fontSize: "1em",
    lineHeight: "1.5em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tags: {
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    height: "1.8rem",
  },
});
