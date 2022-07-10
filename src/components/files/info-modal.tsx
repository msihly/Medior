import { Dialog, DialogTitle, DialogContent, DialogActions, colors } from "@mui/material";
import { Button, Text } from "components";
import { formatBytes, makeClasses } from "utils";
import dayjs from "dayjs";

const InfoModal = ({ file, setVisible }) => {
  const { classes: css } = useClasses(null);

  const handleClose = () => setVisible(false);

  return (
    <Dialog open={true} onClose={handleClose} scroll="paper">
      <DialogTitle className={css.title}>Info</DialogTitle>

      <DialogContent dividers={true}>
        <div className={css.row}>
          <div className={css.labels}>
            <Text>ID</Text>
            <Text>Name</Text>
            <Text>New Path</Text>
            <Text>Original Path</Text>
            <Text>Size</Text>
            <Text>Date Created</Text>
          </div>

          <div className={css.values}>
            <Text noWrap>{file?.fileId || "N/A"}</Text>
            <Text noWrap>{file?.originalName || "N/A"}</Text>
            <Text noWrap>{file?.path || "N/A"}</Text>
            <Text noWrap>{file?.originalPath || "N/A"}</Text>
            <Text noWrap>{formatBytes(file?.size)}</Text>
            <Text noWrap>
              {dayjs(file?.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") || "N/A"}
            </Text>
          </div>
        </div>
      </DialogContent>

      <DialogActions className={css.buttons}>
        <Button onClick={handleClose} className={css.closeButton}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

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
  title: {
    padding: "0.4em",
    textAlign: "center",
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
  values: {
    display: "flex",
    flexFlow: "column nowrap",
    padding: "0.5rem",
    maxWidth: "32rem",
    overflow: "hidden",
  },
  row: {
    display: "flex",
    flexFlow: "row nowrap",
  },
});
