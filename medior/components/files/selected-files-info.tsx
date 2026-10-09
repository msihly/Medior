import { useState } from "react";
import { Button, Comp, Icon, IconName, ProgressCircle, Text, View } from "medior/components";
import { colors, CssColor, useCancellableLoad } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { getIsVideo, trpc } from "medior/utils/server";

export const useFileInfo = () => {
  const load = useCancellableLoad();

  const [totalFiles, setTotalFiles] = useState(0);
  const [totalFilesSize, setTotalFilesSize] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [totalImagesSize, setTotalImagesSize] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  const [totalVideosSize, setTotalVideosSize] = useState(0);

  const loadFileInfo = (fileIds: string[]) =>
    load.run(async (signal) => {
      const res = await trpc.listFile.mutate({ args: { filter: { id: fileIds } } }, { signal });

      signal.throwIfAborted();

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
    });

  const renderFileInfo = () => (
    <View column padding={{ all: "0.4rem 0.8rem" }}>
      {load.isLoading ? (
        <View row align="center" spacing="0.5rem">
          <ProgressCircle color="inherit" size={20} variant="indeterminate" />

          <Button text="Cancel" icon="Close" onClick={load.cancel} />
        </View>
      ) : (
        <>
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
        </>
      )}
    </View>
  );

  return { loadFileInfo, renderFileInfo };
};

const FileTypeRow = Comp(
  (props: { color: CssColor; count: number; icon: IconName; label: string; size: number }) => {
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
