import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, DetailRows, SideScroller, Tag, Text, View } from "components";
import { dayjs, formatBytes, makeClasses } from "utils";
import { refreshFile } from "database";
import { toast } from "react-toastify";

interface InfoModalProps {
  fileId: string;
  setVisible: (visible: boolean) => void;
}

const InfoModal = observer(({ fileId, setVisible }: InfoModalProps) => {
  const { classes: css } = useClasses(null);

  const { fileStore } = useStores();
  const file = fileStore.getById(fileId);

  const handleClose = () => setVisible(false);

  const handleRefresh = async () => {
    const res = await refreshFile(fileStore, fileId);
    if (res === null) toast.error("Failed to refresh info");
    else toast.success("File info refreshed");
  };

  return (
    <Dialog open={true} onClose={handleClose} scroll="paper">
      <DialogTitle className={css.title}>Info</DialogTitle>

      <DialogContent dividers>
        <DetailRows
          labelWidth="6em"
          rows={[
            { label: "ID", value: fileId || "N/A" },
            { label: "Name", value: file?.originalName || "N/A" },
            { label: "Path", value: file?.path || "N/A" },
            { label: "Original Path", value: file?.originalPath || "N/A" },
            { label: "Extension", value: file?.ext || "N/A" },
            { label: "Hash", value: file?.hash || "N/A" },
            { label: "Original Hash", value: file?.originalHash || "N/A" },
            { label: "Size", value: formatBytes(file?.size) },
            { label: "Dimensions", value: `${file.width}x${file.height}` },
            {
              label: "Duration",
              value: file?.duration ? dayjs.duration(file.duration, "s").format("HH:mm:ss") : "N/A",
            },
            {
              label: "Frame Rate",
              value: file?.frameRate || "N/A",
            },
            {
              label: "Date Created",
              value: dayjs(file?.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") || "N/A",
            },
            {
              label: "Date Modified",
              value: dayjs(file?.dateModified).format("MMMM D, YYYY - hh:mm:ss a") || "N/A",
            },
            {
              label: "Tags",
              value:
                file?.tags?.length > 0 ? (
                  <SideScroller innerClassName={css.tags}>
                    {file.tags.map((t) => (
                      <Tag key={t.id} id={t.id} size="small" />
                    ))}
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

        <Button text="Refresh" icon="Refresh" onClick={handleRefresh} />
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
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    height: "1.8rem",
  },
  title: {
    padding: "0.4em",
    textAlign: "center",
  },
});
