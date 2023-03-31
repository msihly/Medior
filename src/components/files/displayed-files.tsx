import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { colors } from "@mui/material";
import { Text, View } from "components";
import { FileCard } from ".";
import { makeClasses } from "utils";

export const DisplayedFiles = observer(() => {
  const { css } = useClasses(null);

  const { fileStore } = useStores();

  return (
    <>
      {fileStore.displayed?.length > 0 ? (
        fileStore.displayed.map((f) => <FileCard key={f.id} file={f} />)
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
