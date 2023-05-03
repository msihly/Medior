import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { sortFiles, useStores } from "store";
import { CircularProgress, colors } from "@mui/material";
import { Text, View } from "components";
import { FileCard } from ".";
import { makeClasses } from "utils";

export const DisplayedFiles = observer(() => {
  const { css } = useClasses(null);

  const { fileStore, homeStore } = useStores();

  const displayed = useMemo(() => {
    return fileStore.displayed?.length > 0
      ? [...fileStore.displayed].sort((a, b) =>
          sortFiles({ a, b, isSortDesc: homeStore.isSortDesc, sortKey: homeStore.sortKey })
        )
      : [];
  }, [fileStore.displayed]);

  return (
    <>
      {displayed.length > 0 ? (
        displayed.map((f) => <FileCard key={f.id} file={f} />)
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
