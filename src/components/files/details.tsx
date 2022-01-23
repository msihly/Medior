import { shell } from "electron";
import { Paper } from "@mui/material";
import { Text } from "components";
import { ContextMenu } from ".";
import { formatBytes, makeStyles } from "utils";
import dayjs from "dayjs";

const FileDetails = ({ file }) => {
  const { classes: css } = useClasses();

  const openFile = () => shell.openPath(file.path);

  return (
    <ContextMenu file={file} className={`${css.container} selectable`}>
      <Paper onDoubleClick={openFile} elevation={3} className={css.paper}>
        <img src={file.path} className={css.image} alt={file.originalName} />

        <div className={css.labels}>
          <Text>ID</Text>
          <Text>Name</Text>
          <Text>New Path</Text>
          <Text>Original Path</Text>
          <Text>Size</Text>
          <Text>Date Created</Text>
        </div>

        <div className={css.values}>
          <Text noWrap>{file.fileId || "N/A"}</Text>
          <Text noWrap>{file.originalName || "N/A"}</Text>
          <Text noWrap>{file.path || "N/A"}</Text>
          <Text noWrap>{file.originalPath || "N/A"}</Text>
          <Text noWrap>{formatBytes(file.size)}</Text>
          <Text noWrap>{dayjs(file.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") || "N/A"}</Text>
        </div>
      </Paper>
    </ContextMenu>
  );
};

export default FileDetails;

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
