import { observer, useStores } from "src/store";
import { CenteredText, View } from "src/components";
import { TagCard } from ".";
import { makeClasses } from "src/utils";

export const DisplayedTags = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  return stores.tagManager.tags.length > 0 ? (
    <View className={css.fileContainer}>
      {stores.tagManager.tags.map((t) => (
        <TagCard key={t.id} tag={t} />
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
    padding: "0.3rem 0.3rem 3rem",
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
