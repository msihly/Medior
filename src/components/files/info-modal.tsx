import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, SideScroller, Tag, Text, View } from "components";
import { dayjs, formatBytes, makeClasses } from "utils";

interface InfoModalProps {
  fileId: string;
  setVisible: (visible: boolean) => void;
}

const InfoModal = observer(({ fileId, setVisible }: InfoModalProps) => {
  const { classes: css } = useClasses(null);

  const { fileStore } = useStores();
  const file = fileStore.getById(fileId);

  const handleClose = () => setVisible(false);

  return (
    <Dialog open={true} onClose={handleClose} scroll="paper">
      <DialogTitle className={css.title}>Info</DialogTitle>

      <DialogContent dividers={true}>
        <View className={css.row}>
          <View className={css.labels}>
            <Text>ID</Text>
            <Text>Name</Text>
            <Text>New Path</Text>
            <Text>Original Path</Text>
            <Text>Hash</Text>
            <Text>Size</Text>
            <Text>Duration</Text>
            <Text>Date Created</Text>
            <Text>Tags</Text>
          </View>

          <View className={css.values}>
            <Text noWrap>{fileId || "N/A"}</Text>
            <Text noWrap>{file?.originalName || "N/A"}</Text>
            <Text noWrap>{file?.path || "N/A"}</Text>
            <Text noWrap>{file?.originalPath || "N/A"}</Text>
            <Text noWrap>{file?.hash || "N/A"}</Text>
            <Text noWrap>{formatBytes(file?.size)}</Text>
            <Text noWrap>
              {file?.duration ? dayjs.duration(file.duration, "s").format("HH:mm:ss") : "N/A"}
            </Text>
            <Text noWrap>
              {dayjs(file?.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") || "N/A"}
            </Text>

            {file?.tags?.length > 0 ? (
              <SideScroller>
                <View className={css.tags}>
                  {file.tags.map((t) => (
                    <Tag key={t.id} id={t.id} size="small" />
                  ))}
                </View>
              </SideScroller>
            ) : (
              <Text>{"N/A"}</Text>
            )}
          </View>
        </View>
      </DialogContent>

      <DialogActions className={css.buttons}>
        <Button text="Close" icon="Close" onClick={handleClose} className={css.closeButton} />
      </DialogActions>
    </Dialog>
  );
});

export default InfoModal;

const useClasses = makeClasses({
  buttons: {
    justifyContent: "center",
  },
  closeButton: {
    backgroundColor: colors.red["800"],
    "&:hover": {
      backgroundColor: colors.red["700"],
    },
  },
  labels: {
    display: "flex",
    flexFlow: "column nowrap",
    padding: "0.5rem",
    width: "8rem",
    "& .MuiTypography-root": {
      fontWeight: "bold",
      whiteSpace: "nowrap",
    },
  },
  row: {
    display: "flex",
    flexFlow: "row nowrap",
  },
  tags: {
    display: "flex",
    flexFlow: "row nowrap",
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    height: "1.8rem",
    overflowY: "hidden",
    overflowX: "auto",
    "&::-webkit-scrollbar": {
      display: "none",
      height: "4px",
    },
    "&::-webkit-scrollbar-thumb": {
      background: colors.grey["600"],
    },
  },
  title: {
    padding: "0.4em",
    textAlign: "center",
  },
  values: {
    display: "flex",
    flexFlow: "column nowrap",
    padding: "0.5rem",
    maxWidth: "32rem",
    overflow: "hidden",
  },
});
