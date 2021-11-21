import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  colors,
} from "@mui/material";
import { makeStyles } from "utils";
import { Button } from "components/buttons";
import dayjs from "dayjs";
import { formatBytes } from "utils";

const InfoModal = ({ image, setVisible, visible }) => {
  const { classes: css } = useClasses();

  return (
    <Dialog open={visible} onClose={() => setVisible(false)} scroll="paper">
      <DialogTitle className={css.title}>Info</DialogTitle>

      <DialogContent dividers={true}>
        <div className={css.row}>
          <div className={css.labels}>
            <Typography>ID</Typography>
            <Typography>Name</Typography>
            <Typography>New Path</Typography>
            <Typography>Original Path</Typography>
            <Typography>Size</Typography>
            <Typography>Date Created</Typography>
          </div>

          <div className={css.values}>
            <Typography noWrap>{image.fileId ?? "N/A"}</Typography>
            <Typography noWrap>{image.originalName ?? "N/A"}</Typography>
            <Typography noWrap>{image.path ?? "N/A"}</Typography>
            <Typography noWrap>{image.originalPath ?? "N/A"}</Typography>
            <Typography noWrap>{formatBytes(image.size)}</Typography>
            <Typography noWrap>
              {dayjs(image.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") ?? "N/A"}
            </Typography>
          </div>
        </div>
      </DialogContent>

      <DialogActions className={css.buttons}>
        <Button onClick={() => setVisible(false)} className={css.closeButton}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InfoModal;

const useClasses = makeStyles()({
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
