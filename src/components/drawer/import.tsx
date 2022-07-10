import { observer } from "mobx-react-lite";
import { FileImportSnapshot } from "store/imports";
import { colors } from "@mui/material";
import { Icon, Text, View } from "components";
import { makeClasses } from "utils";

const STATUSES = {
  COMPLETE: {
    icon: "CheckCircle",
    color: colors.green["700"],
  },
  DUPLICATE: {
    icon: "ControlPointDuplicate",
    color: colors.amber["700"],
  },
  ERROR: {
    icon: "Error",
    color: colors.red["800"],
  },
  PENDING: {
    icon: "Pending",
    color: colors.blueGrey["600"],
  },
};

interface ImportProps {
  fileImport: FileImportSnapshot;
}

const Import = observer(({ fileImport }: ImportProps) => {
  const { classes: css } = useClasses(null);

  const status = STATUSES[fileImport.status];

  return (
    <View className={css.card}>
      <Icon name={status?.icon} color={status?.color} size={30} className={css.icon} />

      <View column className={css.body}>
        <Text noWrap fontSize={18}>
          {`${fileImport.name}${fileImport.extension}`}
        </Text>

        <Text noWrap fontSize={12}>
          {fileImport.path.slice(0, fileImport.path.lastIndexOf("\\"))}
        </Text>
      </View>
    </View>
  );
});

export default Import;

const useClasses = makeClasses({
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
  icon: {
    marginRight: "0.5rem",
  },
});
