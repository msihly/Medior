import { shell } from "@electron/remote";
import { observer } from "mobx-react-lite";
import { FileImport, useStores } from "store";
import { Tooltip, colors } from "@mui/material";
import { Icon, IMPORT_STATUSES, openFile, Text, View } from "components";
import { makeClasses } from "utils";

interface ImportProps {
  fileImport: FileImport;
}

export const Import = observer(({ fileImport }: ImportProps) => {
  const { css } = useClasses(null);
  const { fileStore } = useStores();

  const dir = fileImport.path.slice(0, fileImport.path.lastIndexOf("\\"));
  const hasFileId = fileImport.fileId?.length > 0 && fileStore.getById(fileImport.fileId);
  const status = IMPORT_STATUSES[fileImport.status];

  const handleClick = () =>
    hasFileId
      ? openFile({
          file: fileStore.getById(fileImport.fileId),
          filteredFileIds: fileStore.filteredFileIds,
        })
      : shell.showItemInFolder(fileImport.path);

  return (
    <View row className={css.card}>
      <Tooltip
        arrow
        placement="bottom-start"
        classes={{ arrow: css.arrow, tooltip: css.tooltip }}
        title={fileImport.errorMsg}
      >
        <View column justify="center">
          <Icon name={status?.icon} color={status?.color} size={30} className={css.icon} />
        </View>
      </Tooltip>

      <View column className={css.body}>
        <Text noWrap fontSize={18}>
          {fileImport.name}
        </Text>

        <Text onClick={handleClick} noWrap fontSize={12} className={css.clickTarget}>
          {hasFileId ? fileImport.fileId : dir}
        </Text>
      </View>
    </View>
  );
});

const useClasses = makeClasses({
  arrow: {
    color: colors.grey["900"],
  },
  body: {
    overflow: "hidden",
  },
  card: {
    alignItems: "center",
    borderRadius: "0.5rem",
    marginBottom: "0.5rem",
    padding: "0.5rem",
    backgroundColor: colors.grey["800"],
  },
  clickTarget: {
    color: colors.grey["400"],
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      color: colors.grey["100"],
    },
  },
  icon: {
    marginRight: "0.5rem",
  },
  tooltip: {
    minWidth: "20rem",
    maxWidth: "25rem",
    backgroundColor: colors.grey["900"],
    boxShadow: "rgb(0 0 0 / 80%) 1px 2px 4px 0px",
  },
});
