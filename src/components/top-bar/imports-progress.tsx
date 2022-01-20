import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Text, View } from "components";
import { makeStyles } from "utils";
import { colors } from "@mui/material";

const ImportsProgress = observer(() => {
  const { fileStore } = useStores();
  const { classes: css } = useClasses();

  return (
    <View column>
      <Text className={css.title}>
        <Text className={css.title} bold>
          Total Files:
        </Text>
        {` ${fileStore.files.length}`}
      </Text>

      <Text className={css.subtitle}>
        <Text className={css.subtitle} bold>
          Duplicates:
        </Text>
        {` ${fileStore.duplicates.length}`}
      </Text>
    </View>
  );
});

export default ImportsProgress;

const useClasses = makeStyles()({
  subtitle: {
    color: colors.grey["500"],
    fontSize: 13,
  },
  title: {
    color: colors.grey["300"],
    fontSize: 14,
  },
});
