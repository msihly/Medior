import { observer, useStores } from "store";
import { CenteredText, View } from "components";
import { FileCollection } from ".";
import { makeClasses } from "utils";

export const DisplayedCollections = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  return stores.collection.collections.length > 0 ? (
    <View className={css.fileContainer}>
      {stores.collection.collections.map((c) => (
        <FileCollection key={c.id} id={c.id} />
      ))}
    </View>
  ) : (
    <View column flex={1}>
      <CenteredText text="No results found" />
    </View>
  );
});

const useClasses = makeClasses((theme) => ({
  fileContainer: {
    display: "flex",
    flexFlow: "row wrap",
    flex: 1,
    overflow: "auto",
    "& > *": {
      overflow: "hidden",
      flexBasis: "calc(100% / 5)",
      [theme.breakpoints.down("xl")]: { flexBasis: "calc(100% / 4)" },
      [theme.breakpoints.down("lg")]: { flexBasis: "calc(100% / 3)" },
      [theme.breakpoints.down("md")]: { flexBasis: "calc(100% / 2)" },
      [theme.breakpoints.down("sm")]: { flexBasis: "calc(100% / 1)" },
    },
  },
}));
