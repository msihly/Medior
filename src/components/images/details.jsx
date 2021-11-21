import React from "react";
import { shell } from "electron";
import dayjs from "dayjs";
import { formatBytes } from "utils";
import { Paper, Typography } from "@mui/material";
import { makeStyles } from "utils";
import { ContextMenu } from "./";

const ImageDetails = ({ image }) => {
  const { classes: css } = useClasses();

  const openFile = () => shell.openPath(image.path);

  return (
    <ContextMenu image={image} className={`${css.container} selectable`}>
      <Paper onDoubleClick={openFile} elevation={3} className={css.paper}>
        <img src={image.path} className={css.image} alt={image.originalName} />

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
      </Paper>
    </ContextMenu>
  );
};

export default ImageDetails;

const useClasses = makeStyles()({
  container: {
    overflow: "hidden",
    cursor: "pointer",
    height: "fit-content",
  },
  paper: {
    display: "flex",
    flexFlow: "row nowrap",
    marginBottom: "0.5rem",
    maxWidth: "min(55rem, 100vw)",
    width: "auto",
    height: "10rem",
  },
  image: {
    minWidth: "16rem",
    width: "16rem",
    minHeight: "100%",
    objectFit: "cover",
    borderTopLeftRadius: "inherit",
    borderBottomLeftRadius: "inherit",
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
});
