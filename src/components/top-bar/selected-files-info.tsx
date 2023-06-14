import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Chip, Tooltip, colors } from "@mui/material";
import { Text, View } from "components";
import { formatBytes, makeClasses } from "utils";

export const SelectedFilesInfo = observer(() => {
  const { css } = useClasses(null);

  const { fileStore } = useStores();

  const [totalImages, totalSize, totalVideos] = useMemo(() => {
    return fileStore.selected.reduce(
      (acc, cur) => {
        acc[cur.isVideo ? 2 : 0]++;
        acc[1] += cur.size;
        return acc;
      },
      [0, 0, 0]
    );
  }, [fileStore.selectedIds]);

  return (
    <Tooltip
      arrow
      classes={{ arrow: css.arrow, tooltip: css.tooltip }}
      title={
        <View column>
          <View className={css.valueRow}>
            <Text className={css.label}>{"Total Size:"}</Text>
            <Text className={css.value}>{formatBytes(totalSize)}</Text>
          </View>

          <View className={css.valueRow}>
            <Text className={css.label}>{"Images:"}</Text>
            <Text className={css.value}>{totalImages}</Text>
          </View>

          <View className={css.valueRow}>
            <Text className={css.label}>{"Videos:"}</Text>
            <Text className={css.value}>{totalVideos}</Text>
          </View>
        </View>
      }
    >
      <Chip label={`${fileStore.selectedIds.length} Selected`} />
    </Tooltip>
  );
});

const useClasses = makeClasses({
  arrow: {
    color: colors.blue["900"],
    paddingBottom: "4px",
  },
  header: {
    justifyContent: "space-between",
    padding: "0.3rem",
    fontSize: "1.1em",
  },
  label: {
    marginRight: "0.5em",
    fontSize: 16,
    fontWeight: 500,
  },
  tooltip: {
    borderTop: `4px solid ${colors.blue["900"]}`,
    minWidth: "11rem",
    backgroundColor: colors.grey["900"],
    boxShadow: "rgb(0 0 0 / 80%) 1px 2px 4px 0px",
  },
  value: {
    fontSize: 16,
  },
  valueRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
