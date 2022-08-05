import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, DetailRows, SideScroller, Tag, Text, View } from "components";
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
        <DetailRows
          labelWidth="6em"
          rows={[
            { label: "ID", value: fileId || "N/A" },
            { label: "Name", value: file?.originalName || "N/A" },
            { label: "New Path", value: file?.path || "N/A" },
            { label: "Original Path", value: file?.originalPath || "N/A" },
            { label: "Hash", value: file?.hash || "N/A" },
            { label: "Size", value: formatBytes(file?.size) },
            { label: "Dimensions", value: `${file.width}x${file.height}` },
            {
              label: "Duration",
              value: file?.duration ? dayjs.duration(file.duration, "s").format("HH:mm:ss") : "N/A",
            },
            {
              label: "Date Created",
              value: dayjs(file?.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") || "N/A",
            },
            {
              label: "Tags",
              value:
                file?.tags?.length > 0 ? (
                  <SideScroller>
                    <View className={css.tags}>
                      {file.tags.map((t) => (
                        <Tag key={t.id} id={t.id} size="small" />
                      ))}
                    </View>
                  </SideScroller>
                ) : (
                  <Text>{"N/A"}</Text>
                ),
            },
          ]}
        />
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
});
