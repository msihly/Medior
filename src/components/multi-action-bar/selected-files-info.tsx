import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Chip, Text, Tooltip, View } from "components";
import { formatBytes, getConfig, makeClasses } from "utils";
import { toast } from "react-toastify";

export const SelectedFilesInfo = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const [totalImages, setTotalImages] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);

  const handleOpen = async () => {
    try {
      const res = await stores.file.loadFiles({
        fileIds: stores.file.selectedIds,
        withOverwrite: false,
      });
      if (!res?.success) throw new Error(res.error);
      const selectedFiles = res.data;

      const videoExtRegExp = new RegExp(`${getConfig().file.videoTypes.join("|")}`, "i");

      const [images, videos, size] = selectedFiles.reduce(
        (acc, cur) => {
          acc[videoExtRegExp.test(cur.ext) ? 1 : 0]++;
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
      onOpen={handleOpen}
      minWidth="11rem"
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
      <Chip label={`${stores.file.selectedIds.length} Selected`} />
    </Tooltip>
  );
});

const useClasses = makeClasses({
  label: {
    marginRight: "0.5em",
    fontSize: 16,
    fontWeight: 500,
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
