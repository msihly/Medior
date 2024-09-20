import { useState } from "react";
import { observer, useStores } from "medior/store";
import { Chip, Detail, Tooltip, UniformList, View } from "medior/components";
import { formatBytes, getConfig, trpc } from "medior/utils";
import { toast } from "react-toastify";

export const SelectedFilesInfo = observer(() => {
  const stores = useStores();

  const [totalImages, setTotalImages] = useState(0);
  const [totalImagesSize, setTotalImagesSize] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  const [totalVideosSize, setTotalVideosSize] = useState(0);

  const handleOpen = async () => {
    try {
      const res = await trpc.listFiles.mutate({
        args: { filter: { id: stores.file.selectedIds } },
      });
      if (!res?.success) throw new Error(res.error);
      const selectedFiles = res.data.items;

      const videoExtRegExp = new RegExp(`${getConfig().file.videoTypes.join("|")}`, "i");

      const [images, videos, imagesSize, videosSize] = selectedFiles.reduce(
        (acc, cur) => {
          const isVideo = videoExtRegExp.test(cur.ext);
          acc[isVideo ? 1 : 0]++;
          acc[isVideo ? 3 : 2] += cur.size;
          return acc;
        },
        [0, 0, 0, 0]
      );

      setTotalImages(images);
      setTotalImagesSize(imagesSize);
      setTotalSize(imagesSize + videosSize);
      setTotalVideos(videos);
      setTotalVideosSize(videosSize);
    } catch (err) {
      console.error(err);
      toast.error("Error loading selected files' info");
      setTotalImages(0);
      setTotalImagesSize(0);
      setTotalSize(0);
      setTotalVideos(0);
      setTotalVideosSize(0);
    }
  };

  return (
    <Tooltip
      onOpen={handleOpen}
      minWidth="11rem"
      title={
        <View column>
          <UniformList row spacing="1rem">
            <View column>
              <Detail label="Images" value={totalImages} />
              <Detail label="Images Size" value={formatBytes(totalImagesSize)} />
            </View>

            <View column>
              <Detail label="Videos" value={totalVideos} />
              <Detail label="Videos Size" value={formatBytes(totalVideosSize)} />
            </View>
          </UniformList>

          <Detail label="Total Size" value={formatBytes(totalSize)} />
        </View>
      }
    >
      <Chip label={`${stores.file.selectedIds.length} Selected`} />
    </Tooltip>
  );
});
