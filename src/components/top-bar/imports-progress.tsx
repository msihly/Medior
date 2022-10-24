import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { Text, View } from "components";
import { makeClasses } from "utils";

export const ImportsProgress = observer(() => {
  const { classes: css } = useClasses(null);

  const { fileStore, importStore } = useStores();

  return importStore.isImporting ? (
    <View column>
      <Text className={css.title}>
        <Text className={css.title} bold>
          {"Importing: "}
        </Text>
        {`${importStore.completedBatches.length + 1} of ${importStore.importBatches.length}`}
      </Text>

      <Text className={css.subtitle}>
        <Text className={css.subtitle} bold>
          {"Total Completed: "}
        </Text>
        {importStore.completedBatches.length}
      </Text>
    </View>
  ) : (
    <View column>
      <Text className={css.title}>
        <Text className={css.title} bold>
          {"Images: "}
        </Text>
        {fileStore.images.length}
      </Text>

      <Text className={css.subtitle}>
        <Text className={css.subtitle} bold>
          {"Videos: "}
        </Text>
        {fileStore.videos.length}
      </Text>
    </View>
  );
});

const useClasses = makeClasses({
  subtitle: {
    color: colors.grey["500"],
    fontSize: 13,
  },
  title: {
    color: colors.grey["300"],
    fontSize: 14,
  },
});
