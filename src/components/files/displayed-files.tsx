import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { CircularProgress } from "@mui/material";
import { Text, View } from "components";
import { FileCard } from ".";
import { colors, makeClasses } from "utils";

export const DisplayedFiles = observer(() => {
  const { css } = useClasses(null);

  const { fileStore } = useStores();

  return (
    <>
      {fileStore.files.length > 0 ? (
        <View className={css.fileContainer}>
          {fileStore.files.map((f) => (
            <FileCard key={f.id} file={f} />
          ))}
        </View>
      ) : fileStore.filteredFileIds.length > 0 ? (
        <View className={css.centeredContainer}>
          <CircularProgress size="3rem" />

          <Text variant="h3" color={colors.grey["400"]} marginTop="2rem">
            {"Loading..."}
          </Text>
        </View>
      ) : (
        <View className={css.centeredContainer}>
          <Text variant="h3" color={colors.grey["400"]}>
            {"No results found"}
          </Text>
        </View>
      )}
    </>
  );
});

const useClasses = makeClasses((theme) => ({
  centeredContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
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
