import { observer } from "mobx-react-lite";
import { View } from "components";
import { colors, makeClasses } from "utils";
import Color from "color";

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
    backgroundColor: Color(colors.grey["800"]).fade(0.8).string(),
  },
  root: {
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
  },
});
