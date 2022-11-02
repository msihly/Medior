import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { Text, View } from "components";
import { FileGrid } from "./";
import { makeClasses } from "utils";

export const DisplayedFiles = observer(() => {
  const { css } = useClasses(null);

  const { homeStore } = useStores();

  return (
    <>
      {homeStore.displayedFiles?.length > 0 ? (
        homeStore.displayedFiles.map((f) => <FileGrid key={f.id} file={f} />)
      ) : (
        <View className={css.noResults}>
          <Text variant="h5" color={colors.grey["400"]}>
            {"No results found"}
          </Text>
        </View>
      )}
    </>
  );
});

const useClasses = makeClasses({
  noResults: {
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
