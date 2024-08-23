import { observer } from "medior/store";
import { View } from "medior/components";
import { colors, makeClasses } from "medior/utils";

export const HMR = observer(() => {
  const { css } = useClasses(null);

  return (
    <View column className={css.root}>
      <View className={css.container}></View>
    </View>
  );
});

const useClasses = makeClasses({
  container: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "0.5rem",
    margin: "1rem",
    padding: "1rem",
    height: "100%",
    backgroundColor: colors.foreground,
    overflow: "auto",
  },
  root: {
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
  },
});
