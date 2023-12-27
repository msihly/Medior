import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { CenteredText, View } from "components";
import { FileCard } from ".";
import { makeClasses } from "utils";

export const DisplayedFiles = observer(() => {
  const { css } = useClasses(null);

  const { fileStore } = useStores();

  return fileStore.files.length > 0 ? (
    <View className={css.fileContainer}>
      {fileStore.files.map((f) => (
        <FileCard key={f.id} file={f} />
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
    "& > *": {
      overflow: "hidden",
      flexBasis: "calc(100% / 6)",
      [theme.breakpoints.down("xl")]: { flexBasis: "calc(100% / 5)" },
      [theme.breakpoints.down("lg")]: { flexBasis: "calc(100% / 4)" },
      [theme.breakpoints.down("md")]: { flexBasis: "calc(100% / 3)" },
      [theme.breakpoints.down("sm")]: { flexBasis: "calc(100% / 2)" },
    },
  },
}));
