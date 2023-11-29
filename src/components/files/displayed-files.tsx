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
        fileStore.files.map((f) => <FileCard key={f.id} file={f} />)
      ) : fileStore.filteredFileIds.length > 0 ? (
        <View column className={css.centeredContainer}>
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

const useClasses = makeClasses({
  centeredContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
});
