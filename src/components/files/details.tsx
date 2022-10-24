import { shell } from "electron";
import { Paper } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Text, View } from "components";
import { ContextMenu } from ".";
import { dayjs, formatBytes, makeClasses } from "utils";

interface FileDetailsProps {
  id: string;
}

export const FileDetails = observer(({ id }: FileDetailsProps) => {
  const { fileStore } = useStores();
  const file = fileStore.getById(id);

  const { classes: css } = useClasses(null);

  const openFile = () => shell.openPath(file.path);

  return (
    <ContextMenu fileId={id} className={`${css.container} selectable`}>
      <Paper onDoubleClick={openFile} elevation={3} className={css.paper}>
        <img src={file.path} className={css.image} alt={file.originalName} />

        <View className={css.labels}>
          <Text>ID</Text>
          <Text>Name</Text>
          <Text>New Path</Text>
          <Text>Original Path</Text>
          <Text>Size</Text>
          <Text>Date Created</Text>
        </View>

        <View className={css.values}>
          <Text noWrap>{id || "N/A"}</Text>
          <Text noWrap>{file.originalName || "N/A"}</Text>
          <Text noWrap>{file.path || "N/A"}</Text>
          <Text noWrap>{file.originalPath || "N/A"}</Text>
          <Text noWrap>{formatBytes(file.size)}</Text>
          <Text noWrap>{dayjs(file.dateCreated).format("MMMM D, YYYY - hh:mm:ss a") || "N/A"}</Text>
        </View>
      </Paper>
    </ContextMenu>
  );
});

const useClasses = makeClasses({
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
