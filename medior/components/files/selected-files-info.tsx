import { useState } from "react";
import { Comp, Icon, IconName, LoadingOverlay, Text, UniformList, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, getIsVideo, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export const useFileInfo = () => {
  const stores = useStores();

  const [isLoading, setIsLoading] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [totalImagesSize, setTotalImagesSize] = useState(0);
  const [totalFilesSize, setTotalFilesSize] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  const [totalVideosSize, setTotalVideosSize] = useState(0);

  const loadFileInfo = async () => {
    try {
      setIsLoading(true);

      const res = await trpc.listFile.mutate({
        args: { filter: { id: stores.file.search.selectedIds } },
      });
      if (!res?.success) throw new Error(res.error);
      const selectedFiles = res.data.items;

      const [images, videos, imagesSize, videosSize] = selectedFiles.reduce(
        (acc, cur) => {
          const isVideo = getIsVideo(cur.ext);
          acc[isVideo ? 1 : 0]++;
          acc[isVideo ? 3 : 2] += cur.size;
          return acc;
        },
        [0, 0, 0, 0],
      );

      setTotalImages(images);
      setTotalImagesSize(imagesSize);
      setTotalVideos(videos);
      setTotalVideosSize(videosSize);
      setTotalFiles(images + videos);
      setTotalFilesSize(imagesSize + videosSize);
    } catch (err) {
      console.error(err);
      toast.error("Error loading selected files");
      setTotalImages(0);
      setTotalImagesSize(0);
      setTotalVideos(0);
      setTotalVideosSize(0);
      setTotalFiles(0);
      setTotalFilesSize(0);
    } finally {
      setIsLoading(false);
    }
  };

  const renderFileInfo = () => (
    <View position="relative" column>
      <LoadingOverlay isLoading={isLoading} />

      <UniformList row spacing="1rem">
        <View column>
          {totalVideos > 0 ? (
            <FileTypeRow
              label="Videos"
              icon="Videocam"
              color={colors.custom.purple}
              count={totalVideos}
              size={totalVideosSize}
            />
          ) : null}

          {totalImages > 0 ? (
            <FileTypeRow
              label="Images"
              icon="Image"
              color={colors.custom.blue}
              count={totalImages}
              size={totalImagesSize}
            />
          ) : null}

          {totalFiles > 0 ? (
            <FileTypeRow
              label="Files"
              icon="Folder"
              color={colors.custom.red}
              count={totalFiles}
              size={totalFilesSize}
            />
          ) : (
            <Text>{"No files selected"}</Text>
          )}
        </View>
      </UniformList>
    </View>
  );

  return { loadFileInfo, renderFileInfo };
};

const FileTypeRow = Comp(
  (props: { color: string; count: number; icon: IconName; label: string; size: number }) => {
    return (
      <View row height="2rem" align="center" spacing="0.5rem">
        <View row align="center" spacing="0.5rem" width="6rem">
          <Icon name={props.icon} color={props.color} />
          <Text fontWeight={600} color={props.color}>
            {props.label}
          </Text>
        </View>

        <View row flex={1} justify="space-between" spacing="1rem">
          <Text>{Fmt.commas(props.count)}</Text>
          <Text>{"-"}</Text>
          <Text>{Fmt.bytes(props.size)}</Text>
        </View>
      </View>
    );
  },
);
