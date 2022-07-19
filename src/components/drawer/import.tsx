import { observer } from "mobx-react-lite";
import { FileImportSnapshot } from "store/imports";
import { colors } from "@mui/material";
import { Icon, IMPORT_STATUSES, Text, View } from "components";
import { makeClasses } from "utils";

interface ImportProps {
  fileImport: FileImportSnapshot;
}

const Import = observer(({ fileImport }: ImportProps) => {
  const { classes: css } = useClasses(null);

  const status = IMPORT_STATUSES[fileImport.status];

  return (
    <View row className={css.card}>
      <Icon name={status?.icon} color={status?.color} size={30} className={css.icon} />

      <View column className={css.body}>
        <Text noWrap fontSize={18}>
          {fileImport.name}
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
