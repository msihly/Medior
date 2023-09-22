import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Chip, Tooltip, colors } from "@mui/material";
import { Text, View } from "components";
import { VIDEO_EXT_REG_EXP, formatBytes, makeClasses } from "utils";
import { toast } from "react-toastify";

export const SelectedFilesInfo = observer(() => {
  const { css } = useClasses(null);

  const { fileStore } = useStores();

  const [totalImages, setTotalImages] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);

  const handleOpen = async () => {
    try {
      const res = await fileStore.loadFiles({
        fileIds: fileStore.selectedIds,
        withOverwrite: false,
      });
      if (!res?.success) throw new Error(res.error);
      const selectedFiles = res.data;

      const [images, videos, size] = selectedFiles.reduce(
        (acc, cur) => {
          acc[VIDEO_EXT_REG_EXP.test(cur.ext) ? 1 : 0]++;
          acc[2] += cur.size;
          return acc;
        },
        [0, 0, 0]
      );

      setTotalImages(images);
      setTotalVideos(videos);
      setTotalSize(size);
    } catch (err) {
      console.error(err);
      toast.error("Error loading selected files' info");
      setTotalImages(0);
      setTotalVideos(0);
      setTotalSize(0);
    }
  };

  return (
    <Tooltip
      arrow
      classes={{ arrow: css.arrow, tooltip: css.tooltip }}
      onOpen={handleOpen}
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
